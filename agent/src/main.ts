import { app, desktopCapturer, screen as electronScreen, BrowserWindow, ipcMain, session } from 'electron';
import { io, Socket } from 'socket.io-client';
import os from 'os';
import path from 'path';
import fs from 'fs';
import koffi from 'koffi';
import { exec, spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';

// Global declaration for audio playback window
declare global {
  var audioWindow: BrowserWindow | null;
  var webrtcWindow: BrowserWindow | null;
}
global.audioWindow = null;
global.webrtcWindow = null;

// ═══════════════════════════════════════════════════════════════════
// VisionControl Agent - Full Remote Control for Windows
// Uses Win32 API directly via koffi for instant (<1ms) input control
// ═══════════════════════════════════════════════════════════════════

// ─── Load config ───
const isPackaged = app.isPackaged;

// Template config from resources (read-only in packaged apps)
const templateConfigPath = isPackaged
  ? path.join(process.resourcesPath, 'config.json')
  : path.join(process.cwd(), 'config.json');

// Writable config path (always use userData for persistence)
const userDataPath = app.getPath('userData');
const writableConfigPath = path.join(userDataPath, 'config.json');

// Desactivar política de autoplay para permitir audio sin interacción
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true');
app.commandLine.appendSwitch('disable-renderer-backgrounding', 'true');

let config: any = { serverUrl: 'https://visioncontrol-server.onrender.com', screenshotInterval: 2000, quality: 60, fps: 2 };

// 1. Try to load from writable path first (has hardwareId persisted)
let configLoaded = false;
try {
  if (fs.existsSync(writableConfigPath)) {
    const raw = fs.readFileSync(writableConfigPath, 'utf-8');
    config = { ...config, ...JSON.parse(raw) };
    configLoaded = true;
  }
} catch {}

// 2. If no writable config, load from template (resources or cwd)
if (!configLoaded) {
  try {
    const raw = fs.readFileSync(templateConfigPath, 'utf-8');
    config = { ...config, ...JSON.parse(raw) };
  } catch {
    console.warn('[Config] No se encontro config.json, usando defaults');
  }
}

// Generate unique hardware ID if not exists and persist to writable location
if (!config.hardwareId) {
  config.hardwareId = crypto.randomUUID();
}

// Always save to writable path to ensure persistence
try {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  fs.writeFileSync(writableConfigPath, JSON.stringify(config, null, 2));
} catch (err) {
  console.error('[Config] Error guardando config:', err);
}

console.log(`[Config] servidor=${config.serverUrl}, hardwareId=${config.hardwareId}, fps=${config.fps}, quality=${config.quality}`);

const SERVER_URL = config.serverUrl;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Agent] Ya hay otra instancia corriendo, cerrando...');
  app.quit();
}

let socket: Socket;
let lastTimeoutId: NodeJS.Timeout | null = null;
let isBeingWatched = false;
let isScreenshotLoopRunning = false;
let currentFps = 2;
let currentQuality = 60;

function updateStreamingSpeed() {
  if (isRemoteActive || isBeingWatched) {
    // Active mode: guarantee at least 20 FPS during remote session for responsiveness, otherwise use setting FPS
    const fps = isRemoteActive ? Math.max(config.fps || 15, 20) : (config.fps || 15);
    const quality = config.quality || 60;
    console.log(`[Stream] Cambiando a FPS ALTO: ${fps} FPS, Calidad: ${quality}%`);
    startScreenshotLoop(fps, quality);
  } else {
    // Idle mode
    console.log(`[Stream] Cambiando a FPS IDLE: 2 FPS, Calidad: 50%`);
    startScreenshotLoop(2, 50);
  }
}

// ─── CPU Measurement ───
let previousCpuTimes: { idle: number; total: number } | null = null;

function getCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

function getCpuPercent(): number {
  const current = getCpuTimes();
  if (!previousCpuTimes) { previousCpuTimes = current; return 0; }
  const idleDelta = current.idle - previousCpuTimes.idle;
  const totalDelta = current.total - previousCpuTimes.total;
  previousCpuTimes = current;
  if (totalDelta === 0) return 0;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
}

// ═══════════════════════════════════════════════════════════════════
// Windows API via koffi - DIRECT Win32 calls, instant response
// ═══════════════════════════════════════════════════════════════════

let SetCursorPos: any = null;
let GetSystemMetrics: any = null;
let mouse_event_fn: any = null;
let keybd_event_fn: any = null;
let MapVirtualKeyW: any = null;
let GetForegroundWindow: any = null;
let GetWindowTextW: any = null;
let BlockInput: any = null;
let GetDoubleClickTime: any = null;
let apiLoaded = false;

const MOUSEEVENTF_LEFTDOWN    = 0x0002;
const MOUSEEVENTF_LEFTUP      = 0x0004;
const MOUSEEVENTF_RIGHTDOWN   = 0x0008;
const MOUSEEVENTF_RIGHTUP     = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN  = 0x0020;
const MOUSEEVENTF_MIDDLEUP    = 0x0040;
const MOUSEEVENTF_WHEEL       = 0x0800;
const MOUSEEVENTF_HWHEEL      = 0x1000;

const KEYEVENTF_KEYUP         = 0x0002;
const KEYEVENTF_EXTENDEDKEY   = 0x0001;

