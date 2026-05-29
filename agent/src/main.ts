import { app, desktopCapturer } from 'electron';
import { io, Socket } from 'socket.io-client';
import os from 'os';
import path from 'path';
import fs from 'fs';
import koffi from 'koffi';
import { exec, spawn, ChildProcess } from 'child_process';

// ─── Load config ───
const isPackaged = app.isPackaged;
const configPath = isPackaged 
  ? path.join(process.resourcesPath, 'config.json') 
  : path.join(process.cwd(), 'config.json');

let config = { serverUrl: 'http://localhost:3001', screenshotInterval: 2000, quality: 60, fps: 2 };
try {
  const raw = fs.readFileSync(configPath, 'utf-8');
  config = { ...config, ...JSON.parse(raw) };
  console.log(`📄 Config cargado: servidor=${config.serverUrl}`);
} catch {
  console.warn('⚠️  No se encontró config.json, usando localhost:3001');
}

const SERVER_URL = config.serverUrl;
const SCREENSHOT_INTERVAL = config.screenshotInterval;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let socket: Socket;
let intervalId: NodeJS.Timeout | null = null;

// ─── CPU Measurement ───
let previousCpuTimes: { idle: number; total: number } | null = null;

function getCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

function getCpuPercent(): number {
  const current = getCpuTimes();
  if (!previousCpuTimes) {
    previousCpuTimes = current;
    return 0;
  }
  const idleDelta = current.idle - previousCpuTimes.idle;
  const totalDelta = current.total - previousCpuTimes.total;
  previousCpuTimes = current;
  if (totalDelta === 0) return 0;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
}

// ─── Windows API via koffi (DIRECT, INSTANT control) ───
let user32: any = null;
let SendInput: any = null;
let GetSystemMetrics: any = null;
let SetCursorPos: any = null;
let mouse_event_fn: any = null;
let keybd_event_fn: any = null;
let MapVirtualKeyW: any = null;
let GetForegroundWindow: any = null;
let GetWindowTextW: any = null;

const INPUT_MOUSE    = 0;
const INPUT_KEYBOARD = 1;

const MOUSEEVENTF_MOVE        = 0x0001;
const MOUSEEVENTF_LEFTDOWN    = 0x0002;
const MOUSEEVENTF_LEFTUP      = 0x0004;
const MOUSEEVENTF_RIGHTDOWN   = 0x0008;
const MOUSEEVENTF_RIGHTUP     = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN  = 0x0020;
const MOUSEEVENTF_MIDDLEUP    = 0x0040;
const MOUSEEVENTF_WHEEL       = 0x0800;
const MOUSEEVENTF_ABSOLUTE    = 0x8000;

const KEYEVENTF_KEYUP         = 0x0002;
const KEYEVENTF_EXTENDEDKEY   = 0x0001;

// Virtual key codes - complete map for full control
const VK_MAP: Record<string, number> = {
  enter: 0x0D, backspace: 0x08, tab: 0x09, escape: 0x1B,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  delete: 0x2E, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  space: 0x20, capslock: 0x14, numlock: 0x90, scrolllock: 0x91,
  insert: 0x2D, printscreen: 0x2C, pause: 0x13,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74,
  f6: 0x75, f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  control: 0x11, alt: 0x12, shift: 0x10, command: 0x5B, menu: 0x5D,
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47, h: 0x48,
  i: 0x49, j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E, o: 0x4F, p: 0x50,
  q: 0x51, r: 0x52, s: 0x53, t: 0x54, u: 0x55, v: 0x56, w: 0x57, x: 0x58,
  y: 0x59, z: 0x5A,
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
  ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD, '.': 0xBE,
  '/': 0xBF, '`': 0xC0, '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE,
};

// Extended keys that need KEYEVENTF_EXTENDEDKEY flag
const EXTENDED_KEYS = new Set([0x26, 0x28, 0x25, 0x27, 0x2E, 0x24, 0x23, 0x21, 0x22, 0x2D, 0x5B, 0x5D]);

function loadWindowsAPI(): boolean {
  try {
    user32 = koffi.load('user32.dll');

    // Direct Win32 API functions - no structs needed for mouse_event/keybd_event
    SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');
    GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');
    mouse_event_fn = user32.func('void mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, int32 dwData, uintptr_t dwExtraInfo)');
    keybd_event_fn = user32.func('void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)');
    MapVirtualKeyW = user32.func('uint32 MapVirtualKeyW(uint32 uCode, uint32 uMapType)');
    GetForegroundWindow = user32.func('void* GetForegroundWindow()');
    GetWindowTextW = user32.func('int GetWindowTextW(void* hWnd, _Out_ char16_t* lpString, int nMaxCount)');

    console.log('✅ Windows API cargada via koffi - control directo habilitado (instant)');
    return true;
  } catch (err) {
    console.warn('⚠️  No se pudo cargar Windows API:', err);
    return false;
  }
}

