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
const DRIVE_READ_ONLY = process.env.GOOGLE_DRIVE_READ_ONLY === 'true';

// State
let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let driveClient: drive_v3.Drive | null = null;
let isAuthenticated = false;
let lastUploadPerDevice = new Map<string, number>();
const folderIdCache = new Map<string, Promise<string | null>>(); // "parentId/folderName" -> Promise<folderId>

// ─── Initialization ───

function initOAuth2() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log('[Drive] No GOOGLE_CLIENT_ID/SECRET configurado. Upload a Drive deshabilitado.');
    return false;
  }

  oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  // Priority 1: load token from environment variable (persists across Render deploys)
  const tokenEnv = process.env.GOOGLE_DRIVE_TOKEN_JSON;
  if (tokenEnv) {
    try {
      const tokenData = JSON.parse(tokenEnv);
      oauth2Client.setCredentials(tokenData);
      isAuthenticated = true;
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('[Drive] Token cargado desde variable de entorno GOOGLE_DRIVE_TOKEN_JSON. Drive habilitado.');

      oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          console.log('[Drive] Token renovado por expiración. Asegúrate de actualizar GOOGLE_DRIVE_TOKEN_JSON en producción.');
          // NOTA: Se ha removido el console.log del token raw por seguridad
        }
      });

      return true;
    } catch (err) {
      console.warn('[Drive] Error parseando GOOGLE_DRIVE_TOKEN_JSON:', err);
    }
  }

  // Priority 2: load from local file (development)
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      oauth2Client.setCredentials(tokenData);
      isAuthenticated = true;
      driveClient = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('[Drive] Token cargado desde archivo local. Upload a Drive habilitado.');

      // Set up token refresh listener - Async para no bloquear event loop
      oauth2Client.on('tokens', async (tokens) => {
        if (tokens.refresh_token) {
          try {
            const currentData = await fs.promises.readFile(TOKEN_PATH, 'utf-8');
            const current = JSON.parse(currentData);
            current.refresh_token = tokens.refresh_token;
            await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(current, null, 2));
            console.log('[Drive] Token renovado y guardado en archivo local exitosamente.');
          } catch (err) {
            console.error('[Drive] Error guardando token renovado:', err);
          }
        }
      });

      return true;
    }
  } catch (err) {
    console.warn('[Drive] Error cargando token local:', err);
  }

  console.log('[Drive] No hay token guardado. Autoriza en /api/drive/auth');
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

    // Save token to disk asynchronously
    try {
      const dir = path.dirname(TOKEN_PATH);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    } catch (fsErr) {
        console.warn('[Drive] Error escribiendo el token en el archivo local:', fsErr);
    }

    console.log('\n=== GOOGLE DRIVE AUTENTICADO ===');
    console.log('Se han obtenido los tokens correctamente. Por favor, asegúrese de configurar la variable');
    console.log('GOOGLE_DRIVE_TOKEN_JSON en producción con el contenido del archivo data/drive-token.json');
    console.log('=================================\n');

    isAuthenticated = true;
    driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    console.log('[Drive] Autorizado exitosamente. Upload a Drive habilitado.');
    return true;
  } catch (err) {
    console.error('[Drive] Error en auth callback:', err);
    return false;
  }
}

// ─── Core Helpers ───