// Complete Virtual Key Code map
const VK_MAP: Record<string, number> = {
  // Navigation & editing
  enter: 0x0D, backspace: 0x08, tab: 0x09, escape: 0x1B, space: 0x20,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  delete: 0x2E, insert: 0x2D, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  // Modifiers
  control: 0x11, alt: 0x12, shift: 0x10, command: 0x5B, menu: 0x5D,
  // Lock keys
  capslock: 0x14, numlock: 0x90, scrolllock: 0x91,
  // Function keys
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  // Letters
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47, h: 0x48,
  i: 0x49, j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E, o: 0x4F, p: 0x50,
  q: 0x51, r: 0x52, s: 0x53, t: 0x54, u: 0x55, v: 0x56, w: 0x57, x: 0x58,
  y: 0x59, z: 0x5A,
  // Numbers
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
  // Symbols
  ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE,
  '/': 0xBF, '`': 0xC0, '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE,
  // Special
  printscreen: 0x2C, pause: 0x13,
};

const EXTENDED_KEYS = new Set([0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x21, 0x22, 0x23, 0x24, 0x5B, 0x5D]);

function loadWindowsAPI(): boolean {
  try {
    const user32 = koffi.load('user32.dll');

    SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');
    GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');
    mouse_event_fn = user32.func('void mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, int32 dwData, uintptr_t dwExtraInfo)');
    keybd_event_fn = user32.func('void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)');
    MapVirtualKeyW = user32.func('uint32 MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
    GetForegroundWindow = user32.func('void* GetForegroundWindow()');
    GetWindowTextW = user32.func('int GetWindowTextW(void* hWnd, _Out_ char16_t* lpString, int nMaxCount)');
    GetDoubleClickTime = user32.func('uint32 GetDoubleClickTime()');

    // BlockInput requires admin privileges - load but don't fail if unavailable
    try {
      BlockInput = user32.func('bool BlockInput(bool fBlockInput)');
    } catch {
      console.warn('[API] BlockInput no disponible (requiere permisos de administrador)');
      BlockInput = null;
    }

    apiLoaded = true;
    console.log('[API] Windows API cargada - control remoto INSTANT habilitado');
    return true;
  } catch (err) {
    console.error('[API] ERROR cargando Windows API:', err);
    apiLoaded = false;
    return false;
  }
}

// ─── Control Functions (instant, <1ms) ───

function moveMouse(x: number, y: number) {
  if (!SetCursorPos) return;
  try { SetCursorPos(Math.round(x), Math.round(y)); } catch {}
}

function clickMouse(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left') {
  moveMouse(x, y);
  if (!mouse_event_fn) return;
  try {
    if (button === 'right') {
      mouse_event_fn(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
    } else if (button === 'middle') {
      mouse_event_fn(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
    } else {
      mouse_event_fn(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
      mouse_event_fn(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }
  } catch {}
}

function mouseDown(x: number, y: number, button: 'left' | 'right' = 'left') {
  moveMouse(x, y);
  if (!mouse_event_fn) return;
  try { mouse_event_fn(button === 'right' ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); } catch {}
}

function mouseUp(x: number, y: number, button: 'left' | 'right' = 'left') {
  moveMouse(x, y);
  if (!mouse_event_fn) return;
  try { mouse_event_fn(button === 'right' ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP, 0, 0, 0, 0); } catch {}
}

function pressKey(key: string, modifiers: string[] = []) {
  if (!keybd_event_fn) return;
  try {
    // Press modifiers down
    const modVks: number[] = [];
    for (const mod of modifiers) {
      const vk = VK_MAP[mod];
      if (vk) {
        modVks.push(vk);
        const scan = MapVirtualKeyW ? MapVirtualKeyW(vk, 0) : 0;
        keybd_event_fn(vk, scan, EXTENDED_KEYS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0, 0);
      }
    }
    // Press and release main key
    const vk = VK_MAP[key];
    if (vk) {
      const scan = MapVirtualKeyW ? MapVirtualKeyW(vk, 0) : 0;
      const ext = EXTENDED_KEYS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0;
      keybd_event_fn(vk, scan, ext, 0);
      keybd_event_fn(vk, scan, ext | KEYEVENTF_KEYUP, 0);
    }
    // Release modifiers (reverse order)
    for (let i = modVks.length - 1; i >= 0; i--) {
      const scan = MapVirtualKeyW ? MapVirtualKeyW(modVks[i], 0) : 0;
      keybd_event_fn(modVks[i], scan, (EXTENDED_KEYS.has(modVks[i]) ? KEYEVENTF_EXTENDEDKEY : 0) | KEYEVENTF_KEYUP, 0);
    }
  } catch {}
}

function scrollMouse(deltaY: number, deltaX: number = 0) {
  if (!mouse_event_fn) return;
  try {
    // Vertical scroll
    if (deltaY !== 0) {
      mouse_event_fn(MOUSEEVENTF_WHEEL, 0, 0, Math.round(deltaY * 120), 0);
    }
    // Horizontal scroll
    if (deltaX !== 0) {
      mouse_event_fn(MOUSEEVENTF_HWHEEL, 0, 0, Math.round(deltaX * 120), 0);
    }
  } catch {}
}

function getActiveWindow(): string {
  if (!GetForegroundWindow || !GetWindowTextW) return '';
  try {
    const hwnd = GetForegroundWindow();
    if (!hwnd) return '';
    const buf = Buffer.alloc(512);
    const len = GetWindowTextW(hwnd, buf, 256);
    if (len > 0) return buf.toString('utf16le').replace(/\0/g, '').trim();
  } catch {}
  return '';
}

function getScreenSize(): { width: number; height: number } {
  // Uses Electron screen module for accuracy (supports multi-monitor)
  try {
    const primary = electronScreen.getPrimaryDisplay();
    return { width: primary.bounds.width, height: primary.bounds.height };
  } catch {}
  // Fallback to Win32 API
  if (GetSystemMetrics) {
    try {
      const w = GetSystemMetrics(0);
      const h = GetSystemMetrics(1);
      if (w > 0 && h > 0) return { width: w, height: h };
    } catch {}
  }
  return { width: 1920, height: 1080 };
}

// ═══════════════════════════════════════════════════════════════════
// Socket Connection & Event Handlers
// ═══════════════════════════════════════════════════════════════════

let cachedScreenSize: { width: number; height: number } | null = null;
let activeMonitorId: string | null = null;
let lastImageBase64: string | null = null;
let heartbeatIntervalId: NodeJS.Timeout | null = null;
let terminalProcess: ChildProcess | null = null;
let isRemoteActive = false;

// ─── Multi-Monitor: Bounds tracking ───
// Maps desktopCapturer source.id -> display bounds (absolute position in virtual screen)
interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
const monitorBoundsMap = new Map<string, MonitorBounds>();
let activeMonitorBounds: MonitorBounds | null = null;

/**
 * Refreshes the monitorBoundsMap by matching desktopCapturer source IDs
 * to Electron's screen.getAllDisplays() bounds.
 * This allows us to know the exact pixel position of each monitor.
 */
async function refreshMonitorBounds(): Promise<void> {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    const displays = electronScreen.getAllDisplays();

    for (const source of sources) {
      // source.display_id corresponds to Display.id
      const display = displays.find(d => d.id.toString() === source.display_id);
      if (display) {
        monitorBoundsMap.set(source.id, {
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height,
        });
      }
    }

    // Update active monitor bounds if one is selected
    if (activeMonitorId && monitorBoundsMap.has(activeMonitorId)) {
      activeMonitorBounds = monitorBoundsMap.get(activeMonitorId)!;
    } else {
      // Default to primary display
      const primary = electronScreen.getPrimaryDisplay();
      activeMonitorBounds = {
        x: primary.bounds.x,
        y: primary.bounds.y,
        width: primary.bounds.width,
        height: primary.bounds.height,
      };
    }

    console.log(`[Monitor] Bounds actualizados: ${monitorBoundsMap.size} monitores mapeados`);
  } catch (err) {
    console.error('[Monitor] Error refrescando bounds:', err);
  }
}

/**
 * Converts normalized coordinates (0-1) to absolute screen position
 * taking into account the active monitor's bounds (position + size).
 * Falls back to actual primary display dimensions if bounds not set.
 */
function normalizedToAbsolute(nx: number, ny: number): { x: number; y: number } {
  let bounds = activeMonitorBounds;
  if (!bounds) {
    // NEVER use hardcoded 1920x1080 - always query real display
    const primary = electronScreen.getPrimaryDisplay();
    bounds = { x: primary.bounds.x, y: primary.bounds.y, width: primary.bounds.width, height: primary.bounds.height };
    activeMonitorBounds = bounds; // Cache for next call
  }
  return {
    x: bounds.x + Math.round(nx * bounds.width),
    y: bounds.y + Math.round(ny * bounds.height),
  };
}

function setupSocket() {
  socket = io(SERVER_URL + '/agent', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', async () => {
    console.log(`[Socket] Conectado: ${SERVER_URL}/agent (id: ${socket.id})`);
    socket.emit('agent:register', {
      deviceId: config.hardwareId,
      name: os.hostname(),
      os: `${os.type()} ${os.release()}`
    });

    // Emit boot event with system uptime info
    socket.emit('agent:boot', {
      deviceId: config.hardwareId,
      bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
      uptime: os.uptime(),
      hostname: os.hostname(),
    });

    // Initialize monitor bounds on connect
    await refreshMonitorBounds();
    const primary = electronScreen.getPrimaryDisplay();
    cachedScreenSize = { width: primary.bounds.width, height: primary.bounds.height };
    console.log(`[Screen] Primary: ${cachedScreenSize.width}x${cachedScreenSize.height} | Total monitores: ${monitorBoundsMap.size}`);

    updateStreamingSpeed();
    startHeartbeatLoop();
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Desconectado: ${reason}`);
    isBeingWatched = false;
    isRemoteActive = false;
    stopScreenshotLoop();
    stopHeartbeatLoop();

    // CRITICAL: Always unblock input on disconnect to prevent locking user out
    if (isRemoteActive && BlockInput) {
      try { BlockInput(false); } catch {}
      console.log('[Remote] BlockInput liberado por desconexion');
    }
    isRemoteActive = false;
  });

  socket.on('connect_error', (err) => {
    console.error(`[Socket] Error de conexion: ${err.message}`);
  });

  socket.on('settings:init', (data: { fps: number; quality: number }) => {
    console.log(`[Settings] Inicializados por servidor: fps=${data.fps}, quality=${data.quality}`);
    config.fps = data.fps;
    config.quality = data.quality;
    updateStreamingSpeed();
  });

  socket.on('settings:update', (data: { fps: number; quality: number }) => {
    console.log(`[Settings] Actualizados por servidor: fps=${data.fps}, quality=${data.quality}`);
    config.fps = data.fps;
    config.quality = data.quality;
    updateStreamingSpeed();
  });

  socket.on('stream:start', (data: { fps: number; quality: number }) => {
    console.log('[Stream] Dashboard comenzo a ver el equipo');
    isBeingWatched = true;
    if (data.fps) config.fps = data.fps;
    if (data.quality) config.quality = data.quality;
    updateStreamingSpeed();
    // Try WebRTC first for low-latency; fallback to JPEG loop
    startWebRTCStream();
  });

  socket.on('stream:stop', () => {
    console.log('[Stream] Dashboard dejo de ver el equipo');
    isBeingWatched = false;
    updateStreamingSpeed();
    stopWebRTCStream();
  });

  // ─── WebRTC Signaling ───
  socket.on('webrtc:offer', (data: { offer: RTCSessionDescriptionInit }) => {
    if (global.webrtcWindow && !global.webrtcWindow.isDestroyed()) {
      global.webrtcWindow.webContents.executeJavaScript(
        `window.__handleOffer(${JSON.stringify(data.offer)})`
      ).catch(() => {});
    }
  });
  socket.on('webrtc:ice-candidate', (data: { candidate: RTCIceCandidateInit }) => {
    if (global.webrtcWindow && !global.webrtcWindow.isDestroyed()) {
      global.webrtcWindow.webContents.executeJavaScript(
        `window.__handleIceCandidate(${JSON.stringify(data.candidate)})`
      ).catch(() => {});
    }
  });

  socket.on('connect_error', (err) => {
    console.log(`[Socket] Error de conexion: ${err.message} - reintentando...`);
  });

  // ═══════════════════════════════════════════
  // REMOTE CONTROL - Mouse, Keyboard, Scroll
  // ═══════════════════════════════════════════

  socket.on('remote:mouse', (data: { x: number; y: number; type: string; button?: string }) => {
    if (!isRemoteActive) {
      console.log('[Remote] Evento mouse ignorado - sesion no activa');
      return;
    }
    if (!apiLoaded) return;

    // Validate normalized coordinates (must be 0-1)
    if (typeof data.x !== 'number' || typeof data.y !== 'number' ||
        data.x < 0 || data.x > 1 || data.y < 0 || data.y > 1) {
      console.warn('[Remote] Coordenadas invalidas:', data.x, data.y);
      return;
    }

    // Convert normalized (0-1) to absolute pixel coordinates
    // Uses active monitor bounds (includes x,y offset for multi-monitor)
    const { x: absX, y: absY } = normalizedToAbsolute(data.x, data.y);

    switch (data.type) {
      case 'move':
        moveMouse(absX, absY);
        break;
      case 'click':
        clickMouse(absX, absY, (data.button as any) || 'left');
        break;
      case 'dblclick': {
        // Use Windows system double-click timing for reliability
        const dblClickInterval = GetDoubleClickTime ? Math.floor(GetDoubleClickTime() / 4) : 30;
        clickMouse(absX, absY, 'left');
        setTimeout(() => clickMouse(absX, absY, 'left'), dblClickInterval);
        break;
      }
      case 'rightclick':
        clickMouse(absX, absY, 'right');
        break;
      case 'mousedown':
        mouseDown(absX, absY, (data.button as any) || 'left');
        break;
      case 'mouseup':
        mouseUp(absX, absY, (data.button as any) || 'left');
        break;
      default:
        console.warn('[Remote] Tipo de mouse desconocido:', data.type);
    }
  });

  socket.on('remote:keyboard', (data: { key: string; type: string; modifiers?: string[] }) => {
    if (!isRemoteActive) {
      console.log('[Remote] Evento keyboard ignorado - sesion no activa');
      return;
    }
    if (!apiLoaded) return;

    // Validate key exists in our map
    if (!data.key || typeof data.key !== 'string') {
      console.warn('[Remote] Key invalida:', data.key);
      return;
    }

    if (data.type === 'keydown') {
      pressKey(data.key.toLowerCase(), (data.modifiers || []).map(m => m.toLowerCase()));
    }
  });

  socket.on('remote-scroll', (data: { deltaX: number; deltaY: number }) => {
    if (!isRemoteActive) return;
    if (!apiLoaded) return;

    const deltaY = typeof data.deltaY === 'number' ? data.deltaY : 0;
    const deltaX = typeof data.deltaX === 'number' ? data.deltaX : 0;
    scrollMouse(deltaY, deltaX);
  });

  // ═══════════════════════════════════════════
  // SESSION CONTROL
  // ═══════════════════════════════════════════

  socket.on('start-remote', async () => {
    console.log('[Remote] ═══ Sesion de control remoto INICIADA ═══');
    isRemoteActive = true;

    // Block local input during remote session (requires admin)
    if (BlockInput) {
      try {
        BlockInput(true);
        console.log('[Remote] BlockInput activado - input local bloqueado');
      } catch (err) {
        console.warn('[Remote] No se pudo bloquear input local (requiere admin)');
      }
    }

    // Switch to high FPS mode for smooth control
    updateStreamingSpeed();

    // Refresh monitor bounds for accurate multi-monitor control
    await refreshMonitorBounds();
    const bounds = activeMonitorBounds || electronScreen.getPrimaryDisplay().bounds;
    console.log(`[Remote] Monitor activo: ${bounds.width}x${bounds.height} en (${bounds.x}, ${bounds.y})`);

    // Notify dashboard that remote is active
    socket.emit('remote-status', { active: true, screen: { width: bounds.width, height: bounds.height } });
  });

  socket.on('stop-remote', () => {
    console.log('[Remote] ═══ Sesion de control remoto FINALIZADA ═══');
    isRemoteActive = false;

    // Unblock local input
    if (BlockInput) {
      try {
        BlockInput(false);
        console.log('[Remote] BlockInput desactivado - input local restaurado');
      } catch {}
    }

    // Back to normal FPS
    updateStreamingSpeed();

    socket.emit('remote-status', { active: false });
  });

  // ═══════════════════════════════════════════
  // REMOTE TERMINAL - Execute real commands
  // ═══════════════════════════════════════════

  socket.on('terminal:start', () => {
    console.log('[Terminal] Sesion de terminal remota iniciada');
    if (terminalProcess) { terminalProcess.kill(); terminalProcess = null; }

    terminalProcess = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '-'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    terminalProcess.stdout?.on('data', (data: Buffer) => {
      socket.emit('terminal:output', { output: data.toString('utf8') });
    });

    terminalProcess.stderr?.on('data', (data: Buffer) => {
      socket.emit('terminal:output', { output: data.toString('utf8'), isError: true });
    });

    terminalProcess.on('exit', (code) => {
      socket.emit('terminal:output', { output: `\n[Proceso terminado: codigo ${code}]\n` });
      terminalProcess = null;
    });

    socket.emit('terminal:output', { output: `PS ${os.homedir()}> ` });
  });

  socket.on('terminal:input', (data: { command: string }) => {
    if (terminalProcess && terminalProcess.stdin && !terminalProcess.stdin.destroyed) {
      terminalProcess.stdin.write(data.command + '\n');
    } else {
      // Fallback: execute single command
      exec(data.command, {
        timeout: 30000,
        windowsHide: true,
        shell: 'powershell.exe',
        cwd: os.homedir(),
      }, (error, stdout, stderr) => {
        if (stdout) socket.emit('terminal:output', { output: stdout });
        if (stderr) socket.emit('terminal:output', { output: stderr, isError: true });
        if (error && !stdout && !stderr) {
          socket.emit('terminal:output', { output: `Error: ${error.message}\n`, isError: true });
        }
        socket.emit('terminal:output', { output: `\nPS> ` });
      });
    }
  });

  socket.on('terminal:stop', () => {
    console.log('[Terminal] Sesion cerrada');
    if (terminalProcess) { terminalProcess.kill(); terminalProcess = null; }
  });

  // ═══════════════════════════════════════════
  // AUDIO PLAYBACK (Escucha Activa) - MSE Streaming
  // ═══════════════════════════════════════════

  socket.on('audio:start', () => {
    console.log('[Audio] Escucha activa iniciada');
    // Destroy previous window if exists
    if (global.audioWindow && !global.audioWindow.isDestroyed()) {
      global.audioWindow.destroy();
    }
    global.audioWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
    });
    // Load an inline HTML page with MSE audio player infrastructure
    const audioPlayerHTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html><body><script>
  // MSE-based audio streaming player
  let mediaSource = null;
  let sourceBuffer = null;
  let audioEl = null;
  let audioCtx = null;
  let gainNode = null;
  let queue = [];
  let isAppending = false;
  let mimeType = 'audio/webm;codecs=opus';
  let initialized = false;

  function initPlayer(mime) {
    mimeType = mime || 'audio/webm;codecs=opus';
    
    // Check MSE support for this mime type
    if (!MediaSource.isTypeSupported(mimeType)) {
      console.warn('MSE not supported for ' + mimeType + ', falling back to blob queue');
      initialized = false;
      return;
    }

    mediaSource = new MediaSource();
    audioEl = document.createElement('audio');
    audioEl.src = URL.createObjectURL(mediaSource);

    // Set up Web Audio API for volume boost
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(audioEl);
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 3.0;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    mediaSource.addEventListener('sourceopen', () => {
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.mode = 'sequence';
        sourceBuffer.addEventListener('updateend', processQueue);
        initialized = true;
        console.log('[Audio] MSE player initialized with ' + mimeType);
        // Process any chunks that arrived before initialization
        processQueue();
      } catch(e) {
        console.error('[Audio] Error adding source buffer:', e);
        initialized = false;
      }
    });

    // Resume AudioContext (bypass autoplay policy)
    audioCtx.resume();
    audioEl.play().catch(() => {});
  }

  function processQueue() {
    if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) {
      isAppending = false;
      return;
    }
    isAppending = true;
    const chunk = queue.shift();
    try {
      sourceBuffer.appendBuffer(chunk);
    } catch(e) {
      console.error('[Audio] Error appending buffer:', e);
      // If quota exceeded, remove old data and retry
      if (e.name === 'QuotaExceededError' && sourceBuffer.buffered.length > 0) {
        const start = sourceBuffer.buffered.start(0);
        const end = sourceBuffer.buffered.end(0) - 2;
        if (end > start) {
          sourceBuffer.remove(start, end);
        }
      }
    }
  }

  function appendChunk(base64Data) {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    if (initialized && sourceBuffer) {
      queue.push(bytes.buffer);
      if (!isAppending && !sourceBuffer.updating) {
        processQueue();
      }
      // Keep audio playing
      if (audioEl && audioEl.paused) {
        audioEl.play().catch(() => {});
      }
    } else {
      // Fallback: queue for when MSE initializes, or use blob fallback
      queue.push(bytes.buffer);
      if (!initialized && !mediaSource) {
        // MSE failed or not started, use blob-based fallback
        playBlobFallback(bytes, mimeType);
      }
    }
  }

  // Fallback player using blob URLs (in case MSE doesn't work)
  let fallbackCtx = null;
  let fallbackGain = null;
  function playBlobFallback(bytes, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.volume = 1.0;
    if (!fallbackCtx) {
      fallbackCtx = new AudioContext();
      fallbackGain = fallbackCtx.createGain();
      fallbackGain.gain.value = 3.0;
      fallbackGain.connect(fallbackCtx.destination);
    }
    try {
      const src = fallbackCtx.createMediaElementSource(a);
      src.connect(fallbackGain);
    } catch(e) {}
    a.play().then(() => {
      a.onended = () => URL.revokeObjectURL(url);
    }).catch(() => URL.revokeObjectURL(url));
  }

  function stopPlayer() {
    queue = [];
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    if (mediaSource && mediaSource.readyState === 'open') {
      try { mediaSource.endOfStream(); } catch(e) {}
    }
    if (audioCtx) { audioCtx.close().catch(() => {}); }
    if (fallbackCtx) { fallbackCtx.close().catch(() => {}); }
    mediaSource = null; sourceBuffer = null; audioEl = null;
    audioCtx = null; gainNode = null; fallbackCtx = null; fallbackGain = null;
    initialized = false;
    console.log('[Audio] Player stopped');
  }

  // Auto-initialize with default mime type
  initPlayer('audio/webm;codecs=opus');
</script></body></html>
    `)}`;
    global.audioWindow.loadURL(audioPlayerHTML);
    console.log('[Audio] Audio player window created');
  });

  socket.on('audio:chunk', (data: { chunk: string; mimeType?: string }) => {
    try {
      if (global.audioWindow && !global.audioWindow.isDestroyed()) {
        // Send chunk to the MSE player in the hidden window
        global.audioWindow.webContents.executeJavaScript(
          `appendChunk("${data.chunk}");`
        ).catch(() => {});
      }
    } catch (err) {
      console.error('[Audio] Error enviando chunk:', err);
    }
  });

  socket.on('audio:stop', () => {
    console.log('[Audio] Escucha activa detenida');
    if (global.audioWindow && !global.audioWindow.isDestroyed()) {
      global.audioWindow.webContents.executeJavaScript('stopPlayer();').catch(() => {});
      // Destroy window after a short delay to allow cleanup
      setTimeout(() => {
        if (global.audioWindow && !global.audioWindow.isDestroyed()) {
          global.audioWindow.destroy();
          global.audioWindow = null;
        }
      }, 500);
    }
  });

  // ═══════════════════════════════════════════
  // SYSTEM COMMANDS - Power, Ctrl+Alt+Del
  // ═══════════════════════════════════════════

  // ─── App Kill (Blocked Apps) ───
  socket.on('app:kill', (data: { appName: string; pattern: string }) => {
    console.log(`[BlockedApp] Cerrando app bloqueada: ${data.appName}`);
    // Use taskkill to close the window matching the pattern
    const pattern = data.pattern.replace(/[^a-zA-Z0-9. ]/g, '');
    exec(`taskkill /FI "WINDOWTITLE eq *${pattern}*" /F`, { windowsHide: true }, (err) => {
      if (err) {
        // Try by process name
        exec(`taskkill /IM "${pattern}.exe" /F`, { windowsHide: true }, () => {});
      }
      console.log(`[BlockedApp] Intentando cerrar: ${pattern}`);
    });
  });

  // ─── Blocked Apps List Update ───
  socket.on('blocked-apps:update', (apps: Array<{ name: string; action: string }>) => {
    console.log(`[BlockedApps] Lista actualizada: ${apps.length} apps bloqueadas`);
    // Store locally for future reference (agent-side enforcement could be added here)
  });

  socket.on('remote-ctrl-alt-del', () => {
    console.log('[System] Ctrl+Alt+Del -> abriendo Task Manager');
    exec('taskmgr.exe', { windowsHide: false });
  });

  socket.on('remote-power', (data: { action: string }) => {
    console.log(`[System] Comando de energia: ${data.action}`);
    switch (data.action) {
      case 'shutdown':
        exec('shutdown /s /t 5 /c "Apagado remoto - VisionControl"', { windowsHide: true });
        break;
      case 'restart':
        exec('shutdown /r /t 5 /c "Reinicio remoto - VisionControl"', { windowsHide: true });
        break;
      case 'lock':
        exec('rundll32.exe user32.dll,LockWorkStation', { windowsHide: true });
        break;
      case 'sleep':
        exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', { windowsHide: true });
        break;
    }
  });

  // ═══════════════════════════════════════════
  // MONITOR SELECTION
  // ═══════════════════════════════════════════

  socket.on('remote:monitor-select', (data: { monitorId: string }) => {
    console.log(`[Monitor] Cambiando a: ${data.monitorId}`);
    activeMonitorId = data.monitorId;

    // Update active monitor bounds from the map
    if (monitorBoundsMap.has(data.monitorId)) {
      activeMonitorBounds = monitorBoundsMap.get(data.monitorId)!;
      console.log(`[Monitor] Bounds activos: x=${activeMonitorBounds.x}, y=${activeMonitorBounds.y}, ${activeMonitorBounds.width}x${activeMonitorBounds.height}`);
    } else {
      // Fallback: refresh bounds and try again
      refreshMonitorBounds().then(() => {
        if (monitorBoundsMap.has(data.monitorId)) {
          activeMonitorBounds = monitorBoundsMap.get(data.monitorId)!;
          console.log(`[Monitor] Bounds actualizados tras refresh: x=${activeMonitorBounds.x}, y=${activeMonitorBounds.y}, ${activeMonitorBounds.width}x${activeMonitorBounds.height}`);
        } else {
          console.warn(`[Monitor] No se encontraron bounds para: ${data.monitorId}`);
        }
      });
    }
  });

  // ═══════════════════════════════════════════
  // ADMIN BOSS ACTIONS
  // ═══════════════════════════════════════════

  // Show a message/toast on the employee's screen using a native Windows balloon notification
  socket.on('admin:send-toast', (data: { message: string }) => {
    const msg = (data.message || '').substring(0, 100).replace(/"/g, '\\"');
    console.log(`[Admin] Mostrando mensaje en pantalla: "${msg}"`);

    // Use PowerShell to show a Windows toast notification via BurntToast or fallback MsgBox
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      $notify = New-Object System.Windows.Forms.NotifyIcon;
      $notify.Icon = [System.Drawing.SystemIcons]::Information;
      $notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info;
      $notify.BalloonTipTitle = 'Mensaje del Administrador';
      $notify.BalloonTipText = '${msg}';
      $notify.Visible = $true;
      $notify.ShowBalloonTip(8000);
      Start-Sleep -Seconds 9;
      $notify.Dispose();
    `.trim().replace(/\n\s*/g, ' ');

    exec(`powershell -WindowStyle Hidden -Command "${psScript}"`, { windowsHide: true }, (err) => {
      if (err) {
        // Fallback: simple message box
        exec(`powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${msg}', 'Administrador')"`, { windowsHide: false });
      }
    });
  });

  // Force the employee's default browser to open a specific URL
  socket.on('admin:force-url', (data: { url: string }) => {
    const url = (data.url || '').trim().replace(/"/g, '');
    if (!url.startsWith('http')) return; // Security: only allow http/https
    console.log(`[Admin] Abriendo URL forzada: ${url}`);
    exec(`start "" "${url}"`, { windowsHide: true, shell: 'cmd.exe' });
  });

  // Lock the employee's mouse and keyboard (admin action - no remote session required)
  socket.on('admin:lock-input', () => {
    console.log('[Admin] Bloqueando input del teclado y mouse...');
    if (BlockInput) {
      try {
        BlockInput(true);
        console.log('[Admin] Input bloqueado. Se liberara en 30 segundos automaticamente.');
        // Safety auto-release after 30 seconds to prevent permanent lockout
        setTimeout(() => {
          try {
            if (BlockInput) BlockInput(false);
            console.log('[Admin] Input liberado automaticamente (timeout 30s)');
          } catch {}
        }, 30000);
      } catch (err) {
        console.warn('[Admin] No se pudo bloquear input (requiere permisos de administrador)');
      }
    } else {
      console.warn('[Admin] BlockInput API no disponible');
    }
  });
}


// ═══════════════════════════════════════════════════════════════════
// Heartbeat & Screenshot Loops
// ═══════════════════════════════════════════════════════════════════

function startHeartbeatLoop() {
  if (heartbeatIntervalId) return;
  heartbeatIntervalId = setInterval(() => {
    if (!socket?.connected) return;
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    socket.emit('agent:heartbeat', {
      cpu: getCpuPercent(),
      ram: Math.round(((totalRam - freeRam) / totalRam) * 100),
      activeApp: getActiveWindow()
    });
  }, 5000);
}

function stopHeartbeatLoop() {
  if (heartbeatIntervalId) { clearInterval(heartbeatIntervalId); heartbeatIntervalId = null; }
}

async function captureAndSendFrame() {
  if (!isScreenshotLoopRunning) return;
  if (!socket?.connected) {
    lastTimeoutId = setTimeout(captureAndSendFrame, 1000);
    return;
  }

  const startTime = Date.now();
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }
    });

    if (sources && sources.length > 0) {
      // Update monitor bounds map from current displays
      const displays = electronScreen.getAllDisplays();
      for (const source of sources) {
        const display = displays.find(d => d.id.toString() === source.display_id);
        if (display) {
          monitorBoundsMap.set(source.id, {
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
          });
        }
      }

      // Update active monitor bounds if set
      if (activeMonitorId && monitorBoundsMap.has(activeMonitorId)) {
        activeMonitorBounds = monitorBoundsMap.get(activeMonitorId)!;
      } else if (!activeMonitorId) {
        // Default: use primary display bounds
        const primary = electronScreen.getPrimaryDisplay();
        activeMonitorBounds = {
          x: primary.bounds.x,
          y: primary.bounds.y,
          width: primary.bounds.width,
          height: primary.bounds.height,
        };
      }

      const targetSource = activeMonitorId
        ? sources.find(s => s.id === activeMonitorId) || sources[0]
        : sources[0];

      const size = targetSource.thumbnail.getSize();
      const base64Image = 'data:image/jpeg;base64,' + targetSource.thumbnail.toJPEG(currentQuality).toString('base64');

      // Skip identical frames (static screen optimization)
      if (lastImageBase64 !== base64Image) {
        lastImageBase64 = base64Image;
        const sourceBounds = monitorBoundsMap.get(targetSource.id);

        socket.emit('agent:screenshot', {
          image: base64Image,
          metadata: {
            width: size.width,
            height: size.height,
            timestamp: Date.now(),
            quality: currentQuality,
            fps: currentFps,
            monitorId: targetSource.id,
            monitorBounds: sourceBounds || null,
            availableMonitors: sources.map(s => ({
              id: s.id,
              name: s.name,
              bounds: monitorBoundsMap.get(s.id) || null,
            }))
          }
        });
      }
    }
  } catch (err) {
    console.error('[Screenshot] Error:', err);
  }

  const elapsed = Date.now() - startTime;
  const targetInterval = Math.floor(1000 / currentFps);
  const delay = Math.max(0, targetInterval - elapsed);

  lastTimeoutId = setTimeout(captureAndSendFrame, delay);
}

