const koffi = require('koffi');
const user32 = koffi.load('user32.dll');
const GetForegroundWindow = user32.func('void* GetForegroundWindow()');
const GetWindowText = user32.func('int GetWindowTextW(void* hWnd, _Out_ char16_t* lpString, int nMaxCount)');

function getActiveWindow() {
  const hwnd = GetForegroundWindow();
  if (!hwnd) return '';
  const buf = Buffer.alloc(512);
  const len = GetWindowText(hwnd, buf, 256);
  if (len > 0) {
    return buf.toString('utf16le').replace(/\0/g, '').trim();
  }
  return '';
}

console.log('Active Window:', getActiveWindow());
