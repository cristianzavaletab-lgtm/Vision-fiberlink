import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { ExcelBusinessEvent, ExcelMonitor } from './excelMonitor';
import { RemoteControlMode, RemoteSupportModule } from './remoteSupport';

const AGENT_VERSION = '2.0.0';
const DEFAULT_SERVER_URL = 'https://visioncontrol-server.onrender.com';

interface AgentConfig {
  serverUrl: string;
  serverUrls?: string[];
  accessToken: string;
  machineId: string;
  machineName: string;
  companyArea: string;
  watchFolders: string[];
  cloudDriveMonitoringEnabled: boolean;
  cloudDriveFolders: string[];
  allowedExtensions: string[];
  currency: string;
  decimalPlaces: number;
  syncIntervalSeconds: number;
  workdayStartTime: string;
  workdayPauseTime: string;
  workdayResumeTime: string;
  workdayCloseTime: string;
  closeReminderMinutes: number;
  excelDeepRead: boolean;
  monitoringEnabled: boolean;
  localReportsEnabled: boolean;
  remoteSupportEnabled: boolean;
  screenViewEnabled: boolean;
  remoteControlEnabled: boolean;
  remoteControlMode: RemoteControlMode;
  showRemoteSessionIndicator: boolean;
  alertsEnabled: boolean;
  alertRequiresConfirmation: boolean;
  voiceSupportEnabled: boolean;
  voiceRequiresPermission: boolean;
  audioRecordingEnabled: boolean;
  offlineQueueEnabled: boolean;
  logsEnabled: boolean;
  isConfigured: boolean;
}

interface QueueItem extends ExcelBusinessEvent {
  retryCount: number;
  lastError?: string;
}

interface BusinessQueueItem {
  endpoint: string;
  payload: Record<string, unknown>;
  retryCount: number;
  lastError?: string;
}

interface AgentState {
  connected: boolean;
  lastSync?: string;
  lastError?: string;
  pendingEvents: number;
  monitoredFiles: number;
  monitoringPaused: boolean;
  remoteSupportActive: boolean;
}

const isPackaged = app.isPackaged;
const templateConfigPath = isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(process.cwd(), 'config.json');
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');
const queuePath = path.join(userDataPath, 'sync-queue.json');
const eventsLogPath = path.join(userDataPath, 'excel-events.jsonl');
const agentLogPath = path.join(userDataPath, 'agent.log');
const errorLogPath = path.join(userDataPath, 'errors.log');
const remoteSessionsLogPath = path.join(userDataPath, 'remote-sessions.jsonl');
const supportEventsLogPath = path.join(userDataPath, 'support-events.jsonl');
const alertsLogPath = path.join(userDataPath, 'alerts.jsonl');
const screenEventsLogPath = path.join(userDataPath, 'screen-events.jsonl');
const smartReportsLogPath = path.join(userDataPath, 'smart-reports.jsonl');
const dailyCloseLogPath = path.join(userDataPath, 'daily-close.jsonl');
const communicationEventsLogPath = path.join(userDataPath, 'communication-events.jsonl');
const businessQueuePath = path.join(userDataPath, 'business-sync-queue.json');

let config = loadConfig();
let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let logWindow: BrowserWindow | null = null;
let workdayWindow: BrowserWindow | null = null;
let closeWindow: BrowserWindow | null = null;
let monitor: ExcelMonitor | null = null;
let remoteSupport: RemoteSupportModule | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let queue: QueueItem[] = loadQueue();
let businessQueue: BusinessQueueItem[] = loadBusinessQueue();
let activeWorkdayId = '';
let isQuittingAfterCloseSummary = false;

const state: AgentState = {
  connected: false,
  pendingEvents: queue.length,
  monitoredFiles: 0,
  monitoringPaused: !config.monitoringEnabled,
  remoteSupportActive: false,
};

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();

function ensureDataDir() {
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
}

function loadConfig(): AgentConfig {
  ensureDataDir();
  const defaults: AgentConfig = {
    serverUrl: DEFAULT_SERVER_URL,
    accessToken: process.env.DASHBOARD_ACCESS_TOKEN || '',
    machineId: '',
    machineName: os.hostname(),
    companyArea: 'Operaciones',
    watchFolders: [],
    cloudDriveMonitoringEnabled: true,
    cloudDriveFolders: [],
    allowedExtensions: ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.pdf'],
    currency: 'PEN',
    decimalPlaces: 2,
    syncIntervalSeconds: 30,
    workdayStartTime: '08:00',
    workdayPauseTime: '13:00',
    workdayResumeTime: '15:00',
    workdayCloseTime: '18:00',
    closeReminderMinutes: 10,
    excelDeepRead: true,
    monitoringEnabled: true,
    localReportsEnabled: true,
    remoteSupportEnabled: true,
    screenViewEnabled: true,
    remoteControlEnabled: true,
    remoteControlMode: 'request_permission',
    showRemoteSessionIndicator: true,
    alertsEnabled: true,
    alertRequiresConfirmation: true,
    voiceSupportEnabled: true,
    voiceRequiresPermission: true,
    audioRecordingEnabled: false,
    offlineQueueEnabled: true,
    logsEnabled: true,
    isConfigured: false,
  };

  const sources = [templateConfigPath, configPath];
  let loaded: Partial<AgentConfig> = {};
  for (const source of sources) {
    try {
      if (fs.existsSync(source)) loaded = { ...loaded, ...JSON.parse(fs.readFileSync(source, 'utf8')) };
    } catch (error) {
      appendLog(errorLogPath, `No se pudo leer configuración ${source}: ${String(error)}`);
    }
  }

  if ((loaded as any).hardwareId && !loaded.machineId) loaded.machineId = (loaded as any).hardwareId;
  if ((loaded as any).serverUrls?.[0] && !loaded.serverUrl) loaded.serverUrl = (loaded as any).serverUrls[0];
  if ((loaded as any).agentSecret && !loaded.accessToken) loaded.accessToken = (loaded as any).agentSecret;
  if (!loaded.machineId) loaded.machineId = stableMachineId();

  const merged = { ...defaults, ...loaded };
  if (!merged.accessToken && process.env.DASHBOARD_ACCESS_TOKEN) merged.accessToken = process.env.DASHBOARD_ACCESS_TOKEN;
  saveConfig(merged);
  return merged;
}

