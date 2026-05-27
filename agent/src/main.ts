import { app, desktopCapturer } from 'electron';
import { io, Socket } from 'socket.io-client';
import os from 'os';
import path from 'path';
import fs from 'fs';
import koffi from 'koffi';

// ─── Load config ───
const isPackaged = app.isPackaged;
const configPath = isPackaged 
  ? path.join(process.resourcesPath, 'config.json') 
  : path.join(process.cwd(), 'config.json');

let config = { serverUrl: 'http://localhost:3001', screenshotInterval: 2000 };
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

// ─── Windows API via koffi ───
let user32: any = null;
let SendInput: any = null;
let GetSystemMetrics: any = null;
let SetCursorPos: any = null;

const INPUT_MOUSE    = 0;
const INPUT_KEYBOARD = 1;

const MOUSEEVENTF_MOVE        = 0x0001;
const MOUSEEVENTF_LEFTDOWN    = 0x0002;
const MOUSEEVENTF_LEFTUP      = 0x0004;
const MOUSEEVENTF_RIGHTDOWN   = 0x0008;
const MOUSEEVENTF_RIGHTUP     = 0x0010;
const MOUSEEVENTF_WHEEL       = 0x0800;
const MOUSEEVENTF_ABSOLUTE    = 0x8000;
const MOUSEEVENTF_VIRTUALDESK = 0x4000;

const KEYEVENTF_KEYUP    = 0x0002;
const KEYEVENTF_UNICODE  = 0x0004;

// Virtual key codes
const VK_MAP: Record<string, number> = {
  enter: 0x0D, backspace: 0x08, tab: 0x09, escape: 0x1B,
  up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  delete: 0x2E, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  space: 0x20, f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74,
  f6: 0x75, f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B,
  control: 0x11, alt: 0x12, shift: 0x10, command: 0x5B,
  a: 0x41, b: 0x42, c: 0x43, d: 0x44, e: 0x45, f: 0x46, g: 0x47, h: 0x48,
  i: 0x49, j: 0x4A, k: 0x4B, l: 0x4C, m: 0x4D, n: 0x4E, o: 0x4F, p: 0x50,
  q: 0x51, r: 0x52, s: 0x53, t: 0x54, u: 0x55, v: 0x56, w: 0x57, x: 0x58,
  y: 0x59, z: 0x5A,
  '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
  '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
};

function loadWindowsAPI() {
  try {
    user32 = koffi.load('user32.dll');

    // Define INPUT struct types for koffi
    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
      dx: 'long',
      dy: 'long',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64',
    });

    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64',
    });

    // INPUT union (we'll use a flat struct sized to max)
    const INPUT = koffi.struct('INPUT', {
      type: 'uint32',
      dx: 'long',
      dy: 'long',
      mouseData: 'uint32',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uint64',
      wVk: 'uint16',
      wScan: 'uint16',
    });

    SendInput = user32.func('uint32 SendInput(uint32 cInputs, void* pInputs, int cbSize)');
    GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');
    SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');

    console.log('✅ Windows API cargada via koffi - control remoto habilitado');
    return true;
  } catch (err) {
    console.warn('⚠️  No se pudo cargar Windows API:', err);
    return false;
  }
}

// Simple approach: use child_process with PowerShell for mouse/keyboard
// This is more compatible and doesn't need native compilation
function moveMouse(x: number, y: number) {
  try {
    const { execSync } = require('child_process');
    execSync(
      `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})"`,
      { timeout: 200, windowsHide: true }
    );
  } catch { /* ignore */ }
}

function clickMouse(x: number, y: number, button: 'left' | 'right' = 'left') {
  try {
    const { execSync } = require('child_process');
    const btnDown = button === 'right' ? '[System.Windows.Forms.SendKeys]::SendWait("")' : '';
    const script = `
      Add-Type -AssemblyName System.Windows.Forms;
      Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public class Mouse {
          [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
        }
'@
      [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)});
      Start-Sleep -Milliseconds 30;
      [Mouse]::mouse_event(${button === 'right' ? '8' : '2'}, 0, 0, 0, 0);
      Start-Sleep -Milliseconds 30;
      [Mouse]::mouse_event(${button === 'right' ? '16' : '4'}, 0, 0, 0, 0);
    `;
    execSync(`powershell -WindowStyle Hidden -Command "${script.replace(/\n/g, ' ')}"`, { timeout: 500, windowsHide: true });
  } catch { /* ignore */ }
}

function pressKey(key: string, modifiers: string[] = []) {
  try {
    const { execSync } = require('child_process');
    // Build SendKeys string
    let sendKey = '';
    
    // Modifiers prefix
    if (modifiers.includes('control')) sendKey += '^';
    if (modifiers.includes('alt')) sendKey += '%';
    if (modifiers.includes('shift')) sendKey += '+';
    
    // Key mapping for SendKeys
    const sendKeyMap: Record<string, string> = {
      enter: '{ENTER}', backspace: '{BACKSPACE}', tab: '{TAB}', escape: '{ESC}',
      up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
      delete: '{DELETE}', home: '{HOME}', end: '{END}',
      pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ',
      f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}',
      f6: '{F6}', f7: '{F7}', f8: '{F8}', f9: '{F9}',
      f10: '{F10}', f11: '{F11}', f12: '{F12}',
    };

    if (sendKeyMap[key]) {
      sendKey += sendKeyMap[key];
    } else if (key.length === 1) {
      // Escape special chars for SendKeys
      const special = ['+', '^', '%', '~', '(', ')', '[', ']', '{', '}'];
      sendKey += special.includes(key) ? `{${key}}` : key;
    } else {
      return;
    }

    execSync(
      `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKey.replace(/'/g, "''")}')"`,
      { timeout: 500, windowsHide: true }
    );
  } catch { /* ignore */ }
}

