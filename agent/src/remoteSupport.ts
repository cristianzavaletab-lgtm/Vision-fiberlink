import { BrowserWindow, desktopCapturer, screen } from 'electron';
import { io, Socket } from 'socket.io-client';
import os from 'os';
import fs from 'fs';
import path from 'path';
import koffi from 'koffi';

export type RemoteControlMode = 'disabled' | 'request_permission' | 'company_managed';

export interface RemoteSupportConfig {
  serverUrl: string;
  accessToken: string;
  machineId: string;
  machineName: string;
  companyArea: string;
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
}

interface RemoteSession {
  sessionId: string;
  machineId: string;
  machineName: string;
  screenViewStarted: boolean;
  remoteControlRequested: boolean;
  remoteControlAccepted: boolean;
  voiceStarted: boolean;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'closed' | 'rejected';
  summary: string;
}

interface LoggerPaths {
  remoteSessionsLogPath: string;
  alertsLogPath: string;
  errorLogPath: string;
}

let SetCursorPos: any = null;
let mouseEvent: any = null;
let keybdEvent: any = null;
let mapVirtualKey: any = null;
let apiLoaded = false;

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;
const KEYEVENTF_KEYUP = 0x0002;
const VK: Record<string, number> = {
  enter: 0x0D, tab: 0x09, escape: 0x1B, backspace: 0x08, delete: 0x2E, space: 0x20,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  control: 0x11, alt: 0x12, shift: 0x10,
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47, h: 0x48,
  i: 0x49, j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E, o: 0x4F, p: 0x50,
  q: 0x51, r: 0x52, s: 0x53, t: 0x54, u: 0x55, v: 0x56, w: 0x57, x: 0x58,
  y: 0x59, z: 0x5A, '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
};

