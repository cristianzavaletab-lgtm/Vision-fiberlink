import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, MousePointer2, Mic, X, Maximize2, Terminal, Power, Video, Keyboard, Move, RotateCcw, Hand } from 'lucide-react';
import type { Report } from '../App';
import { io, Socket } from 'socket.io-client';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
}

interface MonitoreoProps {
  devices: Device[];
  screenshots: Record<string, string>;
  globalReports: Report[];
  addReport: (device: string, type: string, description: string, status?: string) => void;
}

const SERVER_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

export function MonitoreoView({ devices, screenshots, globalReports, addReport }: MonitoreoProps) {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [remoteState, setRemoteState] = useState<'none' | 'connecting' | 'remote' | 'terminal'>('none');
  const [sessionTime, setSessionTime] = useState(0);
  const [activeTab, setActiveTab] = useState<'acciones' | 'historial'>('acciones');
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [socketRef, setSocketRef] = useState<Socket | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const screenContainerRef = useRef<HTMLDivElement>(null);

  // Get or create socket for remote control
  useEffect(() => {
    const s = io(SERVER_URL, { autoConnect: true });
    setSocketRef(s);
    return () => { s.disconnect(); };
  }, []);

  // Session Timer
  useEffect(() => {
    let interval: number;
    if (remoteState === 'remote' || remoteState === 'terminal') {
      interval = window.setInterval(() => setSessionTime(t => t + 1), 1000);
    } else {
      setSessionTime(0);
    }
    return () => clearInterval(interval);
  }, [remoteState]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Convert screen coordinates to normalized (0-1)
  const getNormalizedPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  // ─── Remote control event handlers ───
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;
    const pos = getNormalizedPos(e);
    setCursorPos({ x: e.clientX, y: e.clientY });
    setShowCursor(true);
    socketRef.emit('remote-mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'move' });
  }, [remoteState, selectedDevice, socketRef, getNormalizedPos]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;
    e.preventDefault();
    const pos = getNormalizedPos(e);
    const button = e.button === 2 ? 'right' : 'left';
    socketRef.emit('remote-mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'click', button });
  }, [remoteState, selectedDevice, socketRef, getNormalizedPos]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;
    e.preventDefault();
    const pos = getNormalizedPos(e);
    socketRef.emit('remote-mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'dblclick' });
  }, [remoteState, selectedDevice, socketRef, getNormalizedPos]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (remoteState !== 'remote') return;
    e.preventDefault();
    if (!selectedDevice || !socketRef) return;
    const pos = getNormalizedPos(e);
    socketRef.emit('remote-mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'rightclick' });
  }, [remoteState, selectedDevice, socketRef, getNormalizedPos]);

  const handleScroll = useCallback((e: React.WheelEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;
    e.preventDefault();
    socketRef.emit('remote-scroll', { deviceId: selectedDevice.id, deltaX: e.deltaX, deltaY: e.deltaY > 0 ? -3 : 3 });
  }, [remoteState, selectedDevice, socketRef]);

  // Keyboard capture during remote
  useEffect(() => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;

    const keyMap: Record<string, string> = {
      'Enter': 'enter', 'Backspace': 'backspace', 'Tab': 'tab', 'Escape': 'escape',
      'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
      'Delete': 'delete', 'Home': 'home', 'End': 'end', 'PageUp': 'pageup', 'PageDown': 'pagedown',
      ' ': 'space', 'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5',
      'F6': 'f6', 'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10', 'F11': 'f11', 'F12': 'f12',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push('control');
      if (e.altKey) modifiers.push('alt');
      if (e.shiftKey) modifiers.push('shift');
      if (e.metaKey) modifiers.push('command');

      let key = keyMap[e.key] || (e.key.length === 1 ? e.key.toLowerCase() : null);
      if (!key) return;

      socketRef.emit('remote-keyboard', { deviceId: selectedDevice.id, key, type: 'keydown', modifiers });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [remoteState, selectedDevice, socketRef]);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;
    const pos = getNormalizedPos(e);
    socketRef.emit('remote-mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'click', button: 'left' });
  }, [remoteState, selectedDevice, socketRef, getNormalizedPos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (remoteState !== 'remote' || !selectedDevice || !socketRef) return;
    const pos = getNormalizedPos(e);
    socketRef.emit('remote-mouse', { deviceId: selectedDevice.id, x: pos.x, y: pos.y, type: 'move' });
  }, [remoteState, selectedDevice, socketRef, getNormalizedPos]);

  const handleStartSession = (type: 'remote' | 'terminal') => {
    setRemoteState('connecting');
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Sesión', `Inició acceso ${type === 'remote' ? 'remoto' : 'por terminal'}`);
      if (socketRef) {
        socketRef.emit('start-remote', { deviceId: selectedDevice.id });
      }
    }
    setTimeout(() => {
      setRemoteState(type);
    }, 1500);
  };

  const handleEndSession = () => {
    if (selectedDevice && socketRef) {
      socketRef.emit('stop-remote', { deviceId: selectedDevice.id });
      addReport(selectedDevice.id, 'Sesión', 'Finalizó sesión de control remoto');
    }
    setRemoteState('none');
  };

  const handleCtrlAltDel = () => {
    if (selectedDevice && socketRef) {
      socketRef.emit('remote-ctrl-alt-del', { deviceId: selectedDevice.id });
      addReport(selectedDevice.id, 'Sistema', 'Envió Ctrl+Alt+Supr');
    }
  };

  const handlePowerOff = () => {
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Alerta', 'Apagado forzado del equipo ejecutado', 'Crítico');
      if (socketRef) {
        socketRef.emit('remote-power', { deviceId: selectedDevice.id, action: 'shutdown' });
      }
    }
    closeDeviceModal();
  };

  const handleRestart = () => {
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Sistema', 'Reinicio remoto ejecutado');
      if (socketRef) {
        socketRef.emit('remote-power', { deviceId: selectedDevice.id, action: 'restart' });
      }
    }
    closeDeviceModal();
  };

  const closeDeviceModal = () => {
    if (selectedDevice && socketRef && (remoteState === 'remote' || remoteState === 'terminal')) {
      socketRef.emit('stop-remote', { deviceId: selectedDevice.id });
    }
    setSelectedDevice(null);
    setRemoteState('none');
    setActiveTab('acciones');
    setShowCursor(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3 className="text-brand-primary text-xs font-bold tracking-[0.2em] uppercase mb-2">War Room</h3>
          <h1 className="text-3xl font-bold text-text-primary mb-2 tracking-tight">Monitoreo en vivo</h1>
          <p className="text-text-secondary text-base max-w-xl">
            Vista consolidada de pantallas activas en tiempo real. Click en un tile para entrar en modo fullscreen.
          </p>
        </div>
        <div>
          <button className="flex items-center gap-2 bg-brand-primary/10 border border-brand-primary/30 px-4 py-2 rounded-full text-sm font-bold text-brand-secondary">
            <Radio className="w-4 h-4 animate-pulse" /> LIVE • {devices.length} streams activos
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 bg-bg-surface rounded-2xl border border-bg-elevated border-dashed">
          <Radio className="w-12 h-12 text-bg-elevated mb-4" />
          <p className="text-text-tertiary font-medium">Esperando conexiones de agentes...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {devices.map(device => {
            const isAlert = device.id.includes('LIM-1008') || device.name.includes('alerta');
            
            return (
              <div 
                key={device.id} 
                className={`group relative overflow-hidden bg-bg-surface rounded-2xl border transition-all cursor-pointer ${
                  isAlert ? 'border-red-500/50 hover:border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-bg-elevated hover:border-brand-primary/50'
                }`}
                onClick={() => setSelectedDevice(device)}
              >
                <div className="aspect-video bg-[#0a0a0a] relative overflow-hidden">
                  {screenshots[device.id] ? (
                    <img 
                      src={screenshots[device.id]} 
                      alt={`Screen of ${device.name}`}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-bg-highlight">
                      <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin mb-2" />
                      <span className="text-xs font-bold tracking-widest uppercase">Connecting</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border backdrop-blur-md ${
                      isAlert 
                        ? 'bg-red-500/20 border-red-500/50 text-red-400' 
                        : 'bg-black/40 border-white/10 text-green-400'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isAlert ? 'bg-red-500' : 'bg-green-500'}`} />
                      <span className="text-[10px] font-bold tracking-wider uppercase">
                        {isAlert ? 'ALERTA' : 'EN VIVO'}
                      </span>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:100%_4px] pointer-events-none" />
                </div>
                <div className="p-4 bg-bg-surface">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-text-primary tracking-tight">@{device.name.toLowerCase()}</h3>
                      <p className="text-xs text-text-tertiary mt-1 font-mono">
                        Sede Central • {device.id.substring(0, 8)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button className="w-8 h-8 rounded-lg bg-bg-base border border-bg-elevated flex items-center justify-center text-text-secondary hover:text-brand-primary transition-colors">
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ MODAL FULLSCREEN INTERACTIVO ═══════════ */}
      {selectedDevice && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-bg-base/95 backdrop-blur-md animate-in zoom-in-95 duration-200">
          {/* Top Bar */}
          <div className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-bg-elevated shrink-0 bg-bg-surface shadow-md z-10">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${remoteState === 'remote' ? 'bg-brand-primary' : 'bg-green-500'}`} />
              <div>
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  @{selectedDevice.name.toLowerCase()}
                  {(remoteState === 'remote' || remoteState === 'terminal') && (
                    <span className="bg-brand-primary text-white px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider animate-pulse">
                      ● CONTROLANDO — {formatTime(sessionTime)}
                    </span>
                  )}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {remoteState === 'remote' && (
                <div className="hidden sm:flex items-center gap-1 bg-bg-base p-1 rounded-lg border border-bg-elevated">
                  <button
                    onClick={handleCtrlAltDel}
                    className="px-3 py-1.5 text-[11px] font-bold text-text-secondary hover:text-text-primary rounded hover:bg-bg-highlight transition-colors flex items-center gap-1.5"
                    title="Enviar Ctrl+Alt+Supr"
                  >
                    <Keyboard className="w-3.5 h-3.5" /> Ctrl+Alt+Del
                  </button>
                  <button className="px-3 py-1.5 text-[11px] font-bold text-text-secondary hover:text-text-primary rounded hover:bg-bg-highlight transition-colors flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" /> HD
                  </button>
                  <button
                    onClick={handleEndSession}
                    className="px-3 py-1.5 text-[11px] font-bold bg-red-500 text-white rounded transition-colors hover:bg-red-600 flex items-center gap-1.5 shadow-lg shadow-red-500/20"
                  >
                    <X className="w-3.5 h-3.5" /> Desconectar
                  </button>
                </div>
              )}
              {remoteState === 'terminal' && (
                <button
                  onClick={handleEndSession}
                  className="px-3 py-1.5 text-[11px] font-bold bg-red-500 text-white rounded transition-colors hover:bg-red-600 flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Cerrar Terminal
                </button>
              )}
              <button 
                onClick={closeDeviceModal}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary hover:bg-bg-highlight transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* ─── Main Area: Interactive Screen ─── */}
            <div 
              ref={screenContainerRef}
              className={`flex-1 bg-black relative flex items-center justify-center overflow-hidden ${remoteState === 'remote' ? 'cursor-none' : ''}`}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              onDoubleClick={handleDblClick}
              onContextMenu={handleContextMenu}
              onWheel={handleScroll}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onMouseLeave={() => setShowCursor(false)}
            >
              {/* Connecting Animation */}
              {remoteState === 'connecting' && (
                <div className="flex flex-col items-center text-text-secondary animate-in fade-in duration-300">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <MousePointer2 className="w-6 h-6 text-brand-primary" />
                    </div>
                  </div>
                  <span className="uppercase tracking-widest text-sm font-bold text-brand-primary">Estableciendo conexión segura...</span>
                  <span className="text-xs text-text-tertiary mt-2 font-mono">Negociando túnel P2P cifrado</span>
                  <div className="flex gap-1 mt-4">
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {/* Terminal View */}
              {remoteState === 'terminal' && (
                <div className="w-full h-full bg-[#0c0c0c] p-6 font-mono text-sm text-green-400 overflow-y-auto animate-in fade-in">
                  <div className="mb-4 text-green-500/70">
                    Fiberlink Remote Console v2.4.1<br/>
                    Connected to {selectedDevice.id} ({selectedDevice.os})<br/>
                    ---------------------------------------------------
                  </div>
                  <div className="flex flex-col gap-1">
                    <span>&gt; systemctl status fiberlink-agent</span>
                    <span className="text-text-secondary">● fiberlink-agent.service - Fiberlink Remote Agent</span>
                    <span className="text-text-secondary">   Loaded: loaded</span>
                    <span className="text-green-500">   Active: active (running)</span>
                    <span className="mt-2">&gt; ping 8.8.8.8 -c 2</span>
                    <span className="text-text-secondary">64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=14.2 ms</span>
                    <span className="text-text-secondary">64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=13.8 ms</span>
                    <span className="mt-2 flex items-center gap-2">
                      <span className="text-blue-400">admin@{selectedDevice.name.toLowerCase()}</span>:~$
                      <span className="w-2 h-4 bg-green-400 animate-pulse inline-block" />
                    </span>
                  </div>
                </div>
              )}

              {/* Screen View (watching or controlling) */}
              {(remoteState === 'none' || remoteState === 'remote') && (
                <>
                  {screenshots[selectedDevice.id] ? (
                    <img 
                      ref={imgRef}
                      src={screenshots[selectedDevice.id]} 
                      alt={`Screen of ${selectedDevice.name}`}
                      className={`max-w-full max-h-full object-contain transition-all duration-300 select-none ${
                        remoteState === 'remote' 
                          ? 'scale-100 opacity-100' 
                          : 'scale-[0.97] opacity-80 rounded-lg border border-white/10'
                      }`}
                      draggable={false}
                    />
                  ) : (
                    <div className="flex flex-col items-center text-text-secondary">
                      <Radio className="w-12 h-12 mb-4 animate-pulse text-brand-primary" />
                      <span className="uppercase tracking-widest text-sm font-bold">Esperando Video...</span>
                    </div>
                  )}
                  
                  {/* Remote active border glow */}
                  {remoteState === 'remote' && (
                    <>
                      <div className="absolute inset-0 border-2 border-brand-primary/40 pointer-events-none animate-pulse" />
                      {/* Custom cursor indicator */}
                      {showCursor && (
                        <div 
                          className="fixed pointer-events-none z-[200] transition-transform duration-75"
                          style={{ left: cursorPos.x - 8, top: cursorPos.y - 8 }}
                        >
                          <div className="w-4 h-4 border-2 border-brand-primary rounded-full bg-brand-primary/30 shadow-lg shadow-brand-primary/50" />
                        </div>
                      )}
                      {/* Touch instruction for mobile */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 pointer-events-none sm:hidden">
                        <Hand className="w-4 h-4 text-brand-primary" />
                        <span className="text-[11px] text-white font-medium">Toca para hacer clic • Desliza para mover</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            
            {/* ─── Side Panel ─── */}
            <div className="w-full md:w-[320px] bg-bg-surface border-t md:border-t-0 md:border-l border-bg-elevated flex flex-col shrink-0 overflow-hidden">
              <div className="flex border-b border-bg-elevated">
                <button 
                  onClick={() => setActiveTab('acciones')}
                  className={`flex-1 py-3.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'acciones' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
                >
                  Acciones
                </button>
                <button 
                  onClick={() => setActiveTab('historial')}
                  className={`flex-1 py-3.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'historial' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
                >
                  Historial
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {activeTab === 'acciones' && (
                  <div className="flex flex-col gap-3">
                    {(remoteState === 'remote' || remoteState === 'terminal') ? (
                      <div className="space-y-4">
                        {/* Active session card */}
                        <div className="bg-gradient-to-br from-brand-primary/20 to-brand-dark/10 border border-brand-primary/30 rounded-xl p-5 text-center">
                          <div className="w-14 h-14 bg-brand-primary/20 text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-3 border border-brand-primary/30">
                            {remoteState === 'remote' ? <Move className="w-7 h-7" /> : <Terminal className="w-7 h-7" />}
                          </div>
                          <h4 className="text-text-primary font-bold text-lg mb-1">
                            {remoteState === 'remote' ? 'Control Activo' : 'Terminal Activa'}
                          </h4>
                          <p className="text-xs text-text-secondary mb-1">
                            {remoteState === 'remote' 
                              ? 'Haz clic, escribe y desplázate directamente sobre la pantalla.' 
                              : 'Consola SSH conectada al equipo.'}
                          </p>
                          <div className="text-2xl font-mono font-bold text-brand-primary my-3">
                            {formatTime(sessionTime)}
                          </div>
                          <p className="text-[10px] text-text-tertiary mb-4">Todas las acciones quedan registradas.</p>
                          <button 
                            onClick={handleEndSession}
                            className="w-full py-3 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                          >
                            <Power className="w-4 h-4" /> Finalizar Sesión
                          </button>
                        </div>

                        {remoteState === 'remote' && (
                          <button 
                            onClick={handleCtrlAltDel}
                            className="w-full flex items-center gap-3 p-3 rounded-xl border border-bg-elevated bg-bg-base hover:border-brand-primary transition-colors text-left sm:hidden"
                          >
                            <Keyboard className="w-5 h-5 text-brand-primary" />
                            <span className="text-sm font-bold text-text-primary">Ctrl+Alt+Supr</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleStartSession('remote')}
                          className="flex items-center gap-4 p-4 rounded-xl border border-bg-elevated bg-bg-base hover:border-brand-primary hover:bg-brand-primary/10 transition-all group text-left hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <div className="w-12 h-12 rounded-xl bg-bg-highlight flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-colors shadow-sm">
                            <MousePointer2 className="w-6 h-6 text-text-secondary group-hover:text-white" />
                          </div>
                          <div>
                            <div className="text-base font-bold text-text-primary mb-0.5">Control Remoto</div>
                            <div className="text-xs text-text-tertiary">Clic, teclado y scroll en tiempo real</div>
                          </div>
                        </button>

                        <button 
                          onClick={() => handleStartSession('terminal')}
                          className="flex items-center gap-4 p-4 rounded-xl border border-bg-elevated bg-bg-base hover:border-brand-primary hover:bg-brand-primary/10 transition-all group text-left hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <div className="w-12 h-12 rounded-xl bg-bg-highlight flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-colors shadow-sm">
                            <Terminal className="w-6 h-6 text-text-secondary group-hover:text-white" />
                          </div>
                          <div>
                            <div className="text-base font-bold text-text-primary mb-0.5">Terminal SSH</div>
                            <div className="text-xs text-text-tertiary">Acceso a consola del sistema</div>
                          </div>
                        </button>
                        
                        <button className="flex items-center gap-4 p-4 rounded-xl border border-bg-elevated bg-bg-base hover:border-brand-primary hover:bg-brand-primary/10 transition-all group text-left hover:scale-[1.02] active:scale-[0.98]">
                          <div className="w-12 h-12 rounded-xl bg-bg-highlight flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-colors shadow-sm">
                            <Mic className="w-6 h-6 text-text-secondary group-hover:text-white" />
                          </div>
                          <div>
                            <div className="text-base font-bold text-text-primary mb-0.5">Escucha Activa</div>
                            <div className="text-xs text-text-tertiary">Activar micrófono remoto</div>
                          </div>
                        </button>

                        <div className="h-px bg-bg-elevated my-1" />

                        <div className="grid grid-cols-2 gap-2">
                          <button 
                            onClick={handlePowerOff}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 hover:border-red-500 hover:bg-red-500/10 transition-colors group"
                          >
                            <Power className="w-5 h-5 text-red-500" />
                            <span className="text-[11px] font-bold text-red-500">Apagar</span>
                          </button>
                          <button 
                            onClick={handleRestart}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-orange-500/20 bg-orange-500/5 hover:border-orange-500 hover:bg-orange-500/10 transition-colors group"
                          >
                            <RotateCcw className="w-5 h-5 text-orange-500" />
                            <span className="text-[11px] font-bold text-orange-500">Reiniciar</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'historial' && (
                  <div className="relative pl-4 border-l-2 border-bg-elevated ml-2 space-y-6 pb-4">
                    {globalReports.filter(r => r.device === selectedDevice.id).length === 0 && (
                      <div className="text-sm text-text-tertiary italic py-4">Sin actividad registrada aún.</div>
                    )}
                    {globalReports.filter(r => r.device === selectedDevice.id).map((log) => (
                      <div key={log.id} className="relative">
                        <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 border-bg-surface ${
                          log.type === 'Alerta' ? 'bg-red-500' : log.type === 'Sistema' ? 'bg-green-500' : 'bg-brand-primary'
                        }`} />
                        <div className="text-xs font-mono text-text-tertiary mb-1">{log.date}</div>
                        <div className="text-sm text-text-primary font-medium">{log.description}</div>
                      </div>
                    ))}
                    <div className="relative">
                      <div className="absolute -left-[21px] w-3 h-3 rounded-full border-2 border-bg-surface bg-bg-elevated" />
                      <div className="text-xs font-mono text-text-tertiary mb-1">—</div>
                      <div className="text-sm text-text-secondary font-medium italic">Fin del historial</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