function createBufferStream(data: string | Buffer, isBase64: boolean = false): Readable {
  let buffer: Buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (isBase64) {
    const base64Data = (data as string).replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    buffer = Buffer.from(data, 'utf-8');
  }
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

async function uploadStreamToDrive(stream: Readable, fileName: string, parentFolderId: string, mimeType: string) {
  return await driveClient!.files.create({
    requestBody: { name: fileName, parents: [parentFolderId] },
    media: { mimeType, body: stream },
    fields: 'id',
  });
}

// ─── Folder Management ───

async function getOrCreateFolder(parentId: string, folderName: string): Promise<string | null> {
  if (!driveClient) return null;

  const cacheKey = `${parentId}/${folderName}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey)!;
  }

  // Prevent memory leak from unbounded cache growth
  if (folderIdCache.size > 2000) {
      folderIdCache.clear();
  }

  const promise = (async () => {
    try {
      // Search for existing folder
      const res = await driveClient.files.list({
        q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id!;
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

      return folder.data.id!;
    } catch (err) {
      console.error(`[Drive] Error creando/buscando carpeta "${folderName}":`, err);
      folderIdCache.delete(cacheKey); // Allow retry later
      return null;
    }
  })();

  folderIdCache.set(cacheKey, promise);
  return promise;
}

async function getDeviceDateFolderIds(deviceName: string, dateStr: string): Promise<string | null> {
  const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  const deviceFolderId = await getOrCreateFolder(ROOT_FOLDER_ID, safeName);
  if (!deviceFolderId) return null;
  return await getOrCreateFolder(deviceFolderId, dateStr);
}

function handleDriveError(err: any, context: string) {
    if (err?.code === 401 || err?.code === 403) {
      console.error('[Drive] Token expirado o sin permisos. Re-autorizar en /api/drive/auth');
      isAuthenticated = false;
    } else {
      console.error(`[Drive] Error en ${context}:`, err?.message || err);
    }
}

// ─── Upload Screenshot ───

async function uploadScreenshot(deviceName: string, imageBase64: string, timestamp: Date): Promise<boolean> {
  if (!driveClient || !isAuthenticated || !ROOT_FOLDER_ID) return false;

  try {
    const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = timestamp.toTimeString().slice(0, 5).replace(':', '-'); // HH-mm
    const fileName = `capture_${timeStr}.jpg`;

    const dateFolderId = await getDeviceDateFolderIds(deviceName, dateStr);
    if (!dateFolderId) return false;

    const stream = createBufferStream(imageBase64, true);
    await uploadStreamToDrive(stream, fileName, dateFolderId, 'image/jpeg');

    return true;
  } catch (err: any) {
    handleDriveError(err, 'subiendo screenshot');
    return false;
  }
}

// ─── Background Job: Upload every 2 minutes per device ───

let uploadIntervalId: NodeJS.Timeout | null = null;

export function startDriveUploadJob(getDevicesAndScreenshots: () => Array<{ deviceName: string; image: string }>) {
  if (DRIVE_READ_ONLY) {
    console.log('[Drive] GOOGLE_DRIVE_READ_ONLY=true. Upload a Google Drive deshabilitado.');
    return;
  }
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
    readOnly: DRIVE_READ_ONLY,
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

// ─── Event-based screenshot upload ───

const eventUploadQueue: Array<{ deviceName: string; image: string; event: string; app: string; timestamp: Date }> = [];
let eventProcessing = false;

export function triggerEventScreenshot(deviceName: string, image: string, event: string, app: string) {
  if (DRIVE_READ_ONLY) return;
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

      const dateFolderId = await getDeviceDateFolderIds(item.deviceName, dateStr);
      if (!dateFolderId) continue;

      const stream = createBufferStream(item.image, true);
      await uploadStreamToDrive(stream, fileName, dateFolderId, 'image/jpeg');

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

export async function uploadDailyReport(deviceName: string, reportData: any): Promise<boolean> {
  if (DRIVE_READ_ONLY) return false;
  if (!driveClient || !isAuthenticated || !ROOT_FOLDER_ID) return false;

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];

    const dateFolderId = await getDeviceDateFolderIds(deviceName, dateStr);
    if (!dateFolderId) return false;

    const reportJson = JSON.stringify(reportData, null, 2);
    
    // Check if report already exists (update it)
    const existing = await driveClient.files.list({
      q: `name='reporte_diario.json' and '${dateFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    if (existing.data.files && existing.data.files.length > 0) {
      // Update existing report
      const fileId = existing.data.files[0].id!;
      const updateStream = createBufferStream(reportJson);
      await driveClient.files.update({
        fileId,
        media: { mimeType: 'application/json', body: updateStream },
      });
    } else {
      // Create new report
      const stream = createBufferStream(reportJson);
      await uploadStreamToDrive(stream, 'reporte_diario.json', dateFolderId, 'application/json');
    }

    console.log(`[Drive] Reporte diario subido: ${safeName}/${dateStr}/reporte_diario.json`);
    return true;
  } catch (err: any) {
    console.error('[Drive] Error subiendo reporte diario:', err?.message || err);
    return false;
  }
}

export async function uploadOCRDataToDrive(deviceName: string, text: string, timestamp: Date): Promise<boolean> {
  if (DRIVE_READ_ONLY) return false;
  if (!driveClient || !isAuthenticated || !ROOT_FOLDER_ID) return false;

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toTimeString().slice(0, 5).replace(':', '-');

    const dateFolderId = await getDeviceDateFolderIds(deviceName, dateStr);
    if (!dateFolderId) return false;

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
    const stream = createBufferStream(content);
    
    await uploadStreamToDrive(stream, fileName, dateFolderId, 'text/plain');

    console.log(`[Drive] Datos OCR de Excel guardados en Drive: ${safeName}/${dateStr}/${fileName}`);
    return true;
  } catch (err: any) {
    console.error('[Drive] Error subiendo texto OCR a Drive:', err?.message || err);
    return false;
  }
}

// ─── Retrieval and Display functions ───

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

export async function getScreenshotsByDeviceAndDate(deviceName: string, date: string): Promise<Array<{ id: string; name: string; time: string; createdTime: string }>> {
  if (!driveClient || !ROOT_FOLDER_ID) return [];

  try {
    const safeName = deviceName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');

    const deviceRes = await driveClient.files.list({
      q: `name='${safeName}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (!deviceRes.data.files?.length) return [];
    const deviceFolderId = deviceRes.data.files[0].id!;

    const dateRes = await driveClient.files.list({
      q: `name='${date}' and '${deviceFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    if (!dateRes.data.files?.length) return [];
    const dateFolderId = dateRes.data.files[0].id!;

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
