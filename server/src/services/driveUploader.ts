import { google, drive_v3 } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

// ═══════════════════════════════════════════════════════════════════
// Google Drive Screenshot Uploader Service
// Uploads screenshots every 2 minutes per device to Google Drive
// Structure: {ROOT_FOLDER}/{DeviceName}/{YYYY-MM-DD}/capture_{HH-mm}.jpg
// ═══════════════════════════════════════════════════════════════════

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.join(process.cwd(), 'data', 'drive-token.json');

// Config from environment
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/drive/callback';
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const UPLOAD_INTERVAL = parseInt(process.env.SCREENSHOT_ARCHIVE_INTERVAL || '120000'); // 2 min default

// State
let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let driveClient: drive_v3.Drive | null = null;
let isAuthenticated = false;
let lastUploadPerDevice = new Map<string, number>();
const folderIdCache = new Map<string, string>(); // "deviceName/date" -> folderId

// ─── Initialization ───

function initOAuth2() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('[Drive] No GOOGLE_CLIENT_ID/SECRET configurado. Upload a Drive deshabilitado.');
    return false;
  }

  oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  // Try to load saved token
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      oauth2Client.setCredentials(tokenData);
      isAuthenticated = true;
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('[Drive] Token cargado correctamente. Upload a Drive habilitado.');

      // Set up token refresh listener
      oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          const current = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
          current.refresh_token = tokens.refresh_token;
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(current, null, 2));
        }
      });

      return true;
    }
  } catch (err) {
    console.warn('[Drive] Error cargando token:', err);
  }

  console.log('[Drive] No hay token guardado. Necesitas autorizar en /api/drive/auth');
  return false;
}

// ─── Auth Flow ───

export function getAuthUrl(): string | null {
  if (!oauth2Client) {
    initOAuth2();
  }
  if (!oauth2Client) return null;

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function handleAuthCallback(code: string): Promise<boolean> {
  if (!oauth2Client) return false;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Save token to disk
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    isAuthenticated = true;
    driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    console.log('[Drive] Autorizado exitosamente. Upload a Drive habilitado.');
    return true;
  } catch (err) {
    console.error('[Drive] Error en auth callback:', err);
    return false;
  }
}

// ─── Folder Management ───