function loadWindowsInputApi() {
  if (apiLoaded || process.platform !== 'win32') return apiLoaded;
  try {
    const user32 = koffi.load('user32.dll');
    SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');
    mouseEvent = user32.func('void mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, int32 dwData, uintptr_t dwExtraInfo)');
    keybdEvent = user32.func('void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)');
    mapVirtualKey = user32.func('uint32 MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
    apiLoaded = true;
  } catch {
    apiLoaded = false;
  }
  return apiLoaded;
}

export class RemoteSupportModule {
  private config: RemoteSupportConfig;
  private paths: LoggerPaths;
  private socket: Socket | null = null;
  private activeSession: RemoteSession | null = null;
  private indicatorWindow: BrowserWindow | null = null;
  private permissionWindow: BrowserWindow | null = null;
  private streamTimer: NodeJS.Timeout | null = null;
  private streamOptions = { fps: 4, quality: 55 };

  constructor(config: RemoteSupportConfig, paths: LoggerPaths) {
    this.config = config;
    this.paths = paths;
    loadWindowsInputApi();
  }

  updateConfig(config: RemoteSupportConfig) {
    this.config = config;
    if (!config.remoteSupportEnabled) this.endSession('Soporte remoto desactivado por configuración.');
  }

  start() {
    if (!this.config.remoteSupportEnabled) return;
    this.socket = io(`${this.config.serverUrl.replace(/\/$/, '')}/agent`, {
      auth: { token: this.config.accessToken },
      query: { token: this.config.accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.log(this.paths.remoteSessionsLogPath, '[INFO] Agente de soporte remoto conectado.');
      this.socket?.emit('agent:register', {
        deviceId: this.config.machineId,
        name: this.config.machineName,
        os: `${os.type()} ${os.release()}`,
        mode: 'excel_audit_remote_support',
        companyArea: this.config.companyArea,
        remoteSupportEnabled: this.config.remoteSupportEnabled,
        remoteSupportActive: this.isActive(),
      });
    });

    this.socket.on('remote-support:screen-start', (data) => this.startScreenSession(data));
    this.socket.on('remote-support:screen-stop', () => this.stopScreenStream());
    this.socket.on('remote-support:request-control', (data) => this.requestControl(data));
    this.socket.on('remote-support:end', (data) => this.endSession(data?.summary || 'Sesión finalizada por administrador.'));
    this.socket.on('remote-support:mouse', (data) => this.handleMouse(data));
    this.socket.on('remote-support:keyboard', (data) => this.handleKeyboard(data));
    this.socket.on('remote-support:quality', (data) => this.updateStreamQuality(data));
    this.socket.on('support-alert:show', (data) => this.showAlert(data));
    this.socket.on('voice:request', (data) => this.requestVoice(data));
  }

  stop() {
    this.endSession('Agente detenido.');
    this.socket?.close();
    this.socket = null;
  }

  isActive() {
    return !!this.activeSession;
  }

  private startScreenSession(data: any) {
    if (!this.config.remoteSupportEnabled || !this.config.screenViewEnabled) {
      this.socket?.emit('remote-support:session-error', { machineId: this.config.machineId, message: 'Ver pantalla está desactivado en esta máquina.' });
      return;
    }

    const sessionId = data?.sessionId || `session-${Date.now()}`;
    this.activeSession = {
      sessionId,
      machineId: this.config.machineId,
      machineName: this.config.machineName,
      screenViewStarted: true,
      remoteControlRequested: false,
      remoteControlAccepted: false,
      voiceStarted: false,
      startedAt: new Date().toISOString(),
      status: 'active',
      summary: 'Sesión de soporte remoto iniciada.',
    };
    this.updateStreamQuality(data || {});
    this.showIndicator('Soporte remoto activo', 'El administrador está conectado a esta máquina.');
    this.logSession(this.activeSession);
    this.socket?.emit('remote-support:session-started', this.activeSession);
    this.startScreenStream();
  }

  private startScreenStream() {
    this.stopScreenStream(false);
    const sendFrame = async () => {
      if (!this.activeSession || !this.socket?.connected) return;
      try {
        const primary = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
        const source = sources[0];
        if (!source) return;
        const image = `data:image/jpeg;base64,${source.thumbnail.toJPEG(this.streamOptions.quality).toString('base64')}`;
        this.socket.emit('remote-support:frame', {
          sessionId: this.activeSession.sessionId,
          machineId: this.config.machineId,
          image,
          metadata: {
            width: primary.bounds.width,
            height: primary.bounds.height,
            quality: this.streamOptions.quality,
            fps: this.streamOptions.fps,
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        this.log(this.paths.errorLogPath, `[ERROR] No se pudo iniciar transmisión de pantalla: ${String(error)}`);
      }
    };
    void sendFrame();
    this.streamTimer = setInterval(sendFrame, Math.max(250, Math.floor(1000 / this.streamOptions.fps)));
  }

  private stopScreenStream(emit = true) {
    if (this.streamTimer) clearInterval(this.streamTimer);
    this.streamTimer = null;
    if (emit && this.activeSession) this.socket?.emit('remote-support:screen-stopped', { sessionId: this.activeSession.sessionId, machineId: this.config.machineId });
  }

  private requestControl(data: any) {
    if (!this.activeSession) this.startScreenSession(data);
    if (!this.activeSession) return;
    this.activeSession.remoteControlRequested = true;

    if (!this.config.remoteControlEnabled || this.config.remoteControlMode === 'disabled') {
      this.rejectControl('Control remoto desactivado en esta máquina.');
      return;
    }

    if (this.config.remoteControlMode === 'company_managed') {
      this.acceptControl('Modo empresa administrada: control permitido con aviso visible.');
      return;
    }

    this.showPermissionWindow(
      'Solicitud de soporte remoto',
      'El administrador solicita control remoto para brindar soporte. ¿Desea permitir el control de esta máquina?',
      () => this.acceptControl('Usuario aceptó control remoto.'),
      () => this.rejectControl('Usuario rechazó solicitud de control remoto.')
    );
  }

  private acceptControl(summary: string) {
    if (!this.activeSession) return;
    this.activeSession.remoteControlAccepted = true;
    this.activeSession.summary = summary;
    this.showIndicator('Control remoto autorizado', 'El administrador puede usar mouse y teclado en esta sesión.');
    this.log(this.paths.remoteSessionsLogPath, `[INFO] ${summary}`);
    this.socket?.emit('remote-support:control-accepted', this.activeSession);
  }

  private rejectControl(summary: string) {
    if (!this.activeSession) return;
    this.activeSession.remoteControlAccepted = false;
    this.activeSession.summary = summary;
    this.log(this.paths.remoteSessionsLogPath, `[WARN] ${summary}`);
    this.socket?.emit('remote-support:control-rejected', this.activeSession);
  }

  private handleMouse(data: any) {
    if (!this.activeSession?.remoteControlAccepted || !apiLoaded) return;
    const display = screen.getPrimaryDisplay();
    const x = Math.round(display.bounds.x + clamp(Number(data.x), 0, 1) * display.bounds.width);
    const y = Math.round(display.bounds.y + clamp(Number(data.y), 0, 1) * display.bounds.height);
    try {
      SetCursorPos(x, y);
      if (data.type === 'click') {
        mouseEvent(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        mouseEvent(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
      }
      if (data.type === 'rightclick') {
        mouseEvent(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
        mouseEvent(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
      }
      if (data.type === 'scroll') mouseEvent(MOUSEEVENTF_WHEEL, 0, 0, Math.round(Number(data.deltaY || 0) * 120), 0);
    } catch (error) {
      this.log(this.paths.errorLogPath, `[ERROR] No se pudo ejecutar mouse remoto: ${String(error)}`);
    }
  }

  private handleKeyboard(data: any) {
    if (!this.activeSession?.remoteControlAccepted || !apiLoaded) return;
    const key = String(data.key || '').toLowerCase();
    const vk = VK[key];
    if (!vk) return;
    try {
      const scan = mapVirtualKey ? mapVirtualKey(vk, 0) : 0;
      keybdEvent(vk, scan, 0, 0);
      keybdEvent(vk, scan, KEYEVENTF_KEYUP, 0);
    } catch (error) {
      this.log(this.paths.errorLogPath, `[ERROR] No se pudo ejecutar teclado remoto: ${String(error)}`);
    }
  }

  private updateStreamQuality(data: any) {
    const requestedQuality = data.quality === 'high' ? 75 : data.quality === 'low' ? 35 : data.quality === 'medium' ? 55 : Number(data.quality || 55);
    const quality = Number.isFinite(requestedQuality) ? requestedQuality : 55;
    const fps = Number(data.fps || (data.quality === 'high' ? 8 : data.quality === 'low' ? 2 : 4));
    this.streamOptions = { quality: clamp(quality, 25, 85), fps: clamp(fps, 1, 10) };
    if (this.streamTimer) this.startScreenStream();
  }

  private showAlert(data: any) {
    if (!this.config.alertsEnabled) return;
    const alertId = data.alertId || `alert-${Date.now()}`;
    const title = String(data.title || 'Mensaje empresarial');
    const message = String(data.message || '');
    this.log(this.paths.alertsLogPath, JSON.stringify({ ...data, alertId, receivedAt: new Date().toISOString(), status: 'received' }));

    const requiresConfirmation = this.config.alertRequiresConfirmation || Boolean(data.requiresConfirmation);

    this.showPermissionWindow(
      title,
      message,
      () => {
        this.log(this.paths.alertsLogPath, JSON.stringify({ alertId, status: 'confirmed', confirmedAt: new Date().toISOString() }));
        this.socket?.emit('support-alert:confirmed', { alertId, machineId: this.config.machineId, confirmedAt: new Date().toISOString() });
      },
      requiresConfirmation ? () => {
        this.log(this.paths.alertsLogPath, JSON.stringify({ alertId, status: 'rejected', rejectedAt: new Date().toISOString() }));
        this.socket?.emit('support-alert:rejected', { alertId, machineId: this.config.machineId, rejectedAt: new Date().toISOString() });
      } : undefined,
      requiresConfirmation ? ['Confirmar', 'Rechazar'] : ['Entendido']
    );
  }

  private requestVoice(data: any) {
    if (!this.config.voiceSupportEnabled) {
      this.socket?.emit('voice:rejected', { machineId: this.config.machineId, reason: 'Comunicación de voz desactivada.' });
      return;
    }
    if (!this.activeSession) this.startScreenSession(data);
    const accept = () => {
      if (this.activeSession) this.activeSession.voiceStarted = true;
      this.showIndicator('Comunicación de soporte activa', 'Canal de comunicación autorizado. No se graba audio por defecto.');
      this.log(this.paths.remoteSessionsLogPath, '[INFO] Comunicación de voz aceptada.');
      this.socket?.emit('voice:accepted', { sessionId: this.activeSession?.sessionId, machineId: this.config.machineId });
    };
    const reject = () => {
      this.log(this.paths.remoteSessionsLogPath, '[WARN] Usuario rechazó comunicación de voz.');
      this.socket?.emit('voice:rejected', { sessionId: this.activeSession?.sessionId, machineId: this.config.machineId });
    };
    if (this.config.voiceRequiresPermission) {
      this.showPermissionWindow('Comunicación de soporte', 'El administrador desea iniciar una comunicación de voz para soporte. ¿Desea aceptar?', accept, reject, ['Aceptar', 'Rechazar']);
    } else accept();
  }

  private endSession(summary: string) {
    this.stopScreenStream(false);
    this.indicatorWindow?.close();
    this.indicatorWindow = null;
    this.permissionWindow?.close();
    this.permissionWindow = null;
    if (!this.activeSession) return;
    this.activeSession.endedAt = new Date().toISOString();
    this.activeSession.status = 'closed';
    this.activeSession.summary = summary;
    this.logSession(this.activeSession);
    this.socket?.emit('remote-support:session-ended', this.activeSession);
    this.activeSession = null;
  }

  private showIndicator(title: string, message: string) {
    if (!this.config.showRemoteSessionIndicator && this.config.remoteControlMode !== 'company_managed') return;
    if (this.indicatorWindow && !this.indicatorWindow.isDestroyed()) this.indicatorWindow.close();
    this.indicatorWindow = new BrowserWindow({
      width: 390,
      height: 118,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    const display = screen.getPrimaryDisplay();
    this.indicatorWindow.setPosition(display.workArea.x + display.workArea.width - 410, display.workArea.y + 20);
    this.indicatorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(indicatorHtml(title, message))}`);
  }

  private showPermissionWindow(title: string, message: string, onAccept: () => void, onReject?: () => void, labels = ['Permitir', 'Rechazar']) {
    if (this.permissionWindow && !this.permissionWindow.isDestroyed()) this.permissionWindow.close();
    this.permissionWindow = new BrowserWindow({ width: 520, height: 280, title, alwaysOnTop: true, resizable: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    this.permissionWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(permissionHtml(title, message, labels))}`);
    this.permissionWindow.webContents.once('did-finish-load', () => {
      this.permissionWindow?.webContents.executeJavaScript(`
        const { ipcRenderer } = require('electron');
        document.getElementById('accept').onclick = () => ipcRenderer.send('remote-support-permission', 'accept');
        const reject = document.getElementById('reject');
        if (reject) reject.onclick = () => ipcRenderer.send('remote-support-permission', 'reject');
      `).catch(() => undefined);
    });
    const { ipcMain } = require('electron') as typeof import('electron');
    ipcMain.once('remote-support-permission', (_event, action: string) => {
      this.permissionWindow?.close();
      this.permissionWindow = null;
      if (action === 'accept') onAccept();
      else onReject?.();
    });
  }

  private logSession(session: RemoteSession) {
    this.log(this.paths.remoteSessionsLogPath, JSON.stringify(session));
  }

  private log(filePath: string, message: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `[${new Date().toISOString()}] ${message}\n`);
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function indicatorHtml(title: string, message: string) {
  return `<body style="margin:0;font-family:Segoe UI,Arial;background:#111;color:white;border:3px solid #f97316;border-radius:18px;overflow:hidden">
    <div style="padding:16px 18px">
      <div style="font-size:12px;color:#fb923c;font-weight:900;letter-spacing:.12em;text-transform:uppercase">VisionControl Empresarial</div>
      <div style="font-size:18px;font-weight:900;margin-top:5px">${escapeHtml(title)}</div>
      <div style="font-size:13px;color:#d4d4d8;margin-top:5px;line-height:1.35">${escapeHtml(message)}</div>
    </div>
  </body>`;
}

function permissionHtml(title: string, message: string, labels: string[]) {
  const reject = labels[1] ? `<button id="reject" style="background:#f3f4f6;color:#111">${escapeHtml(labels[1])}</button>` : '';
  return `<body style="margin:0;font-family:Segoe UI,Arial;background:#f6f3ef;color:#111">
    <main style="padding:26px">
      <div style="font-size:11px;color:#ea580c;font-weight:900;letter-spacing:.16em;text-transform:uppercase">Soporte remoto autorizado</div>
      <h1 style="font-size:24px;margin:8px 0 10px">${escapeHtml(title)}</h1>
      <p style="font-size:15px;line-height:1.5;color:#555">${escapeHtml(message)}</p>
      <div style="display:flex;gap:12px;margin-top:22px">
        <button id="accept" style="background:#111;color:white">${escapeHtml(labels[0])}</button>${reject}
      </div>
    </main>
    <style>button{border:0;border-radius:14px;padding:13px 18px;font-weight:900;cursor:pointer}</style>
  </body>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
}