function startScreenshotLoop(fps?: number, quality?: number) {
  if (fps !== undefined) currentFps = fps;
  if (quality !== undefined) currentQuality = quality;

  if (isScreenshotLoopRunning) return;
  isScreenshotLoopRunning = true;
  captureAndSendFrame();
}

function stopScreenshotLoop() {
  isScreenshotLoopRunning = false;
  if (lastTimeoutId) {
    clearTimeout(lastTimeoutId);
    lastTimeoutId = null;
  }
  lastImageBase64 = null;
}


// ═══════════════════════════════════════════════════════════════════
// WebRTC Streaming Engine
// Uses a hidden BrowserWindow with renderer WebRTC APIs to capture
// the desktop as a real video stream (30-60 FPS) instead of JPEG screenshots
// ═══════════════════════════════════════════════════════════════════

function startWebRTCStream() {
  if (global.webrtcWindow && !global.webrtcWindow.isDestroyed()) {
    console.log('[WebRTC] Ya existe una ventana WebRTC activa');
    return;
  }

  console.log('[WebRTC] Iniciando stream de video de alta velocidad...');

  // Grant desktopCapturer permissions to this window
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'display-capture', 'mediaKeySystem'].includes(permission);
    callback(allowed);
  });

  global.webrtcWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    }
  });

  // The renderer HTML page that does all the heavy WebRTC lifting
  const webrtcHTML = `<!DOCTYPE html>
<html><body><script>
  let pc = null;
  let stream = null;

  window.__sendToMain = function(type, payload) {
    // Use title encoding as a simple IPC channel from renderer to main
    document.title = JSON.stringify({ type, payload });
  };

  async function createStream() {
    try {
      // Use Electron's desktopCapturer via getUserMedia
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      });
      console.log('[WebRTC Renderer] Stream de escritorio capturado');
    } catch (e) {
      console.error('[WebRTC Renderer] Error capturando escritorio:', e);
    }
  }

  async function startOffer() {
    await createStream();
    if (!stream) return;

    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        window.__sendToMain('webrtc:ice-candidate', event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC Renderer] Connection state:', pc.connectionState);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    window.__sendToMain('webrtc:offer', offer);
    console.log('[WebRTC Renderer] Oferta enviada al servidor');
  }

  window.__handleOffer = async function(remoteOffer) {
    // If admin sends an offer (re-negotiate), handle it
    if (!pc) await createStream();
    if (!stream) return;
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }
    await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    window.__sendToMain('webrtc:answer', answer);
  };

  window.__handleIceCandidate = async function(candidate) {
    try {
      if (pc && candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch(e) {}
  };

  window.__stopWebRTC = function() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (pc) { pc.close(); pc = null; }
    console.log('[WebRTC Renderer] Stream detenido');
  };

  // Auto-start offer when page loads
  startOffer();
<\/script></body></html>`;

  const pageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(webrtcHTML)}`;
  global.webrtcWindow.loadURL(pageUrl);

  // Listen to title changes as IPC (renderer -> main)
  global.webrtcWindow.webContents.on('page-title-updated', (_event, title) => {
    try {
      const msg = JSON.parse(title);
      if (!socket?.connected) return;
      if (msg.type === 'webrtc:offer') {
        socket.emit('webrtc:offer', { offer: msg.payload });
        console.log('[WebRTC Main] Oferta reenviada al servidor');
      } else if (msg.type === 'webrtc:answer') {
        socket.emit('webrtc:answer', { answer: msg.payload });
        console.log('[WebRTC Main] Respuesta reenviada al servidor');
      } else if (msg.type === 'webrtc:ice-candidate') {
        socket.emit('webrtc:ice-candidate', { candidate: msg.payload });
      }
    } catch {}
  });

  global.webrtcWindow.webContents.on('did-finish-load', () => {
    console.log('[WebRTC] Ventana de captura lista');
  });
}

function stopWebRTCStream() {
  if (global.webrtcWindow && !global.webrtcWindow.isDestroyed()) {
    global.webrtcWindow.webContents.executeJavaScript('if(window.__stopWebRTC) window.__stopWebRTC()').catch(() => {});
    setTimeout(() => {
      if (global.webrtcWindow && !global.webrtcWindow.isDestroyed()) {
        global.webrtcWindow.destroy();
      }
      global.webrtcWindow = null;
    }, 500);
    console.log('[WebRTC] Stream de video detenido');
  }
}

// ═══════════════════════════════════════════════════════════════════
// App Lifecycle
// ═══════════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  const apiOk = loadWindowsAPI();
  if (!apiOk) {
    console.error('[CRITICAL] No se pudo cargar la API de Windows. El control remoto NO funcionara.');
    console.error('[CRITICAL] Asegurate de ejecutar en Windows con permisos de administrador.');
  }

  setupSocket();

  // Hide from dock (Mac)
  if (app.dock) app.dock.hide();

  // Auto-start with Windows
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: ['--processStart', `"${app.name}"`, '--process-start-args', '"--hidden"']
  });

  console.log('[Agent] VisionControl Agent listo y corriendo en segundo plano');
  console.log(`[Agent] API: ${apiOk ? 'OK' : 'FALLIDA'} | Server: ${SERVER_URL}`);
});

// Keep running even with no windows
app.on('window-all-closed', () => {});

// Handle uncaught errors gracefully (don't crash)
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Error no capturado:', err.message);
  // Safety: unblock input if remote was active
  if (isRemoteActive && BlockInput) {
    try { BlockInput(false); } catch {}
  }
});
process.on('unhandledRejection', (err) => {
  console.error('[CRASH] Promise rechazada:', err);
});

// Safety: Always unblock input on exit
process.on('exit', () => {
  if (BlockInput) {
    try { BlockInput(false); } catch {}
  }
});

process.on('SIGINT', () => {
  if (BlockInput) {
    try { BlockInput(false); } catch {}
  }
  process.exit(0);
});