async function getOrCreateFolder(parentId: string, folderName: string): Promise<string | null> {
  if (!driveClient) return null;

  const cacheKey = `${parentId}/${folderName}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey)!;
  }

  try {
    // Search for existing folder
    const res = await driveClient.files.list({
      q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      const folderId = res.data.files[0].id!;
      folderIdCache.set(cacheKey, folderId);
      return folderId;
    }

    // Create folder
    const folder = await driveClient.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });

    const newId = folder.data.id!;
    folderIdCache.set(cacheKey, newId);
    return newId;
  } catch (err) {
    console.error(`[Drive] Error creando/buscando carpeta "${folderName}":`, err);
    return null;
  }
}

// ─── Upload Screenshot ───

async function uploadScreenshot(deviceName: string, imageBase64: string, timestamp: Date): Promise<boolean> {
  if (!driveClient || !isAuthenticated || !ROOT_FOLDER_ID) return false;

  try {
    // Create folder structure: ROOT/DeviceName/YYYY-MM-DD/
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = timestamp.toTimeString().slice(0, 5).replace(':', '-'); // HH-mm
    const fileName = `capture_${timeStr}.jpg`;

    // Get or create device folder
    const deviceFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, safeName);
    if (!deviceFolderId) return false;

    // Get or create date folder
    const dateFolderId = await getOrCreateFolder(deviceFolderId, dateStr);
    if (!dateFolderId) return false;

    // Convert base64 to buffer (strip data:image/jpeg;base64, prefix)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload file
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    await driveClient.files.create({
      requestBody: {
        name: fileName,
        parents: [dateFolderId],
      },
      media: {
        mimeType: 'image/jpeg',
        body: stream,
      },
      fields: 'id',
    });

    return true;
  } catch (err: any) {
    // Handle auth expiration
    if (err?.code === 401 || err?.code === 403) {
      console.error('[Drive] Token expirado o sin permisos. Re-autorizar en /api/drive/auth');
      isAuthenticated = false;
    } else {
      console.error('[Drive] Error subiendo screenshot:', err?.message || err);
    }
    return false;
  }
}

// ─── Background Job: Upload every 2 minutes per device ───

let uploadIntervalId: NodeJS.Timeout | null = null;

export function startDriveUploadJob(getDevicesAndScreenshots: () => Array<{ deviceName: string; image: string }>) {
  // Initialize OAuth2
  initOAuth2();

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('[Drive] Servicio deshabilitado (sin credenciales).');
    return;
  }

  const interval = UPLOAD_INTERVAL;
  console.log(`[Drive] Background job iniciado. Intervalo: ${interval / 1000}s`);

  uploadIntervalId = setInterval(async () => {
    if (!isAuthenticated || !driveClient || !ROOT_FOLDER_ID) return;

    const devices = getDevicesAndScreenshots();
    const now = Date.now();

    for (const { deviceName, image } of devices) {
      // Rate limit: only upload if enough time has passed for this device
      const lastUpload = lastUploadPerDevice.get(deviceName) || 0;
      if (now - lastUpload < interval - 5000) continue; // 5s tolerance

      const success = await uploadScreenshot(deviceName, image, new Date());
      if (success) {
        lastUploadPerDevice.set(deviceName, now);
        console.log(`[Drive] Subido: ${deviceName} @ ${new Date().toLocaleTimeString()}`);
      }
    }
  }, interval);
}

export function stopDriveUploadJob() {
  if (uploadIntervalId) {
    clearInterval(uploadIntervalId);
    uploadIntervalId = null;
  }
}

// ─── Status ───

export function getDriveStatus() {
  return {
    enabled: !!CLIENT_ID && !!CLIENT_SECRET,
    authenticated: isAuthenticated,
    rootFolderId: ROOT_FOLDER_ID || null,
    uploadInterval: UPLOAD_INTERVAL,
    lastUploads: Object.fromEntries(lastUploadPerDevice),
    requiresAuth: !!CLIENT_ID && !isAuthenticated,
    authUrl: (!isAuthenticated && oauth2Client) ? getAuthUrl() : null,
  };
}

export function isDriveEnabled() {
  return isAuthenticated && !!driveClient && !!ROOT_FOLDER_ID;
}

// ─── Event-based screenshot upload (triggered by app change, alerts, blocked apps) ───

const eventUploadQueue: Array<{ deviceName: string; image: string; event: string; app: string; timestamp: Date }> = [];
let eventProcessing = false;

/**
 * Queue an event-based screenshot upload.
 * Called when: app change, blocked app detected, CPU alert, boot/shutdown
 */
export function triggerEventScreenshot(deviceName: string, image: string, event: string, app: string) {
  if (!isAuthenticated || !driveClient || !ROOT_FOLDER_ID) return;
  
  eventUploadQueue.push({ deviceName, image, event, app, timestamp: new Date() });
  processEventQueue();
}

async function processEventQueue() {
  if (eventProcessing || eventUploadQueue.length === 0) return;
  eventProcessing = true;

  while (eventUploadQueue.length > 0) {
    const item = eventUploadQueue.shift()!;
    try {
      const safeName = item.deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
      const safeApp = item.app.replace(/[^a-zA-Z0-9_\-. ]/g, '_').substring(0, 30);
      const dateStr = item.timestamp.toISOString().split('T')[0];
      const timeStr = item.timestamp.toTimeString().slice(0, 5).replace(':', '-');
      const fileName = `${timeStr}_${item.event}_${safeApp}.jpg`;

      // Get or create folders
      const deviceFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, safeName);
      if (!deviceFolderId) continue;
      const dateFolderId = await getOrCreateFolder(deviceFolderId, dateStr);
      if (!dateFolderId) continue;

      // Upload
      const base64Data = item.image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      await driveClient!.files.create({
        requestBody: { name: fileName, parents: [dateFolderId] },
        media: { mimeType: 'image/jpeg', body: stream },
        fields: 'id',
      });

      console.log(`[Drive] Event screenshot: ${safeName}/${dateStr}/${fileName}`);
    } catch (err: any) {
      if (err?.code === 401 || err?.code === 403) {
        isAuthenticated = false;
        eventUploadQueue.length = 0; // Clear queue if auth failed
      }
      console.error('[Drive] Error subiendo event screenshot:', err?.message || err);
    }
  }
  eventProcessing = false;
}

// ─── Daily Report Upload ───

/**
 * Generates and uploads a daily report JSON file to Drive
 */
export async function uploadDailyReport(deviceName: string, reportData: any): Promise<boolean> {
  if (!driveClient || !isAuthenticated || !ROOT_FOLDER_ID) return false;

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];

    const deviceFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, safeName);
    if (!deviceFolderId) return false;
    const dateFolderId = await getOrCreateFolder(deviceFolderId, dateStr);
    if (!dateFolderId) return false;

    const reportJson = JSON.stringify(reportData, null, 2);
    const buffer = Buffer.from(reportJson, 'utf-8');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // Check if report already exists (update it)
    const existing = await driveClient.files.list({
      q: `name='reporte_diario.json' and '${dateFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    if (existing.data.files && existing.data.files.length > 0) {
      // Update existing report
      const fileId = existing.data.files[0].id!;
      const updateStream = new Readable();
      updateStream.push(buffer);
      updateStream.push(null);
      await driveClient.files.update({
        fileId,
        media: { mimeType: 'application/json', body: updateStream },
      });
    } else {
      // Create new report
      await driveClient.files.create({
        requestBody: { name: 'reporte_diario.json', parents: [dateFolderId] },
        media: { mimeType: 'application/json', body: stream },
        fields: 'id',
      });
    }

    console.log(`[Drive] Reporte diario subido: ${safeName}/${dateStr}/reporte_diario.json`);
    return true;
  } catch (err: any) {
    console.error('[Drive] Error subiendo reporte diario:', err?.message || err);
    return false;
  }
}