function getActiveWindow(): string {
  if (!GetForegroundWindow || !GetWindowTextW) return '';
  try {
    const hwnd = GetForegroundWindow();
    if (!hwnd) return '';
    const buf = Buffer.alloc(512);
    const len = GetWindowTextW(hwnd, buf, 256);
    if (len > 0) {
      return buf.toString('utf16le').replace(/\0/g, '').trim();
    }
  } catch { /* ignore */ }
  return '';
}

// ─── INSTANT Control Functions (direct Win32 API, <1ms per call) ───

function moveMouse(x: number, y: number) {
  if (SetCursorPos) {
    try {
      SetCursorPos(Math.round(x), Math.round(y));
    } catch { /* ignore */ }
  }
}

function clickMouse(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left') {
  // First move cursor to position
  moveMouse(x, y);

  if (!mouse_event_fn) return;
  try {
    let downFlag: number, upFlag: number;
    if (button === 'right') {
      downFlag = MOUSEEVENTF_RIGHTDOWN;
      upFlag = MOUSEEVENTF_RIGHTUP;
    } else if (button === 'middle') {
      downFlag = MOUSEEVENTF_MIDDLEDOWN;
      upFlag = MOUSEEVENTF_MIDDLEUP;
    } else {
      downFlag = MOUSEEVENTF_LEFTDOWN;
      upFlag = MOUSEEVENTF_LEFTUP;
    }
    mouse_event_fn(downFlag, 0, 0, 0, 0);
    mouse_event_fn(upFlag, 0, 0, 0, 0);
  } catch { /* ignore */ }
}

function mouseDown(x: number, y: number, button: 'left' | 'right' = 'left') {
  moveMouse(x, y);
  if (!mouse_event_fn) return;
  try {
    const flag = button === 'right' ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
    mouse_event_fn(flag, 0, 0, 0, 0);
  } catch { /* ignore */ }
}

function mouseUp(x: number, y: number, button: 'left' | 'right' = 'left') {
  moveMouse(x, y);
  if (!mouse_event_fn) return;
  try {
    const flag = button === 'right' ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
    mouse_event_fn(flag, 0, 0, 0, 0);
  } catch { /* ignore */ }
}

function pressKey(key: string, modifiers: string[] = []) {
  if (!keybd_event_fn) return;
  try {
    // Press modifier keys down
    const modVks: number[] = [];
    for (const mod of modifiers) {
      const vk = VK_MAP[mod];
      if (vk) {
        modVks.push(vk);
        const scan = MapVirtualKeyW ? MapVirtualKeyW(vk, 0) : 0;
        const flags = EXTENDED_KEYS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0;
        keybd_event_fn(vk, scan, flags, 0);
      }
    }

    // Press the main key
    const vk = VK_MAP[key];
    if (vk) {
      const scan = MapVirtualKeyW ? MapVirtualKeyW(vk, 0) : 0;
      const flags = EXTENDED_KEYS.has(vk) ? KEYEVENTF_EXTENDEDKEY : 0;
      keybd_event_fn(vk, scan, flags, 0);
      keybd_event_fn(vk, scan, flags | KEYEVENTF_KEYUP, 0);
    }

    // Release modifier keys (in reverse order)
    for (let i = modVks.length - 1; i >= 0; i--) {
      const scan = MapVirtualKeyW ? MapVirtualKeyW(modVks[i], 0) : 0;
      const flags = (EXTENDED_KEYS.has(modVks[i]) ? KEYEVENTF_EXTENDEDKEY : 0) | KEYEVENTF_KEYUP;
      keybd_event_fn(modVks[i], scan, flags, 0);
    }
  } catch { /* ignore */ }
}

function scrollMouse(deltaY: number) {
  if (!mouse_event_fn) return;
  try {
    // deltaY: positive = scroll up, negative = scroll down
    const amount = Math.round(deltaY * 120);
    mouse_event_fn(MOUSEEVENTF_WHEEL, 0, 0, amount, 0);
  } catch { /* ignore */ }
}

