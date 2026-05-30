import { app, desktopCapturer } from 'electron';
import { io, Socket } from 'socket.io-client';
import os from 'os';
import path from 'path';
import fs from 'fs';
import koffi from 'koffi';
import { exec, spawn, ChildProcess } from 'child_process';

// ═══════════════════════════════════════════════════════════════════
// VisionControl Agent - Full Remote Control for Windows
// Uses Win32 API directly via koffi for instant (<1ms) input control
// ═══════════════════════════════════════════════════════════════════

// ─── Load config ───
const isPackaged = app.isPackaged;
const configPath = isPackaged
  ? path.join(process.resourcesPath, 'config.json')
  : path.join(process.cwd(), 'config.json');

let config = { serverUrl: 'http://localhost:3001', screenshotInterval: 2000, quality: 60, fps: 2 };
try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  config = { ...config, ...JSON.parse(raw) };
  console.log(`[Config] servidor=${config.serverUrl}, fps=${config.fps}, quality=${config.quality}`);
} catch {
  console.warn('[Config] No se encontro config.json, usando defaults');
}

const SERVER_URL = config.serverUrl;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Agent] Ya hay otra instancia corriendo, cerrando...');
  app.quit();
}

let socket: Socket;
let intervalId: NodeJS.Timeout | null = null;

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

function setupSocket() {
  socket = io(SERVER_URL + '/agent', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log(`[Socket] Conectado: ${SERVER_URL}/agent (id: ${socket.id})`);
    socket.emit('agent:register', {
      name: os.hostname(),
      os: `${os.type()} ${os.release()}`
    });
    cachedScreenSize = getScreenSize();
    console.log(`[Screen] ${cachedScreenSize.width}x${cachedScreenSize.height}`);
    startScreenshotLoop();
    startHeartbeatLoop();
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Desconectado: ${reason}`);
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

    const screen = cachedScreenSize || { width: 1920, height: 1080 };
    const absX = Math.round(data.x * screen.width);
    const absY = Math.round(data.y * screen.height);

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

  socket.on('start-remote', () => {
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
    stopScreenshotLoop();
    startScreenshotLoop(150); // ~7 FPS during remote

    // Refresh screen size in case resolution changed
    cachedScreenSize = getScreenSize();
    console.log(`[Remote] Screen: ${cachedScreenSize.width}x${cachedScreenSize.height}`);

    // Notify dashboard that remote is active
    socket.emit('remote-status', { active: true, screen: cachedScreenSize });
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
    stopScreenshotLoop();
    startScreenshotLoop();

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
  // AUDIO PLAYBACK (Escucha Activa)
  // ═══════════════════════════════════════════

  socket.on('audio:start', () => {
    console.log('[Audio] Escucha activa iniciada');
  });

  socket.on('audio:chunk', (data: { chunk: string; mimeType?: string }) => {
    try {
      const audioBuffer = Buffer.from(data.chunk, 'base64');
      const tempPath = path.join(os.tmpdir(), `vc_audio_${Date.now()}.wav`);
      fs.writeFileSync(tempPath, audioBuffer);
      exec(
        `powershell -WindowStyle Hidden -Command "$p = New-Object System.Media.SoundPlayer '${tempPath}'; $p.PlaySync(); Remove-Item '${tempPath}' -ErrorAction SilentlyContinue"`,
        { windowsHide: true, timeout: 10000 },
        () => {}
      );
    } catch (err) {
      console.error('[Audio] Error reproduciendo:', err);
    }
  });

  socket.on('audio:stop', () => {
    console.log('[Audio] Escucha activa detenida');
  });

  // ═══════════════════════════════════════════
  // SYSTEM COMMANDS - Power, Ctrl+Alt+Del
  // ═══════════════════════════════════════════

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

function startScreenshotLoop(overrideIntervalMs?: number) {
  if (intervalId) return;

  const targetFps = config.fps || 2;
  const interval = overrideIntervalMs || Math.floor(1000 / targetFps);
  const quality = config.quality || 60;

  intervalId = setInterval(async () => {
    if (!socket?.connected) return;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });

      if (!sources || sources.length === 0) return;

      const targetSource = activeMonitorId
        ? sources.find(s => s.id === activeMonitorId) || sources[0]
        : sources[0];

      const size = targetSource.thumbnail.getSize();
      const base64Image = 'data:image/jpeg;base64,' + targetSource.thumbnail.toJPEG(quality).toString('base64');

      // Skip identical frames (static screen optimization)
      if (lastImageBase64 === base64Image) return;
      lastImageBase64 = base64Image;

      socket.emit('agent:screenshot', {
        image: base64Image,
        metadata: {
          width: size.width,
          height: size.height,
          timestamp: Date.now(),
          quality,
          fps: overrideIntervalMs ? Math.floor(1000 / overrideIntervalMs) : targetFps,
          monitorId: targetSource.id,
          availableMonitors: sources.map(s => ({ id: s.id, name: s.name }))
        }
      });
    } catch (err) {
      console.error('[Screenshot] Error:', err);
    }
  }, interval);
}

function stopScreenshotLoop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; lastImageBase64 = null; }
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