/**
 * Generates and uploads a beautifully formatted OCR text file to Drive
 */
export async function uploadOCRDataToDrive(deviceName: string, text: string, timestamp: Date): Promise<boolean> {
  if (!driveClient || !isAuthenticated || !ROOT_FOLDER_ID) return false;

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toTimeString().slice(0, 5).replace(':', '-');

    const deviceFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, safeName);
    if (!deviceFolderId) return false;
    const dateFolderId = await getOrCreateFolder(deviceFolderId, dateStr);
    if (!dateFolderId) return false;

    // Beautifully formatted content
    const content = `================================================
REPORTE DE EXTRACCIÓN AUTOMÁTICA (OCR) - EXCEL
================================================
Dispositivo: ${deviceName}
Fecha: ${dateStr}
Hora: ${timeStr}
------------------------------------------------
DATOS OBTENIDOS:
${text}
================================================`;

    const fileName = `${timeStr}_Excel_Extracted_Data.txt`;
    const buffer = Buffer.from(content, 'utf-8');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    await driveClient.files.create({
      requestBody: { name: fileName, parents: [dateFolderId] },
      media: { mimeType: 'text/plain', body: stream },
      fields: 'id',
    });

    console.log(`[Drive] Datos OCR de Excel guardados en Drive: ${safeName}/${dateStr}/${fileName}`);
    return true;
  } catch (err: any) {
    console.error('[Drive] Error subiendo texto OCR a Drive:', err?.message || err);
    return false;
  }
}

/**
 * Get the direct Google Drive folder URL for a device + date
 */