function getScreenSize(): { width: number; height: number } {
  if (GetSystemMetrics) {
    try {
      const w = GetSystemMetrics(0); // SM_CXSCREEN
      const h = GetSystemMetrics(1); // SM_CYSCREEN
      if (w > 0 && h > 0) return { width: w, height: h };
    } catch { /* ignore */ }
  }
  // Fallback to PowerShell only if koffi fails
  try {
    const result = require('child_process').execSync(
      `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; $s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ($s.Width.ToString() + ',' + $s.Height.ToString())"`,
      { timeout: 2000, windowsHide: true, encoding: 'utf8' }
    ).trim();
    const [w, h] = result.split(',').map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch { /* ignore */ }
  return { width: 1920, height: 1080 };
}

let cachedScreenSize: { width: number; height: number } | null = null;

function setupSocket() {
  socket = io(SERVER_URL + '/agent', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log(`✅ Conectado al servidor: ${SERVER_URL}/agent`);
    socket.emit('agent:register', {
      name: os.hostname(),
      os: `${os.type()} ${os.release()}`
    });
    // Cache screen size on connect
    cachedScreenSize = getScreenSize();
    console.log(`🖥️  Resolución detectada: ${cachedScreenSize.width}x${cachedScreenSize.height}`);
    startScreenshotLoop();
    startHeartbeatLoop();
  });

  socket.on('disconnect', () => {
    console.log('❌ Desconectado del servidor');
    stopScreenshotLoop();
    stopHeartbeatLoop();
  });

  // ─── Remote Control (INSTANT via Win32 API) ───
  socket.on('remote:mouse', (data: { x: number; y: number; type: string; button?: string }) => {
    const screen = cachedScreenSize || { width: 1920, height: 1080 };
    const absX = Math.round(data.x * screen.width);
    const absY = Math.round(data.y * screen.height);

    switch (data.type) {
      case 'move':
        moveMouse(absX, absY);
        break;
      case 'click':
        clickMouse(absX, absY, (data.button as 'left' | 'right' | 'middle') || 'left');
        break;
      case 'dblclick':
        clickMouse(absX, absY, 'left');
        // Double click needs minimal delay between clicks
        setTimeout(() => clickMouse(absX, absY, 'left'), 50);
        break;
      case 'rightclick':
        clickMouse(absX, absY, 'right');
        break;
      case 'mousedown':
        mouseDown(absX, absY, (data.button as 'left' | 'right') || 'left');
        break;
      case 'mouseup':
        mouseUp(absX, absY, (data.button as 'left' | 'right') || 'left');
        break;
    }
  });

  socket.on('remote:keyboard', (data: { key: string; type: string; modifiers?: string[] }) => {
    if (data.type === 'keydown') {
      pressKey(data.key, data.modifiers || []);
    }
  });

  socket.on('remote-scroll', (data: { deltaX: number; deltaY: number }) => {
    scrollMouse(data.deltaY);
  });

  // ─── Multi Monitor Support ───
  socket.on('remote:monitor-select', (data: { monitorId: string }) => {
    console.log(`🖥️ Cambiando a monitor: ${data.monitorId}`);
    activeMonitorId = data.monitorId;
  });
}

let heartbeatIntervalId: NodeJS.Timeout | null = null;

function startHeartbeatLoop() {
  if (heartbeatIntervalId) return;
  heartbeatIntervalId = setInterval(() => {
    if (socket && socket.connected) {
      const totalRam = os.totalmem();
      const freeRam = os.freemem();
      const usedRamPercent = Math.round(((totalRam - freeRam) / totalRam) * 100);
      const cpuPercent = getCpuPercent();
      const activeApp = getActiveWindow();

      socket.emit('agent:heartbeat', {
        cpu: cpuPercent,
        ram: usedRamPercent,
        activeApp
      });
    }
  }, 5000);
}

function stopHeartbeatLoop() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

let activeMonitorId: string | null = null;
let lastImageBase64: string | null = null;

function startScreenshotLoop(overrideIntervalMs?: number) {
  if (intervalId) return;
  
  const targetFps = config.fps || 2; // Default 2 FPS for idle
  const calculatedInterval = overrideIntervalMs || Math.floor(1000 / targetFps);
  const quality = config.quality || 60; // Default 60% quality

  intervalId = setInterval(async () => {
    try {
      if (socket && socket.connected) {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1280, height: 720 } // Reduced base resolution for performance
        });

        if (sources && sources.length > 0) {
          // Find selected monitor or fallback to primary
          const targetSource = activeMonitorId 
            ? sources.find(s => s.id === activeMonitorId) || sources[0]
            : sources[0];

          const size = targetSource.thumbnail.getSize();
          const base64Image = 'data:image/jpeg;base64,' + targetSource.thumbnail.toJPEG(quality).toString('base64');
          
          // Optimization: Skip sending if frame is completely identical (static screen)
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
        }
      }
    } catch (err) {
      console.error('Error capturando pantalla:', err);
    }
  }, calculatedInterval);
}

function stopScreenshotLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    lastImageBase64 = null;
  }
}

app.whenReady().then(async () => {
  loadWindowsAPI();
  setupSocket();
  
  // Ocultar del dock (Mac) y configurar auto-inicio (Windows)
  if (app.dock) app.dock.hide();
  
  app.setLoginItemSettings({
    openAtLogin: true,
    path: app.getPath('exe'),
    args: [
      '--processStart', `"${app.name}"`,
      '--process-start-args', `"--hidden"`
    ]
  });
});

app.on('window-all-closed', () => {
  // Mantener ejecutando en segundo plano
});