function saveConfig(nextConfig: AgentConfig) {
  ensureDataDir();
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
}

function detectCloudDriveFolders() {
  const folders = new Set<string>();
  const home = os.homedir();
  const candidates = [
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    process.env.DROPBOX,
    path.join(home, 'Google Drive'),
    path.join(home, 'My Drive'),
    path.join(home, 'Mi unidad'),
    path.join(home, 'OneDrive'),
    path.join(home, 'Dropbox'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) folders.add(path.resolve(candidate));
  }

  for (let code = 67; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    for (const name of ['Mi unidad', 'My Drive', 'Unidades compartidas', 'Shared drives', 'Google Drive']) {
      const candidate = `${letter}:\\${name}`;
      if (fs.existsSync(candidate)) folders.add(path.resolve(candidate));
    }
  }

  return Array.from(folders);
}

function getEffectiveWatchFolders() {
  const folders = new Set(config.watchFolders.filter(Boolean));
  if (config.cloudDriveMonitoringEnabled) {
    for (const folder of config.cloudDriveFolders || []) if (folder) folders.add(folder);
    for (const folder of detectCloudDriveFolders()) folders.add(folder);
  }
  return Array.from(folders);
}

function stableMachineId() {
  const source = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.userInfo().username}`;
  return `machine-${crypto.createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
}

function appendLog(filePath: string, message: string) {
  ensureDataDir();
  fs.appendFileSync(filePath, `[${new Date().toISOString()}] ${message}\n`);
}

function appendEventLog(event: ExcelBusinessEvent) {
  if (!config.localReportsEnabled) return;
  fs.appendFileSync(eventsLogPath, `${JSON.stringify(event)}\n`);
}

