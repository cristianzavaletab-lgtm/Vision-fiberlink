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
  allowedExtensions: string[];
  currency: string;
  decimalPlaces: number;
  syncIntervalSeconds: number;
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
const alertsLogPath = path.join(userDataPath, 'alerts.jsonl');

let config = loadConfig();
let tray: Tray | null = null;
let configWindow: BrowserWindow | null = null;
let logWindow: BrowserWindow | null = null;
let monitor: ExcelMonitor | null = null;
let remoteSupport: RemoteSupportModule | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let queue: QueueItem[] = loadQueue();

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
    allowedExtensions: ['.xlsx', '.xls', '.xlsm', '.csv'],
    currency: 'PEN',
    decimalPlaces: 2,
    syncIntervalSeconds: 30,
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

function saveQueue() {
  state.pendingEvents = queue.length;
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  updateTrayMenu();
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
    watchFolders: config.watchFolders,
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
      monitoredFolders: config.watchFolders.length,
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
  registerAgent().catch((error) => appendLog(errorLogPath, `Registro inicial falló: ${String(error)}`));
  restartMonitor();
  restartRemoteSupport();
  startTimers();
}

function startTimers() {
  if (syncInterval) clearInterval(syncInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  syncInterval = setInterval(() => {
    syncQueue().catch((error) => appendLog(errorLogPath, `Sync interval error: ${String(error)}`));
    pullRemoteConfig().catch(() => undefined);
  }, Math.max(5, config.syncIntervalSeconds) * 1000);

  heartbeatInterval = setInterval(() => {
    sendHeartbeat().catch(() => undefined);
  }, 15000);

  sendHeartbeat().catch(() => undefined);
  syncQueue().catch(() => undefined);
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
    watchFolders: config.watchFolders,
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
  }, { remoteSessionsLogPath, alertsLogPath, errorLogPath });
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
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('VisionControl Excel Agent');
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'VisionControl Excel Agent', enabled: false },
    { label: `Estado: ${state.monitoringPaused ? 'Pausado' : state.connected ? 'Activo' : 'Sin conexión'}`, enabled: false },
    { label: `Soporte remoto: ${config.remoteSupportEnabled ? 'Disponible' : 'Desactivado'}`, enabled: false },
    { label: `Última sincronización: ${state.lastSync ? formatTime(state.lastSync) : 'pendiente'}`, enabled: false },
    { label: `Eventos pendientes: ${queue.length}`, enabled: false },
    { type: 'separator' },
    { label: 'Sincronizar ahora', click: () => syncQueue().catch((error) => appendLog(errorLogPath, String(error))) },
    { label: config.monitoringEnabled ? 'Pausar monitoreo' : 'Activar monitoreo', click: pauseOrResumeMonitoring },
    { label: config.remoteSupportEnabled ? 'Desactivar soporte remoto' : 'Activar soporte remoto', click: toggleRemoteSupport },
    { label: 'Abrir configuración', click: openConfigWindow },
    { label: 'Ver registros locales', click: openLogWindow },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
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
    '\nalerts.jsonl',
    readOptional(alertsLogPath),
    '\nEventos pendientes',
    JSON.stringify(queue.slice(-50), null, 2),
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

app.whenReady().then(() => {
  createTray();
  startAgent();
  if (!config.isConfigured || config.watchFolders.length === 0 || !config.accessToken) openConfigWindow();
});

app.on('window-all-closed', () => {
  // Mantener el agente activo en segundo plano con icono de bandeja.
});

app.on('before-quit', () => {
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
    allowedExtensions: config.allowedExtensions?.length ? config.allowedExtensions : ['.xlsx', '.xls', '.xlsm', '.csv'],
    machineId: config.machineId || stableMachineId(),
  };
  saveConfig(config);
  restartMonitor();
  restartRemoteSupport();
  startTimers();
  registerAgent().catch((error) => appendLog(errorLogPath, `Registro tras configuración falló: ${String(error)}`));
});

process.on('uncaughtException', (error) => appendLog(errorLogPath, `Error no controlado: ${String(error.stack || error)}`));
process.on('unhandledRejection', (error) => appendLog(errorLogPath, `Promesa rechazada: ${String(error)}`));

if (process.platform === 'win32') {
  app.setAppUserModelId('VisionControl.ExcelAgent');
}