export async function getDriveFolderUrl(deviceName: string, date: string): Promise<string | null> {
  if (!driveClient || !ROOT_FOLDER_ID) return null;

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    
    const deviceRes = await driveClient.files.list({
      q: `name='${safeName}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (!deviceRes.data.files?.length) return null;

    const dateRes = await driveClient.files.list({
      q: `name='${date}' and '${deviceRes.data.files[0].id!}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (!dateRes.data.files?.length) return `https://drive.google.com/drive/folders/${deviceRes.data.files[0].id!}`;

    return `https://drive.google.com/drive/folders/${dateRes.data.files[0].id!}`;
  } catch {
    return null;
  }
}

// ─── List & View Screenshots from Drive ───

/**
 * List all device folders in the root Drive folder
 */
export async function listDeviceFolders(): Promise<Array<{ id: string; name: string }>> {
  if (!driveClient || !ROOT_FOLDER_ID) return [];

  try {
    const res = await driveClient.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      orderBy: 'name',
    });
    return (res.data.files || []).map(f => ({ id: f.id!, name: f.name! }));
  } catch (err) {
    console.error('[Drive] Error listando carpetas de dispositivos:', err);
    return [];
  }
}

/**
 * List date folders for a specific device
 */
export async function listDateFolders(deviceFolderId: string): Promise<Array<{ id: string; name: string }>> {
  if (!driveClient) return [];

  try {
    const res = await driveClient.files.list({
      q: `'${deviceFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      orderBy: 'name desc',
    });
    return (res.data.files || []).map(f => ({ id: f.id!, name: f.name! }));
  } catch (err) {
    console.error('[Drive] Error listando carpetas de fechas:', err);
    return [];
  }
}

/**
 * List screenshot files for a given date folder
 */
export async function listScreenshots(dateFolderId: string): Promise<Array<{ id: string; name: string; createdTime: string; thumbnailLink: string | null; webViewLink: string | null }>> {
  if (!driveClient) return [];

  try {
    const res = await driveClient.files.list({
      q: `'${dateFolderId}' in parents and mimeType='image/jpeg' and trashed=false`,
      fields: 'files(id, name, createdTime, thumbnailLink, webViewLink)',
      orderBy: 'createdTime desc',
    });
    return (res.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!,
      createdTime: f.createdTime || '',
      thumbnailLink: f.thumbnailLink || null,
      webViewLink: f.webViewLink || null,
    }));
  } catch (err) {
    console.error('[Drive] Error listando screenshots:', err);
    return [];
  }
}

/**
 * Get a screenshot file as a readable stream (for proxying to frontend)
 */
export async function getScreenshotStream(fileId: string): Promise<{ stream: any; mimeType: string } | null> {
  if (!driveClient) return null;

  try {
    const res = await driveClient.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return { stream: res.data, mimeType: 'image/jpeg' };
  } catch (err) {
    console.error('[Drive] Error obteniendo screenshot:', err);
    return null;
  }
}

/**
 * List screenshots by device name and date string (YYYY-MM-DD)
 * Combines folder lookup + file listing in one call
 */
export async function getScreenshotsByDeviceAndDate(deviceName: string, date: string): Promise<Array<{ id: string; name: string; time: string; createdTime: string }>> {
  if (!driveClient || !ROOT_FOLDER_ID) return [];

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');

    // Find device folder
    const deviceRes = await driveClient.files.list({
      q: `name='${safeName}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (!deviceRes.data.files?.length) return [];
    const deviceFolderId = deviceRes.data.files[0].id!;

    // Find date folder
    const dateRes = await driveClient.files.list({
      q: `name='${date}' and '${deviceFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (!dateRes.data.files?.length) return [];
    const dateFolderId = dateRes.data.files[0].id!;

    // List screenshots
    const filesRes = await driveClient.files.list({
      q: `'${dateFolderId}' in parents and mimeType='image/jpeg' and trashed=false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
    });

    return (filesRes.data.files || []).map(f => ({
      id: f.id!,
      name: f.name!,
      time: f.name!.replace('capture_', '').replace('.jpg', '').replace('-', ':'),
      createdTime: f.createdTime || '',
    }));
  } catch (err) {
    console.error('[Drive] Error buscando screenshots por device/date:', err);
    return [];
  }
}