function loadQueue(): QueueItem[] {
  try {
    if (!fs.existsSync(queuePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadBusinessQueue(): BusinessQueueItem[] {
  try {
    if (!fs.existsSync(businessQueuePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(businessQueuePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBusinessQueue() {
  fs.writeFileSync(businessQueuePath, JSON.stringify(businessQueue, null, 2));
}

function appendJsonLine(filePath: string, payload: unknown) {
  ensureDataDir();
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

function saveQueue() {
  state.pendingEvents = queue.length;
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  updateTrayMenu();
}

function enqueueBusinessEvent(endpoint: string, payload: Record<string, unknown>, localLogPath?: string) {
  if (localLogPath) appendJsonLine(localLogPath, payload);
  businessQueue.push({ endpoint, payload, retryCount: 0 });
  saveBusinessQueue();
  syncBusinessQueue().catch((error) => appendLog(errorLogPath, `No se pudo sincronizar evento empresarial: ${String(error)}`));
}

function enqueueEvent(event: ExcelBusinessEvent) {
  if (queue.some((item) => item.eventId === event.eventId)) return;
  queue.push({ ...event, retryCount: 0, syncStatus: 'pending' });
  appendEventLog(event);
  saveQueue();
  appendLog(agentLogPath, `Evento Excel en cola: ${event.eventType} ${event.fileName}`);
}

async function postJson<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${config.serverUrl.replace(/\/$/, '')}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dashboard-Token': config.accessToken,
      'Authorization': config.accessToken ? `Bearer ${config.accessToken}` : '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText} ${text}`.trim());
  }
  return response.json() as Promise<T>;
}

async function getJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${config.serverUrl.replace(/\/$/, '')}${endpoint}`, {
    headers: {
      'X-Dashboard-Token': config.accessToken,
      'Authorization': config.accessToken ? `Bearer ${config.accessToken}` : '',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function registerAgent() {
  await postJson('/api/agent/register', {
    machineId: config.machineId,
    machineName: config.machineName,
    hostname: os.hostname(),
    windowsUser: os.userInfo().username,
    os: `${os.type()} ${os.release()}`,
    agentVersion: AGENT_VERSION,
    companyArea: config.companyArea,
    status: state.monitoringPaused ? 'inactive' : 'active',
    watchFolders: getEffectiveWatchFolders(),
    remoteSupportEnabled: config.remoteSupportEnabled,
    remoteSupportActive: remoteSupport?.isActive() || false,
    remoteControlMode: config.remoteControlMode,
  });
}

async function sendHeartbeat() {
  try {
    await postJson('/api/agent/heartbeat', {
      machineId: config.machineId,
      machineName: config.machineName,
      status: state.monitoringPaused ? 'inactive' : 'active',
      lastSync: state.lastSync,
      pendingEvents: queue.length,
      monitoredFolders: getEffectiveWatchFolders().length,
      agentVersion: AGENT_VERSION,
      companyArea: config.companyArea,
      remoteSupportEnabled: config.remoteSupportEnabled,
      remoteSupportActive: remoteSupport?.isActive() || false,
      remoteControlMode: config.remoteControlMode,
    });
    state.connected = true;
    state.lastError = undefined;
  } catch (error) {
    state.connected = false;
    state.lastError = String(error);
    appendLog(errorLogPath, `Heartbeat falló: ${String(error)}`);
  }
  updateTrayMenu();
}

async function syncQueue() {
  if (queue.length === 0) {
    await sendSyncStatus('synced');
    return;
  }

  const batch = queue.slice(0, 100);
  try {
    await postJson('/api/excel-events/bulk', {
      machineId: config.machineId,
      machineName: config.machineName,
      events: batch,
      dailySummary: buildDailySummary(),
    });
    const syncedIds = new Set(batch.map((event) => event.eventId));
    queue = queue.filter((event) => !syncedIds.has(event.eventId));
    state.connected = true;
    state.lastSync = new Date().toISOString();
    state.lastError = undefined;
    saveQueue();
    await sendSyncStatus('synced');
    appendLog(agentLogPath, `Sincronizados ${batch.length} evento(s). Pendientes: ${queue.length}`);
  } catch (error) {
    state.connected = false;
    state.lastError = String(error);
    for (const item of batch) {
      item.retryCount += 1;
      item.lastError = String(error);
      item.syncStatus = 'error';
    }
    saveQueue();
    await sendSyncStatus('pending').catch(() => undefined);
    appendLog(errorLogPath, `No se pudo sincronizar cola: ${String(error)}`);
  }
}

async function syncBusinessQueue() {
  if (businessQueue.length === 0) return;
  const batch = [...businessQueue];
  for (const item of batch) {
    try {
      await postJson(item.endpoint, item.payload);
      businessQueue = businessQueue.filter((queued) => queued !== item);
      saveBusinessQueue();
    } catch (error) {
      item.retryCount += 1;
      item.lastError = String(error);
      saveBusinessQueue();
      throw error;
    }
  }
}

async function sendSyncStatus(syncStatus: 'synced' | 'pending' | 'error') {
  await postJson('/api/agent/sync-status', {
    machineId: config.machineId,
    machineName: config.machineName,
    syncStatus,
    pendingEvents: queue.length,
    lastSync: state.lastSync,
    lastError: state.lastError,
  });
}

function buildDailySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = queue.filter((event) => event.timestamp.startsWith(today));
  return {
    machineId: config.machineId,
    machineName: config.machineName,
    date: today,
    totalCollected: roundMoney(todayEvents.reduce((sum, event) => sum + (event.totalCollected || 0), 0)),
    totalIncome: roundMoney(todayEvents.reduce((sum, event) => sum + (event.totalIncome || 0), 0)),
    excelFilesUsed: new Set(todayEvents.map((event) => event.fileName)).size,
    eventsCount: todayEvents.length,
    createdRows: todayEvents.reduce((sum, event) => sum + event.createdRows, 0),
    updatedRows: todayEvents.reduce((sum, event) => sum + event.updatedRows, 0),
    deletedRows: todayEvents.reduce((sum, event) => sum + event.deletedRows, 0),
    lastActivity: todayEvents[todayEvents.length - 1]?.timestamp || null,
  };
}

async function pullRemoteConfig() {
  try {
    const remoteConfig = await getJson<Partial<AgentConfig> | null>(`/api/agent/config?machineId=${encodeURIComponent(config.machineId)}`);
    if (!remoteConfig) return;
    const safeConfig = pickSafeConfig(remoteConfig);
    if (Object.keys(safeConfig).length === 0) return;
    config = { ...config, ...safeConfig };
    saveConfig(config);
    restartMonitor();
    appendLog(agentLogPath, 'Configuración remota segura aplicada.');
  } catch {
    // La configuración remota es opcional.
  }
}

function pickSafeConfig(remoteConfig: Partial<AgentConfig>) {
  const safe: Partial<AgentConfig> = {};
  if (typeof remoteConfig.machineName === 'string') safe.machineName = remoteConfig.machineName;
  if (typeof remoteConfig.companyArea === 'string') safe.companyArea = remoteConfig.companyArea;
  if (Array.isArray(remoteConfig.watchFolders)) safe.watchFolders = remoteConfig.watchFolders;
  if (typeof remoteConfig.cloudDriveMonitoringEnabled === 'boolean') safe.cloudDriveMonitoringEnabled = remoteConfig.cloudDriveMonitoringEnabled;
  if (Array.isArray(remoteConfig.cloudDriveFolders)) safe.cloudDriveFolders = remoteConfig.cloudDriveFolders;
  if (typeof remoteConfig.syncIntervalSeconds === 'number') safe.syncIntervalSeconds = remoteConfig.syncIntervalSeconds;
  if (typeof remoteConfig.monitoringEnabled === 'boolean') safe.monitoringEnabled = remoteConfig.monitoringEnabled;
  if (typeof remoteConfig.excelDeepRead === 'boolean') safe.excelDeepRead = remoteConfig.excelDeepRead;
  if (typeof remoteConfig.remoteSupportEnabled === 'boolean') safe.remoteSupportEnabled = remoteConfig.remoteSupportEnabled;
  if (typeof remoteConfig.screenViewEnabled === 'boolean') safe.screenViewEnabled = remoteConfig.screenViewEnabled;
  if (typeof remoteConfig.remoteControlEnabled === 'boolean') safe.remoteControlEnabled = remoteConfig.remoteControlEnabled;
  if (['disabled', 'request_permission', 'company_managed'].includes(String(remoteConfig.remoteControlMode))) safe.remoteControlMode = remoteConfig.remoteControlMode;
  if (typeof remoteConfig.voiceSupportEnabled === 'boolean') safe.voiceSupportEnabled = remoteConfig.voiceSupportEnabled;
  return safe;
}

function startAgent() {
  appendLog(agentLogPath, `VisionControl Excel Agent ${AGENT_VERSION} iniciado.`);
  if (process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: true, openAsHidden: false });
  restartMonitor();
  registerAgent()
    .catch((error) => appendLog(errorLogPath, `Registro inicial falló: ${String(error)}`))
    .finally(() => restartRemoteSupport());
  startTimers();
}

function startTimers() {
  if (syncInterval) clearInterval(syncInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  syncInterval = setInterval(() => {
    syncQueue().catch((error) => appendLog(errorLogPath, `Sync interval error: ${String(error)}`));
    syncBusinessQueue().catch(() => undefined);
    pullRemoteConfig().catch(() => undefined);
  }, Math.max(5, config.syncIntervalSeconds) * 1000);

  heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch(() => undefined);
  }, 15000);

  sendHeartbeat().catch(() => undefined);
  syncQueue().catch(() => undefined);
  syncBusinessQueue().catch(() => undefined);
}

function restartMonitor() {
  monitor?.stop();
  monitor = null;
  state.monitoringPaused = !config.monitoringEnabled;
  if (!config.monitoringEnabled) {
    updateTrayMenu();
    return;
  }

  monitor = new ExcelMonitor({
    machineId: config.machineId,
    machineName: config.machineName,
    watchFolders: getEffectiveWatchFolders(),
    allowedExtensions: config.allowedExtensions,
    currency: config.currency,
    decimalPlaces: config.decimalPlaces,
    excelDeepRead: config.excelDeepRead,
  });

  monitor.on('business-event', (event: ExcelBusinessEvent) => enqueueEvent(event));
  monitor.on('error-log', (message: string) => appendLog(errorLogPath, message));
  monitor.on('status', (message: string) => appendLog(agentLogPath, message));
  monitor.start();
  updateTrayMenu();
}

function needsInitialConfiguration() {
  const hasServer = Boolean(config.serverUrl?.trim());
  const hasToken = Boolean(config.accessToken?.trim());
  const hasExistingFolder = getEffectiveWatchFolders().some((folder) => fs.existsSync(folder));
  return !hasServer || !hasToken || !hasExistingFolder;
}

function restartRemoteSupport() {
  remoteSupport?.stop();
  remoteSupport = null;
  if (!config.remoteSupportEnabled) {
    state.remoteSupportActive = false;
    updateTrayMenu();
    return;
  }

  remoteSupport = new RemoteSupportModule({
    serverUrl: config.serverUrl,
    accessToken: config.accessToken,
    machineId: config.machineId,
    machineName: config.machineName,
    companyArea: config.companyArea,
    remoteSupportEnabled: config.remoteSupportEnabled,
    screenViewEnabled: config.screenViewEnabled,
    remoteControlEnabled: config.remoteControlEnabled,
    remoteControlMode: config.remoteControlMode,
    showRemoteSessionIndicator: config.showRemoteSessionIndicator,
    alertsEnabled: config.alertsEnabled,
    alertRequiresConfirmation: config.alertRequiresConfirmation,
    voiceSupportEnabled: config.voiceSupportEnabled,
    voiceRequiresPermission: config.voiceRequiresPermission,
    audioRecordingEnabled: config.audioRecordingEnabled,
  }, { remoteSessionsLogPath, supportEventsLogPath, alertsLogPath, errorLogPath });
  remoteSupport.start();
  updateTrayMenu();
}

function pauseOrResumeMonitoring() {
  config.monitoringEnabled = !config.monitoringEnabled;
  saveConfig(config);
  restartMonitor();
  sendHeartbeat().catch(() => undefined);
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('VisionControl Agent');
  tray.on('double-click', openMainWindow);
  updateTrayMenu();
}

function createTrayIcon() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQklEQVR4AWMY8eD/PwMlgImBQjDwH4gvg2kGBkYVMM0YBhwGJgYGBmYgTS7ABQZGRsYH8WCRwGJgYGBiYgZQJgAA2VULzPlzYfAAAAAASUVORK5CYII=');
  return icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 });
}

function openMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({ width: 820, height: 720, title: 'VisionControl Agent' });
  mainWindow.on('closed', () => { mainWindow = null; });
  refreshMainWindow();
}

function refreshMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(mainHtml())}`);
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'VisionControl Agent', enabled: false },
    { label: `Estado: ${state.monitoringPaused ? 'Pausado' : state.connected ? 'Activo' : 'Sin conexión'}`, enabled: false },
    { label: `Soporte remoto: ${config.remoteSupportEnabled ? 'Disponible' : 'Desactivado'}`, enabled: false },
    { label: `Última sincronización: ${state.lastSync ? formatTime(state.lastSync) : 'pendiente'}`, enabled: false },
    { label: `Eventos pendientes: ${queue.length}`, enabled: false },
    { type: 'separator' },
    { label: 'Sincronizar ahora', click: () => syncQueue().catch((error) => appendLog(errorLogPath, String(error))) },
    { label: 'Abrir panel del agente', click: openMainWindow },
    { label: 'Activar jornada', click: openWorkdayWindow },
    { label: 'Guardar resumen / cierre', click: () => openCloseWindow('manual') },
    { label: config.monitoringEnabled ? 'Pausar monitoreo' : 'Activar monitoreo', click: pauseOrResumeMonitoring },
    { label: config.remoteSupportEnabled ? 'Desactivar soporte remoto' : 'Activar soporte remoto', click: toggleRemoteSupport },
    { label: 'Abrir configuración', click: openConfigWindow },
    { label: 'Ver registros locales', click: openLogWindow },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  refreshMainWindow();
}

function mainHtml() {
  const effectiveFolders = getEffectiveWatchFolders();
  const existingFolders = effectiveFolders.filter((folder) => fs.existsSync(folder));
  const folders = effectiveFolders.length > 0
    ? effectiveFolders.map((folder) => `<li>${escapeHtml(folder)} <strong>${fs.existsSync(folder) ? 'OK' : 'No existe'}</strong></li>`).join('')
    : '<li>No configuradas.</li>';
  const folderWarning = config.monitoringEnabled && existingFolders.length === 0
    ? '<div class="warning">No hay carpetas existentes para monitorear. Crea esas carpetas o cambia la configuracion a rutas reales donde esten tus Excel.</div>'
    : '';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>VisionControl Agent</title>
  <style>
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: linear-gradient(135deg, #0f172a, #1e293b); color: #f8fafc; }
    main { max-width: 760px; margin: 0 auto; padding: 32px; }
    .badge { display: inline-block; padding: 7px 12px; border-radius: 999px; background: ${state.monitoringPaused ? '#854d0e' : '#166534'}; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    h1 { margin: 18px 0 8px; font-size: 30px; }
    p { color: #cbd5e1; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 22px 0; }
    .card { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); border-radius: 22px; padding: 18px; }
    .label { color: #94a3b8; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; }
    .value { margin-top: 8px; font-size: 20px; font-weight: 900; }
    ul { margin: 8px 0 0; padding-left: 18px; color: #e2e8f0; }
    strong { margin-left: 8px; color: #fdba74; }
    .warning { margin: 18px 0; border-radius: 18px; padding: 14px 16px; background: rgba(251, 146, 60, .18); border: 1px solid rgba(251, 146, 60, .45); color: #fed7aa; font-weight: 800; }
    button { border: 0; border-radius: 15px; background: #f97316; color: #111827; font-weight: 900; padding: 13px 16px; margin: 10px 8px 0 0; cursor: pointer; }
    button.secondary { background: #e2e8f0; }
  </style>
</head>
<body>
  <main>
    <span class="badge">${state.monitoringPaused ? 'Monitoreo pausado' : 'Agente ejecutándose'}</span>
    <h1>VisionControl Agent</h1>
    <p>El agente está activo y conectado al panel empresarial. Supervisa actividad de archivos Excel y permite soporte remoto autorizado únicamente con permiso visible del usuario.</p>
    ${folderWarning}
    <div class="grid">
      <div class="card"><div class="label">Conexión</div><div class="value">${state.connected ? 'Conectado' : 'Sin conexión'}</div></div>
      <div class="card"><div class="label">Equipo</div><div class="value">${escapeHtml(config.machineName)}</div><p>${escapeHtml(os.userInfo().username)} · ${escapeHtml(config.companyArea)} · v${AGENT_VERSION}</p></div>
      <div class="card"><div class="label">Excel</div><div class="value">${queue.length} pendientes</div><p>Última sincronización: ${state.lastSync ? formatTime(state.lastSync) : 'Pendiente'}</p><p>Nube sincronizada: ${config.cloudDriveMonitoringEnabled ? 'activa' : 'desactivada'}</p></div>
      <div class="card"><div class="label">Soporte remoto</div><div class="value">${config.remoteSupportEnabled ? remoteSupport?.isActive() ? 'Sesión activa' : 'Disponible' : 'Inactivo'}</div><p>Ver pantalla: ${config.screenViewEnabled ? 'permitido con autorización' : 'desactivado'}</p></div>
      <div class="card"><div class="label">Seguridad</div><div class="value">${config.accessToken ? 'Token válido' : 'Sin token'}</div><p>Conexión cifrada por HTTPS/WSS y auditoría activa.</p></div>
    </div>
    <div class="card">
      <div class="label">Carpetas Excel autorizadas</div>
      <ul>${folders}</ul>
    </div>
    <button onclick="window.close()">Ocultar ventana</button>
    <p>El estado se actualiza automaticamente cuando el agente sincroniza o detecta cambios.</p>
  </main>
</body>
</html>`;
}

function openConfigWindow() {
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.focus();
    return;
  }
  configWindow = new BrowserWindow({ width: 760, height: 760, title: 'Configuración VisionControl Excel Agent', webPreferences: { nodeIntegration: true, contextIsolation: false } });
  configWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(configHtml())}`);
}

function toggleRemoteSupport() {
  config.remoteSupportEnabled = !config.remoteSupportEnabled;
  saveConfig(config);
  restartRemoteSupport();
  sendHeartbeat().catch(() => undefined);
}

function configHtml() {
  const escapedConfig = JSON.stringify(config).replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>VisionControl Excel Agent</title>
  <style>
    body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #f6f3ef; color: #111; }
    main { max-width: 680px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0; font-size: 26px; }
    p { color: #666; line-height: 1.5; }
    label { display: block; margin-top: 16px; font-weight: 800; font-size: 13px; }
    input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 14px; padding: 12px; margin-top: 6px; font-size: 14px; }
    textarea { min-height: 92px; }
    .card { background: white; border-radius: 24px; padding: 22px; box-shadow: 0 18px 60px rgba(15, 23, 42, .08); margin-top: 18px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    button { border: 0; border-radius: 16px; background: #111; color: white; font-weight: 900; padding: 14px 18px; margin-top: 18px; cursor: pointer; }
    .orange { color: #ea580c; font-weight: 900; letter-spacing: .14em; font-size: 11px; text-transform: uppercase; }
  </style>
</head>
<body>
  <main>
    <div class="orange">Agente Local Empresarial</div>
    <h1>Auditoría autorizada de Excel</h1>
    <p>Configura carpetas empresariales permitidas y soporte remoto autorizado. El control remoto requiere permiso o modo empresa administrada, siempre con aviso visible y registro.</p>
    <div class="card">
      <label>URL del servidor</label><input id="serverUrl" />
      <label>Token interno</label><input id="accessToken" type="password" />
      <div class="row">
        <div><label>Nombre visible</label><input id="machineName" /></div>
        <div><label>Área</label><input id="companyArea" /></div>
      </div>
      <label>Carpetas Excel permitidas, una por línea</label><textarea id="watchFolders"></textarea>
      <label>Monitorear Google Drive, OneDrive y Dropbox sincronizados</label><select id="cloudDriveMonitoringEnabled"><option value="true">Activo</option><option value="false">Desactivado</option></select>
      <label>Carpetas cloud adicionales, una por línea</label><textarea id="cloudDriveFolders"></textarea>
      <div class="row">
        <div><label>Moneda</label><input id="currency" /></div>
        <div><label>Decimales</label><input id="decimalPlaces" type="number" min="0" max="6" /></div>
      </div>
      <div class="row">
        <div><label>Intervalo de sincronización (seg.)</label><input id="syncIntervalSeconds" type="number" min="5" /></div>
        <div><label>Lectura profunda</label><select id="excelDeepRead"><option value="true">Activa</option><option value="false">Inactiva</option></select></div>
      </div>
      <label>Monitoreo</label><select id="monitoringEnabled"><option value="true">Activo</option><option value="false">Pausado</option></select>
      <h2 style="font-size:18px;margin-top:24px">Soporte remoto autorizado</h2>
      <div class="row">
        <div><label>Soporte remoto</label><select id="remoteSupportEnabled"><option value="true">Disponible</option><option value="false">Desactivado</option></select></div>
        <div><label>Ver pantalla</label><select id="screenViewEnabled"><option value="true">Permitido</option><option value="false">Desactivado</option></select></div>
      </div>
      <div class="row">
        <div><label>Control remoto</label><select id="remoteControlEnabled"><option value="true">Permitido</option><option value="false">Desactivado</option></select></div>
        <div><label>Modo de control</label><select id="remoteControlMode"><option value="disabled">Desactivado</option><option value="request_permission">Pedir permiso</option><option value="company_managed">Equipo administrado</option></select></div>
      </div>
      <div class="row">
        <div><label>Alertas</label><select id="alertsEnabled"><option value="true">Activas</option><option value="false">Desactivadas</option></select></div>
        <div><label>Confirmación de alertas</label><select id="alertRequiresConfirmation"><option value="true">Requerida</option><option value="false">Opcional</option></select></div>
      </div>
      <div class="row">
        <div><label>Comunicación de voz</label><select id="voiceSupportEnabled"><option value="true">Disponible</option><option value="false">Desactivada</option></select></div>
        <div><label>Permiso para voz</label><select id="voiceRequiresPermission"><option value="true">Requerido</option><option value="false">No requerido</option></select></div>
      </div>
      <button onclick="save()">Guardar y reiniciar monitoreo</button>
      <p id="status"></p>
    </div>
  </main>
  <script>
    const { ipcRenderer } = require('electron');
    const cfg = ${escapedConfig};
    for (const key of ['serverUrl','accessToken','machineName','companyArea','currency','decimalPlaces','syncIntervalSeconds']) document.getElementById(key).value = cfg[key] || '';
    document.getElementById('watchFolders').value = (cfg.watchFolders || []).join('\n');
    document.getElementById('cloudDriveMonitoringEnabled').value = String(cfg.cloudDriveMonitoringEnabled !== false);
    document.getElementById('cloudDriveFolders').value = (cfg.cloudDriveFolders || []).join('\n');
    document.getElementById('excelDeepRead').value = String(cfg.excelDeepRead !== false);
    document.getElementById('monitoringEnabled').value = String(cfg.monitoringEnabled !== false);
    for (const key of ['remoteSupportEnabled','screenViewEnabled','remoteControlEnabled','alertsEnabled','alertRequiresConfirmation','voiceSupportEnabled','voiceRequiresPermission']) document.getElementById(key).value = String(cfg[key] !== false);
    document.getElementById('remoteControlMode').value = cfg.remoteControlMode || 'request_permission';
    function save() {
      const next = {
        serverUrl: document.getElementById('serverUrl').value.trim(),
        accessToken: document.getElementById('accessToken').value.trim(),
        machineName: document.getElementById('machineName').value.trim(),
        companyArea: document.getElementById('companyArea').value.trim(),
        watchFolders: document.getElementById('watchFolders').value.split('\n').map(x => x.trim()).filter(Boolean),
        cloudDriveMonitoringEnabled: document.getElementById('cloudDriveMonitoringEnabled').value === 'true',
        cloudDriveFolders: document.getElementById('cloudDriveFolders').value.split('\n').map(x => x.trim()).filter(Boolean),
        currency: document.getElementById('currency').value.trim() || 'PEN',
        decimalPlaces: Number(document.getElementById('decimalPlaces').value || 2),
        syncIntervalSeconds: Number(document.getElementById('syncIntervalSeconds').value || 30),
        excelDeepRead: document.getElementById('excelDeepRead').value === 'true',
        monitoringEnabled: document.getElementById('monitoringEnabled').value === 'true',
        remoteSupportEnabled: document.getElementById('remoteSupportEnabled').value === 'true',
        screenViewEnabled: document.getElementById('screenViewEnabled').value === 'true',
        remoteControlEnabled: document.getElementById('remoteControlEnabled').value === 'true',
        remoteControlMode: document.getElementById('remoteControlMode').value,
        alertsEnabled: document.getElementById('alertsEnabled').value === 'true',
        alertRequiresConfirmation: document.getElementById('alertRequiresConfirmation').value === 'true',
        voiceSupportEnabled: document.getElementById('voiceSupportEnabled').value === 'true',
        voiceRequiresPermission: document.getElementById('voiceRequiresPermission').value === 'true',
        isConfigured: true
      };
      ipcRenderer.send('agent-config-save', next);
      document.getElementById('status').innerText = 'Configuración guardada.';
    }
  </script>
</body>
</html>`;
}

function openLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return;
  }
  const content = [
    'agent.log',
    readOptional(agentLogPath),
    '\nerrors.log',
    readOptional(errorLogPath),
    '\nremote-sessions.jsonl',
    readOptional(remoteSessionsLogPath),
    '\nsupport-events.jsonl',
    readOptional(supportEventsLogPath),
    '\nalerts.jsonl',
    readOptional(alertsLogPath),
    '\nscreen-events.jsonl',
    readOptional(screenEventsLogPath),
    '\nsmart-reports.jsonl',
    readOptional(smartReportsLogPath),
    '\ndaily-close.jsonl',
    readOptional(dailyCloseLogPath),
    '\ncommunication-events.jsonl',
    readOptional(communicationEventsLogPath),
    '\nEventos pendientes',
    JSON.stringify(queue.slice(-50), null, 2),
    '\nEventos empresariales pendientes',
    JSON.stringify(businessQueue.slice(-50), null, 2),
  ].join('\n');
  logWindow = new BrowserWindow({ width: 900, height: 700, title: 'Registros locales VisionControl' });
  logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<pre style="white-space:pre-wrap;font-family:Consolas,monospace;padding:18px">${escapeHtml(content)}</pre>`)}`);
}

function readOptional(filePath: string) {
  try { return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : 'Sin registros.'; } catch { return 'No se pudo leer.'; }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function roundMoney(value: number) {
  return Number(value.toFixed(config.decimalPlaces));
}

function detectWorkdayTurn() {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm < config.workdayPauseTime) return 'Primer bloque';
  if (hhmm < config.workdayResumeTime) return 'Pausa de mediodía';
  if (hhmm < config.workdayCloseTime) return 'Segundo bloque';
  return 'Cierre diario';
}

function openWorkdayWindow() {
  if (workdayWindow && !workdayWindow.isDestroyed()) return workdayWindow.focus();
  workdayWindow = new BrowserWindow({ width: 680, height: 680, title: 'Activar VisionControl', alwaysOnTop: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  workdayWindow.on('closed', () => { workdayWindow = null; });
  workdayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(workdayHtml())}`);
}

function workdayHtml() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Activar VisionControl</title><style>
    body{margin:0;font-family:Segoe UI,Arial;background:#f6f3ef;color:#111}main{max-width:580px;margin:auto;padding:30px}.badge{color:#ea580c;font-weight:900;letter-spacing:.16em;font-size:11px;text-transform:uppercase}h1{font-size:30px;margin:8px 0}p{color:#555;line-height:1.5}.card{background:white;border-radius:24px;padding:22px;box-shadow:0 18px 60px #0f172a14;margin-top:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.item{background:#f8fafc;border-radius:16px;padding:12px}.label{font-size:11px;text-transform:uppercase;color:#64748b;font-weight:900}.value{font-weight:900;margin-top:4px}input,textarea{width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin-top:6px;font-weight:700}button{border:0;border-radius:16px;padding:13px 16px;font-weight:900;cursor:pointer;margin:8px 6px 0 0}.primary{background:#111;color:white}.orange{background:#f97316;color:white}.ghost{background:#f1f5f9;color:#111}
  </style></head><body><main><div class="badge">VisionControl Smart Business Agent</div><h1>Activar VisionControl</h1><p>VisionControl está listo para iniciar el monitoreo empresarial de esta jornada. El sistema supervisará archivos Excel, documentos internos, pantalla empresarial autorizada, reportes de cobros y soporte remoto con permiso visible.</p><div class="card"><div class="grid"><div class="item"><div class="label">Equipo</div><div class="value">${escapeHtml(config.machineName)}</div></div><div class="item"><div class="label">Usuario</div><div class="value">${escapeHtml(os.userInfo().username)}</div></div><div class="item"><div class="label">Área</div><div class="value">${escapeHtml(config.companyArea)}</div></div><div class="item"><div class="label">Turno</div><div class="value">${detectWorkdayTurn()}</div></div><div class="item"><div class="label">Fecha</div><div class="value">${new Date().toLocaleDateString('es-PE')}</div></div><div class="item"><div class="label">Conexión</div><div class="value">${state.connected ? 'Conectado' : 'Reintentando'}</div></div></div><label>Responsable del equipo</label><input id="responsible" value="${escapeHtml(os.userInfo().username)}"><label>Área de trabajo</label><input id="area" value="${escapeHtml(config.companyArea)}"><label>Observación inicial opcional</label><textarea id="observation"></textarea><button class="primary" onclick="send('activate')">Activar jornada</button><button class="orange" onclick="send('sync')">Activar y sincronizar pendientes</button><button class="ghost" onclick="send('snooze')">Posponer 5 minutos</button><button class="ghost" onclick="send('config')">Ver configuración</button><p id="status"></p></div></main><script>const {ipcRenderer}=require('electron');function send(action){ipcRenderer.send('workday-action',{action,responsible:document.getElementById('responsible').value,area:document.getElementById('area').value,openingObservation:document.getElementById('observation').value});document.getElementById('status').innerText='Procesando...';}</script></body></html>`;
}

function activateWorkday(payload: any) {
  config.companyArea = String(payload.area || config.companyArea || 'Operaciones');
  saveConfig(config);
  activeWorkdayId = activeWorkdayId || `workday_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const event = {
    id: activeWorkdayId,
    machineId: config.machineId,
    machineName: config.machineName,
    userLocal: os.userInfo().username,
    area: config.companyArea,
    responsible: payload.responsible || os.userInfo().username,
    openingObservation: payload.openingObservation || '',
    startedAt: new Date().toISOString(),
    status: 'active',
  };
  appendLog(agentLogPath, 'Jornada activa. VisionControl está monitoreando actividad empresarial autorizada.');
  enqueueBusinessEvent('/api/workday/start', event, path.join(userDataPath, 'workday-events.jsonl'));
  config.monitoringEnabled = true;
  restartMonitor();
  restartRemoteSupport();
  updateTrayMenu();
}

function buildCloseSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = queue.filter((event) => event.timestamp?.startsWith(today));
  return {
    detectedAmount: roundMoney(todayEvents.reduce((sum, event) => sum + Number(event.detectedAmount || event.totalCollected || event.totalIncome || 0), 0)),
    confirmedAmount: 0,
    incomeAmount: roundMoney(todayEvents.reduce((sum, event) => sum + Number(event.totalIncome || 0), 0)),
    pendingReports: businessQueue.length + queue.length,
    excelFiles: new Set(todayEvents.map((event) => event.fileName)).size,
    priceChanges: todayEvents.filter((event) => event.oldValue !== undefined && event.newValue !== undefined).length,
  };
}

function openCloseWindow(reason = 'manual') {
  if (closeWindow && !closeWindow.isDestroyed()) return closeWindow.focus();
  const summary = buildCloseSummary();
  closeWindow = new BrowserWindow({ width: 720, height: 760, title: 'Guardar resumen de VisionControl', alwaysOnTop: true, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  closeWindow.on('closed', () => { closeWindow = null; });
  closeWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(closeHtml(summary, reason))}`);
}

function closeHtml(summary: any, reason: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guardar resumen de VisionControl</title><style>body{margin:0;font-family:Segoe UI,Arial;background:#0f172a;color:white}main{max-width:620px;margin:auto;padding:30px}.badge{color:#fb923c;font-weight:900;letter-spacing:.16em;font-size:11px;text-transform:uppercase}h1{font-size:28px;margin:8px 0}p{color:#cbd5e1;line-height:1.5}.card{background:#ffffff12;border:1px solid #ffffff24;border-radius:24px;padding:22px;margin-top:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.item{background:#02061766;border-radius:16px;padding:12px}.label{font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:900}.value{font-size:22px;font-weight:900;margin-top:4px}input,textarea,select{width:100%;box-sizing:border-box;border:1px solid #334155;background:#020617;color:white;border-radius:14px;padding:12px;margin-top:6px;font-weight:700}button{border:0;border-radius:16px;padding:13px 16px;font-weight:900;cursor:pointer;margin:8px 6px 0 0}.primary{background:#f97316;color:white}.ghost{background:#e2e8f0;color:#111}.danger{background:#fee2e2;color:#991b1b}</style></head><body><main><div class="badge">Cierre empresarial</div><h1>Guardar resumen de VisionControl</h1><p>Antes de finalizar, revisa y guarda el resumen de actividad empresarial detectada. Puedes confirmar, editar o dejar pendiente la subida si continuarás más tarde.</p><div class="card"><div class="grid"><div class="item"><div class="label">Total detectado hoy</div><div class="value">S/ ${summary.detectedAmount.toFixed(2)}</div></div><div class="item"><div class="label">Reportes pendientes</div><div class="value">${summary.pendingReports}</div></div><div class="item"><div class="label">Archivos Excel</div><div class="value">${summary.excelFiles}</div></div><div class="item"><div class="label">Cambios de precio</div><div class="value">${summary.priceChanges}</div></div></div><label>Total cobrado confirmado</label><input id="confirmed" type="number" step="0.01" value="${summary.confirmedAmount}"><label>Total ingresado confirmado</label><input id="income" type="number" step="0.01" value="${summary.incomeAmount}"><label>Responsable que confirma</label><input id="responsible" value="${escapeHtml(os.userInfo().username)}"><label>Estado del cierre</label><select id="status"><option value="midday_pause">Pausa de mediodía</option><option value="final_close">Cierre final del día</option><option value="partial_close">Cierre parcial</option><option value="pending_close">Cierre pendiente</option></select><label>Observación del cierre</label><textarea id="observation"></textarea><button class="ghost" onclick="send(false,'local')">Guardar resumen local</button><button class="primary" onclick="send(true,'submit')">Guardar y subir ahora</button><button class="ghost" onclick="send(false,'later')">Continuar después</button><button class="danger" onclick="send(false,'cancel')">Cancelar apagado si es posible</button><p id="result"></p></div></main><script>const {ipcRenderer}=require('electron');function send(submitNow,action){ipcRenderer.send('daily-close-save',{submitNow,action,reason:'${reason}',confirmedAmount:Number(document.getElementById('confirmed').value||0),incomeAmount:Number(document.getElementById('income').value||0),responsible:document.getElementById('responsible').value,status:document.getElementById('status').value,observation:document.getElementById('observation').value});document.getElementById('result').innerText='Resumen guardado localmente. Se sincronizará automáticamente cuando vuelva la conexión.'}</script></body></html>`;
}

function saveDailyClose(payload: any) {
  const summary = buildCloseSummary();
  const event = {
    id: `daily_close_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    machineId: config.machineId,
    machineName: config.machineName,
    workdayId: activeWorkdayId,
    detectedAmount: summary.detectedAmount,
    confirmedAmount: Number(payload.confirmedAmount || 0),
    incomeAmount: Number(payload.incomeAmount || 0),
    pendingReports: summary.pendingReports,
    observation: payload.observation || '',
    responsible: payload.responsible || os.userInfo().username,
    status: payload.status || 'pending_close',
    submitNow: Boolean(payload.submitNow),
    createdAt: new Date().toISOString(),
  };
  enqueueBusinessEvent('/api/daily-close', event, dailyCloseLogPath);
  if (event.status === 'final_close') enqueueBusinessEvent('/api/workday/close', { machineId: config.machineId, workdayId: activeWorkdayId, closingObservation: event.observation, responsible: event.responsible }, path.join(userDataPath, 'workday-events.jsonl'));
}

app.whenReady().then(() => {
  createTray();
  startAgent();
  openMainWindow();
  setTimeout(() => openWorkdayWindow(), 1200);
  if (needsInitialConfiguration()) openConfigWindow();
});

app.on('window-all-closed', () => {
  // Mantener el agente activo en segundo plano con icono de bandeja.
});

app.on('before-quit', (event) => {
  if (!isQuittingAfterCloseSummary) {
    event.preventDefault();
    openCloseWindow('before_quit');
    return;
  }
  monitor?.stop();
  remoteSupport?.stop();
  if (syncInterval) clearInterval(syncInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
});

const { ipcMain } = require('electron') as typeof import('electron');
ipcMain.on('agent-config-save', (_event, partialConfig: Partial<AgentConfig>) => {
  config = {
    ...config,
    ...partialConfig,
    allowedExtensions: config.allowedExtensions?.length ? config.allowedExtensions : ['.xlsx', '.xls', '.xlsm', '.xlsb', '.csv', '.pdf'],
    machineId: config.machineId || stableMachineId(),
  };
  saveConfig(config);
  restartMonitor();
  restartRemoteSupport();
  startTimers();
  registerAgent().catch((error) => appendLog(errorLogPath, `Registro tras configuración falló: ${String(error)}`));
});

ipcMain.on('workday-action', (_event, payload: any) => {
  if (payload.action === 'config') return openConfigWindow();
  if (payload.action === 'snooze') {
    workdayWindow?.close();
    setTimeout(() => openWorkdayWindow(), 5 * 60 * 1000);
    return;
  }
  activateWorkday(payload);
  if (payload.action === 'sync') syncBusinessQueue().catch(() => undefined);
  workdayWindow?.close();
});

ipcMain.on('daily-close-save', (_event, payload: any) => {
  saveDailyClose(payload);
  closeWindow?.close();
  if (payload.action === 'cancel') return;
  if (payload.reason === 'before_quit') {
    isQuittingAfterCloseSummary = true;
    app.quit();
  }
});

process.on('uncaughtException', (error) => appendLog(errorLogPath, `Error no controlado: ${String(error.stack || error)}`));
process.on('unhandledRejection', (error) => appendLog(errorLogPath, `Promesa rechazada: ${String(error)}`));

if (process.platform === 'win32') {
  app.setAppUserModelId('VisionControl.ExcelAgent');
}