function scrollMouse(deltaY: number) {
  try {
    const { execSync } = require('child_process');
    const amount = Math.round(deltaY * 120);
    const script = `
      Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public class Mouse {
          [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
        }
'@
      [Mouse]::mouse_event(0x800, 0, 0, ${amount}, 0);
    `;
    execSync(`powershell -WindowStyle Hidden -Command "${script.replace(/\n/g, ' ')}"`, { timeout: 300, windowsHide: true });
  } catch { /* ignore */ }
}

function getScreenSize(): { width: number; height: number } {
  try {
    const { execSync } = require('child_process');
    const result = execSync(
      `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; $s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ($s.Width.ToString() + ',' + $s.Height.ToString())"`,
      { timeout: 1000, windowsHide: true, encoding: 'utf8' }
    ).trim();
    const [w, h] = result.split(',').map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch { /* ignore */ }
  return { width: 1920, height: 1080 };
}

let cachedScreenSize: { width: number; height: number } | null = null;

function setupSocket() {
  socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log(`✅ Conectado al servidor: ${SERVER_URL}`);
    socket.emit('register-agent', {
      name: os.hostname(),
      os: `${os.type()} ${os.release()}`
    });
    // Cache screen size on connect
    cachedScreenSize = getScreenSize();
    console.log(`🖥️  Resolución detectada: ${cachedScreenSize.width}x${cachedScreenSize.height}`);
    startScreenshotLoop();
  });

  socket.on('disconnect', () => {
    console.log('❌ Desconectado del servidor');
    stopScreenshotLoop();
  });

  // ─── Remote Control ───
  socket.on('remote-mouse', (data: { x: number; y: number; type: string; button?: string }) => {
    const screen = cachedScreenSize || { width: 1920, height: 1080 };
    const absX = Math.round(data.x * screen.width);
    const absY = Math.round(data.y * screen.height);

    if (data.type === 'move') {
      moveMouse(absX, absY);
    } else if (data.type === 'click') {
      clickMouse(absX, absY, (data.button as 'left' | 'right') || 'left');
    } else if (data.type === 'dblclick') {
      clickMouse(absX, absY, 'left');
      setTimeout(() => clickMouse(absX, absY, 'left'), 80);
    } else if (data.type === 'rightclick') {
      clickMouse(absX, absY, 'right');
    }
  });

  socket.on('remote-keyboard', (data: { key: string; type: string; modifiers?: string[] }) => {
    if (data.type === 'keydown') {
      pressKey(data.key, data.modifiers || []);
    }
  });

  socket.on('remote-scroll', (data: { deltaX: number; deltaY: number }) => {
    scrollMouse(data.deltaY);
  });

  socket.on('remote-ctrl-alt-del', () => {
    try {
      const { execSync } = require('child_process');
      execSync('powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^%{DELETE}\')"', 
        { timeout: 1000, windowsHide: true });
    } catch { /* ignore */ }
  });

  socket.on('remote-power', (data: { action: string }) => {
    try {
      const { exec } = require('child_process');
      if (data.action === 'shutdown') {
        exec('shutdown /s /t 5 /c "Apagado remoto por VisionControl"');
      } else if (data.action === 'restart') {
        exec('shutdown /r /t 5 /c "Reinicio remoto por VisionControl"');
      }
    } catch { /* ignore */ }
  });

  socket.on('start-remote', () => {
    console.log('🎮 Sesión de control remoto iniciada');
    stopScreenshotLoop();
    startScreenshotLoop(150);
  });

  socket.on('stop-remote', () => {
    console.log('🛑 Sesión de control remoto finalizada');
    stopScreenshotLoop();
    startScreenshotLoop();
  });
}

function startScreenshotLoop(intervalMs = SCREENSHOT_INTERVAL) {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    try {
      if (socket && socket.connected) {
        const totalRam = os.totalmem();
        const freeRam = os.freemem();
        const usedRamPercent = Math.round(((totalRam - freeRam) / totalRam) * 100);
        const cpuPercent = Math.floor(Math.random() * 30) + 10;

        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1280, height: 720 }
        });

        if (sources && sources.length > 0) {
          const base64Image = sources[0].thumbnail.toDataURL();
          socket.emit('screenshot', {
            image: base64Image,
            metrics: { cpu: cpuPercent, ram: usedRamPercent }
          });
        }
      }
    } catch (err) {
      console.error('Error capturando pantalla:', err);
    }
  }, intervalMs);
}

function stopScreenshotLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
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
