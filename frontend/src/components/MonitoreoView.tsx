import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, MousePointer2, Mic, X, Maximize2, Terminal, Power, Video, Keyboard, Move, RotateCcw, Hand, Wifi, Cpu, HardDrive, Clock, Shield } from 'lucide-react';
import type { Report } from '../App';
import { io, Socket } from 'socket.io-client';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
  cpu?: number;
  ram?: number;
}

interface MonitoreoProps {
  devices: Device[];
  screenshots: Record<string, string>;
  globalReports: Report[];
  addReport: (device: string, type: string, description: string, status?: string) => void;
}

const SERVER_URL = "https://visioncontrol-server.onrender.com";

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

  useEffect(() => {
    const s = io(SERVER_URL, { autoConnect: true });
    setSocketRef(s);
    return () => { s.disconnect(); };
  }, []);

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
      if (socketRef) socketRef.emit('start-remote', { deviceId: selectedDevice.id });
    }
    setTimeout(() => setRemoteState(type), 1500);
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
      if (socketRef) socketRef.emit('remote-power', { deviceId: selectedDevice.id, action: 'shutdown' });
    }
    closeDeviceModal();
  };

  const handleRestart = () => {
    if (selectedDevice) {
      addReport(selectedDevice.id, 'Sistema', 'Reinicio remoto ejecutado');
      if (socketRef) socketRef.emit('remote-power', { deviceId: selectedDevice.id, action: 'restart' });
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

  const onlineDevices = devices.filter(d => d.status === 'online');

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4 animate-float-up">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 rounded-full bg-gradient-to-b from-brand-primary to-brand-secondary" />
            <h3 className="text-brand-primary text-[11px] font-bold tracking-[0.25em] uppercase">War Room</h3>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary mb-2 tracking-tight leading-tight">
            Monitoreo en vivo
          </h1>
          <p className="text-text-secondary text-sm max-w-lg leading-relaxed">
            Vista consolidada de pantallas activas en tiempo real. Click en un tile para ver detalles y tomar control.
          </p>
        </div>
        <div>
          <div className="inline-flex items-center gap-2.5 bg-bg-surface/60 backdrop-blur-md border border-glass-border px-5 py-2.5 rounded-2xl glow-brand transition-all hover:glow-brand-strong">
            <div className="relative">
              <Radio className="w-4 h-4 text-brand-primary" />
              <div className="absolute inset-0 text-brand-primary animate-pulse-ring">
                <Radio className="w-4 h-4" />
              </div>
            </div>
            <span className="text-sm font-bold text-text-primary tracking-tight">
              LIVE <span className="text-brand-primary">•</span> {onlineDevices.length} stream{onlineDevices.length !== 1 ? 's' : ''} activo{onlineDevices.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Device Grid ─── */}
      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-bg-surface/30 backdrop-blur-sm rounded-3xl border border-glass-border border-dashed animate-float-up">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl bg-bg-elevated/50 flex items-center justify-center">
              <Wifi className="w-10 h-10 text-text-tertiary/50" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-bg-elevated border-2 border-bg-base flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-text-tertiary animate-breathe" />
            </div>
          </div>
          <p className="text-text-secondary font-semibold text-lg mb-1">Esperando conexiones...</p>
          <p className="text-text-tertiary text-sm max-w-sm text-center">
            Instala el agente VisionControl en los equipos para comenzar el monitoreo en tiempo real.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {devices.map((device, index) => {
            const isOnline = device.status === 'online';
            
            return (
              <div 
                key={device.id} 
                className={`group relative overflow-hidden bg-bg-surface/40 backdrop-blur-sm rounded-2xl border transition-all duration-500 cursor-pointer hover-card animate-float-up stagger-${Math.min(index + 1, 6)} ${
                  isOnline 
                    ? 'border-glass-border hover:border-brand-primary/40 hover:glow-brand' 
                    : 'border-glass-border hover:border-red-500/30 opacity-60 hover:opacity-80'
                }`}
                onClick={() => setSelectedDevice(device)}
              >
                {/* Screenshot Area */}
                <div className="aspect-video bg-[#050508] relative overflow-hidden rounded-t-2xl">
                  {screenshots[device.id] ? (
                    <img 
                      src={screenshots[device.id]} 
                      alt={`Screen of ${device.name}`}
                      className="w-full h-full object-cover opacity-75 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-700 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                      <div className="w-8 h-8 rounded-full border-2 border-text-tertiary/30 border-t-brand-primary animate-spin mb-3" />
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-text-tertiary">Conectando</span>
                    </div>
                  )}
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-xl border text-[10px] font-bold tracking-wider uppercase ${
                      isOnline
                        ? 'bg-status-online/10 border-status-online/20 text-status-online'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-status-online animate-breathe' : 'bg-red-500'}`} />
                      {isOnline ? 'En Vivo' : 'Offline'}
                    </div>
                  </div>
                  
                  {/* Hover Expand Icon */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                    <div className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Scanline overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[length:100%_3px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {/* Bottom gradient fade */}
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bg-surface/80 to-transparent pointer-events-none" />
                </div>
                
                {/* Device Info */}
                <div className="p-4 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-text-primary tracking-tight text-sm leading-tight flex items-center gap-2">
                        @{device.name.toLowerCase()}
                      </h3>
                      <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                        {device.os || 'Windows'} • {device.id.substring(0, 8)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Mini Metrics */}
                  {isOnline && (device.cpu || device.ram) && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-glass-border">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Cpu className="w-3 h-3 text-text-tertiary" />
                        <span className="text-text-secondary font-mono font-medium">{device.cpu || '--'}%</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <HardDrive className="w-3 h-3 text-text-tertiary" />
                        <span className="text-text-secondary font-mono font-medium">{device.ram || '--'}%</span>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 text-[11px]">
                        <Clock className="w-3 h-3 text-text-tertiary" />
                        <span className="text-text-tertiary font-mono">Ahora</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════ MODAL FULLSCREEN INTERACTIVO ═══════════ */}
      {selectedDevice && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl">
          {/* Top Bar */}
          <div className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-glass-border shrink-0 bg-bg-surface/40 backdrop-blur-2xl z-10">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-2.5 h-2.5 rounded-full ${remoteState === 'remote' ? 'bg-brand-primary' : 'bg-status-online'}`} />
                {remoteState === 'remote' && <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse-ring" />}
              </div>
              <div>
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2">
                  @{selectedDevice.name.toLowerCase()}
                  {(remoteState === 'remote' || remoteState === 'terminal') && (
                    <span className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white px-3 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider shadow-lg shadow-brand-primary/20 animate-breathe">
                      ● CONTROLANDO — {formatTime(sessionTime)}
                    </span>
                  )}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {remoteState === 'remote' && (
                <div className="hidden sm:flex items-center gap-1 bg-bg-base/60 backdrop-blur-md p-1 rounded-xl border border-glass-border">
                  <button
                    onClick={handleCtrlAltDel}
                    className="px-3 py-1.5 text-[11px] font-bold text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-highlight/50 transition-all flex items-center gap-1.5"
                    title="Enviar Ctrl+Alt+Supr"
                  >
                    <Keyboard className="w-3.5 h-3.5" /> Ctrl+Alt+Del
                  </button>
                  <button className="px-3 py-1.5 text-[11px] font-bold text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-highlight/50 transition-all flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" /> HD
                  </button>
                  <button
                    onClick={handleEndSession}
                    className="px-3 py-1.5 text-[11px] font-bold bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg transition-all hover:shadow-lg hover:shadow-red-500/25 flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" /> Desconectar
                  </button>
                </div>
              )}
              {remoteState === 'terminal' && (
                <button
                  onClick={handleEndSession}
                  className="px-3 py-1.5 text-[11px] font-bold bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg transition-all flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Cerrar Terminal
                </button>
              )}
              <button 
                onClick={closeDeviceModal}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-bg-elevated/40 backdrop-blur-md text-text-secondary hover:text-white hover:bg-white/10 transition-all border border-glass-border"
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
                <div className="flex flex-col items-center text-text-secondary animate-float-up">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 rounded-full border-[3px] border-brand-primary/15 border-t-brand-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Shield className="w-8 h-8 text-brand-primary" />
                    </div>
                  </div>
                  <span className="uppercase tracking-[0.3em] text-sm font-bold text-brand-primary mb-2">Estableciendo conexión</span>
                  <span className="text-xs text-text-tertiary font-mono">Negociando túnel P2P cifrado...</span>
                  <div className="flex gap-1.5 mt-6">
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {/* Terminal View */}
              {remoteState === 'terminal' && (
                <div className="w-full h-full bg-[#0a0a0e] p-6 font-mono text-sm text-emerald-400 overflow-y-auto">
                  <div className="mb-4 text-emerald-500/50 text-xs">
                    Fiberlink Remote Console v2.4.1<br/>
                    Connected to {selectedDevice.id} ({selectedDevice.os})<br/>
                    <span className="text-text-tertiary">───────────────────────────────────────</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-emerald-300">&gt; systemctl status fiberlink-agent</span>
                    <span className="text-text-secondary text-xs">● fiberlink-agent.service - Fiberlink Remote Agent</span>
                    <span className="text-text-secondary text-xs">   Loaded: loaded</span>
                    <span className="text-emerald-400 text-xs">   Active: active (running)</span>
                    <span className="text-emerald-300 mt-2">&gt; ping 8.8.8.8 -c 2</span>
                    <span className="text-text-secondary text-xs">64 bytes from 8.8.8.8: icmp_seq=1 ttl=118 time=14.2 ms</span>
                    <span className="text-text-secondary text-xs">64 bytes from 8.8.8.8: icmp_seq=2 ttl=118 time=13.8 ms</span>
                    <span className="mt-3 flex items-center gap-2">
                      <span className="text-blue-400 text-xs">admin@{selectedDevice.name.toLowerCase()}</span><span className="text-text-tertiary text-xs">:~$</span>
                      <span className="w-2 h-5 bg-emerald-400 animate-pulse inline-block rounded-sm" />
                    </span>
                  </div>
                </div>
              )}

              {/* Screen View */}
              {(remoteState === 'none' || remoteState === 'remote') && (
                <>
                  {screenshots[selectedDevice.id] ? (
                    <img 
                      ref={imgRef}
                      src={screenshots[selectedDevice.id]} 
                      alt={`Screen of ${selectedDevice.name}`}
                      className={`max-w-full max-h-full object-contain transition-all duration-500 select-none ${
                        remoteState === 'remote' 
                          ? 'scale-100 opacity-100' 
                          : 'scale-[0.96] opacity-70 rounded-xl border border-white/5 shadow-2xl'
                      }`}
                      draggable={false}
                    />
                  ) : (
                    <div className="flex flex-col items-center text-text-secondary">
                      <Radio className="w-14 h-14 mb-4 text-brand-primary/40 animate-breathe" />
                      <span className="uppercase tracking-[0.25em] text-xs font-bold text-text-tertiary">Esperando Video...</span>
                    </div>
                  )}
                  
                  {/* Remote active border glow */}
                  {remoteState === 'remote' && (
                    <>
                      <div className="absolute inset-0 border-2 border-brand-primary/30 pointer-events-none animate-breathe rounded-none" />
                      {/* Corner accents */}
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-brand-primary/60 pointer-events-none" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-brand-primary/60 pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-brand-primary/60 pointer-events-none" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-brand-primary/60 pointer-events-none" />
                      
                      {showCursor && (
                        <div 
                          className="fixed pointer-events-none z-[200] transition-transform duration-75"
                          style={{ left: cursorPos.x - 10, top: cursorPos.y - 10 }}
                        >
                          <div className="w-5 h-5 border-2 border-brand-primary rounded-full bg-brand-primary/20 shadow-[0_0_16px_rgba(255,107,53,0.5)]" />
                        </div>
                      )}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-white/5 flex items-center gap-2 pointer-events-none sm:hidden">
                        <Hand className="w-4 h-4 text-brand-primary" />
                        <span className="text-[11px] text-white/80 font-medium">Toca para clic • Desliza para mover</span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            
            {/* ─── Side Panel ─── */}
            <div className="w-full md:w-[340px] bg-bg-surface/30 backdrop-blur-2xl border-t md:border-t-0 md:border-l border-glass-border flex flex-col shrink-0 overflow-hidden">
              {/* Tab Headers */}
              <div className="flex border-b border-glass-border">
                <button 
                  onClick={() => setActiveTab('acciones')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-[0.15em] transition-all border-b-2 ${
                    activeTab === 'acciones' 
                      ? 'border-brand-primary text-brand-primary bg-brand-primary/5' 
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Acciones
                </button>
                <button 
                  onClick={() => setActiveTab('historial')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-[0.15em] transition-all border-b-2 ${
                    activeTab === 'historial' 
                      ? 'border-brand-primary text-brand-primary bg-brand-primary/5' 
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Historial
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {activeTab === 'acciones' && (
                  <div className="flex flex-col gap-3">
                    {(remoteState === 'remote' || remoteState === 'terminal') ? (
                      <div className="space-y-4">
                        <div className="relative overflow-hidden bg-gradient-to-br from-brand-primary/15 via-brand-primary/5 to-transparent border border-brand-primary/20 rounded-2xl p-6 text-center">
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-primary/40 to-transparent" />
                          <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border border-brand-primary/20 shadow-lg shadow-brand-primary/10">
                            {remoteState === 'remote' ? <Move className="w-8 h-8" /> : <Terminal className="w-8 h-8" />}
                          </div>
                          <h4 className="text-text-primary font-bold text-lg mb-1">
                            {remoteState === 'remote' ? 'Control Activo' : 'Terminal Activa'}
                          </h4>
                          <p className="text-xs text-text-tertiary mb-1 leading-relaxed">
                            {remoteState === 'remote' 
                              ? 'Haz clic, escribe y desplázate directamente.' 
                              : 'Consola SSH conectada al equipo.'}
                          </p>
                          <div className="text-3xl font-mono font-bold text-brand-primary my-4 tracking-wider">
                            {formatTime(sessionTime)}
                          </div>
                          <p className="text-[10px] text-text-tertiary mb-5 flex items-center justify-center gap-1">
                            <Shield className="w-3 h-3" /> Todas las acciones quedan registradas
                          </p>
                          <button 
                            onClick={handleEndSession}
                            className="w-full py-3.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-red-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                          >
                            <Power className="w-4 h-4" /> Finalizar Sesión
                          </button>
                        </div>

                        {remoteState === 'remote' && (
                          <button 
                            onClick={handleCtrlAltDel}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-glass-border bg-bg-base/30 hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-all text-left sm:hidden"
                          >
                            <Keyboard className="w-5 h-5 text-brand-primary" />
                            <span className="text-sm font-bold text-text-primary">Ctrl+Alt+Supr</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Action Buttons */}
                        {[
                          { icon: MousePointer2, label: 'Control Remoto', desc: 'Clic, teclado y scroll en tiempo real', action: () => handleStartSession('remote') },
                          { icon: Terminal, label: 'Terminal SSH', desc: 'Acceso a consola del sistema', action: () => handleStartSession('terminal') },
                          { icon: Mic, label: 'Escucha Activa', desc: 'Activar micrófono remoto', action: () => {} },
                        ].map((item, i) => (
                          <button 
                            key={i}
                            onClick={item.action}
                            className={`flex items-center gap-4 p-4 rounded-2xl border border-glass-border bg-bg-base/20 hover:border-brand-primary/30 hover:bg-brand-primary/5 transition-all duration-300 group text-left hover:translate-y-[-1px] active:scale-[0.98] animate-float-up stagger-${i + 1}`}
                          >
                            <div className="w-12 h-12 rounded-xl bg-bg-highlight/50 flex items-center justify-center group-hover:bg-gradient-to-br group-hover:from-brand-primary group-hover:to-brand-secondary group-hover:shadow-lg group-hover:shadow-brand-primary/20 transition-all duration-300">
                              <item.icon className="w-5 h-5 text-text-secondary group-hover:text-white transition-colors duration-300" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-text-primary mb-0.5 tracking-tight">{item.label}</div>
                              <div className="text-[11px] text-text-tertiary leading-tight">{item.desc}</div>
                            </div>
                          </button>
                        ))}

                        <div className="h-px bg-gradient-to-r from-transparent via-glass-border to-transparent my-2" />

                        {/* Power Controls */}
                        <div className="grid grid-cols-2 gap-3">
                          <button 
                            onClick={handlePowerOff}
                            className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-red-500/10 bg-red-500/5 hover:border-red-500/30 hover:bg-red-500/10 transition-all duration-300 group active:scale-[0.96]"
                          >
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                              <Power className="w-5 h-5 text-red-400 group-hover:text-red-300" />
                            </div>
                            <span className="text-[11px] font-bold text-red-400">Apagar</span>
                          </button>
                          <button 
                            onClick={handleRestart}
                            className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-amber-500/10 bg-amber-500/5 hover:border-amber-500/30 hover:bg-amber-500/10 transition-all duration-300 group active:scale-[0.96]"
                          >
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                              <RotateCcw className="w-5 h-5 text-amber-400 group-hover:text-amber-300 group-hover:animate-spin" />
                            </div>
                            <span className="text-[11px] font-bold text-amber-400">Reiniciar</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === 'historial' && (
                  <div className="relative pl-4 border-l border-glass-border ml-2 space-y-5 pb-4">
                    {globalReports.filter(r => r.device === selectedDevice.id).length === 0 && (
                      <div className="text-sm text-text-tertiary italic py-6 text-center">Sin actividad registrada aún.</div>
                    )}
                    {globalReports.filter(r => r.device === selectedDevice.id).map((log) => (
                      <div key={log.id} className="relative animate-float-up">
                        <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 border-bg-surface ${
                          log.type === 'Alerta' ? 'bg-red-500 glow-red' : log.type === 'Sistema' ? 'bg-emerald-500 glow-green' : 'bg-brand-primary glow-brand'
                        }`} />
                        <div className="text-[10px] font-mono text-text-tertiary mb-1">{log.date}</div>
                        <div className="text-sm text-text-primary font-medium leading-relaxed">{log.description}</div>
                      </div>
                    ))}
                    <div className="relative">
                      <div className="absolute -left-[21px] w-3 h-3 rounded-full border-2 border-bg-surface bg-bg-elevated" />
                      <div className="text-[10px] font-mono text-text-tertiary mb-1">—</div>
                      <div className="text-xs text-text-tertiary italic">Fin del historial</div>
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
