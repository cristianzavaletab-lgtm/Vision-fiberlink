import { useState, useEffect } from 'react';
import { Cpu, MemoryStick, AlertTriangle, Monitor, Activity, TrendingUp, ShieldCheck, AppWindow, Zap, Clock } from 'lucide-react';
import { StatusDot } from './ui/StatusDot';
import type { Socket } from 'socket.io-client';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
  cpu?: number;
  ram?: number;
  activeApp?: string;
}

interface DashboardViewProps {
  devices: Device[];
  onNavigate: (view: string) => void;
  socket?: Socket | null;
}

interface ActivityEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  description: string;
  type: string;
  date: string;
}

export function DashboardView({ devices, onNavigate, socket }: DashboardViewProps) {
  const [liveActivities, setLiveActivities] = useState<ActivityEntry[]>([]);

  // Listen for real-time activities
  useEffect(() => {
    if (!socket) return;
    const handleActivity = (data: ActivityEntry) => {
      setLiveActivities(prev => [data, ...prev].slice(0, 20));
    };
    socket.on('activity-log', handleActivity);
    return () => { socket.off('activity-log', handleActivity); };
  }, [socket]);

  const onlineDevices = devices.filter(d => d.status === 'online');
  const avgCpu = onlineDevices.length ? Math.round(onlineDevices.reduce((s, d) => s + (d.cpu ?? 0), 0) / onlineDevices.length) : 0;
  const avgRam = onlineDevices.length ? Math.round(onlineDevices.reduce((s, d) => s + (d.ram ?? 0), 0) / onlineDevices.length) : 0;
  const alertCount = devices.filter(d => (d.cpu ?? 0) > 80 || (d.ram ?? 0) > 85).length;

  const recentApps = onlineDevices
    .filter(d => d.activeApp)
    .slice(0, 8)
    .map(d => ({ name: d.name, app: d.activeApp!, id: d.id }));

  const timeAgo = (dateStr: string) => {
    const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 5) return 'ahora';
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  };

  const metrics = [
    { label: 'Equipos Online', value: `${onlineDevices.length}`, subValue: `de ${devices.length} total`, icon: Monitor, color: 'text-status-success', bg: 'bg-status-success/10', glow: 'glow-green' },
    { label: 'CPU Promedio', value: `${avgCpu}%`, subValue: 'Uso en tiempo real', icon: Cpu, color: 'text-brand', bg: 'bg-brand/10', glow: 'glow-brand' },
    { label: 'RAM Promedio', value: `${avgRam}%`, subValue: 'Consumo de memoria', icon: MemoryStick, color: 'text-brand', bg: 'bg-brand/10', glow: 'glow-brand' },
    { label: 'Alertas', value: `${alertCount}`, subValue: 'Requieren atencion', icon: AlertTriangle, color: alertCount > 0 ? 'text-status-error' : 'text-text-tertiary', bg: alertCount > 0 ? 'bg-status-error/10' : 'bg-surface-highlight', glow: alertCount > 0 ? 'glow-red' : '' },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 animate-slide-up max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 stagger-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Centro de Control</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1 flex items-center gap-2">
            <StatusDot status="online" />
            Monitoreo en tiempo real activo
          </p>
        </div>
        <button 
          onClick={() => onNavigate('monitoreo')}
          className="self-start md:self-auto flex items-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 border border-brand/20 hover:border-brand/40 glow-brand hover-card"
        >
          <Activity className="w-4 h-4" />
          Ver War Room
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-2">
        {metrics.map((m, i) => (
          <div key={m.label} className={`glass-subtle rounded-2xl p-4 md:p-5 hover-card border border-surface-border transition-all duration-300 hover:border-surface-border/80 group ${m.glow}`}>
            <div className="flex justify-between items-start mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.bg} transition-transform duration-300 group-hover:scale-110`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              {i === 0 && <TrendingUp className="w-4 h-4 text-status-success" />}
            </div>
            <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{m.value}</p>
            <p className="text-sm font-semibold text-text-secondary mt-1">{m.label}</p>
            <p className="text-xs text-text-tertiary mt-1">{m.subValue}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 stagger-3">
        {/* Main Chart / Active Devices Area */}
        <div className="lg:col-span-2 glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border flex flex-col noise-overlay relative overflow-hidden">
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Monitor className="w-5 h-5 text-brand" />
              Dispositivos Conectados
            </h2>
            <button onClick={() => onNavigate('dispositivos')} className="text-xs font-semibold text-brand hover:text-brand-light transition-colors">Ver todos &rarr;</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 relative z-10 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
            {devices.map(d => {
              const cpuPercent = d.cpu ?? 0;
              const ramPercent = d.ram ?? 0;
              const cpuColor = cpuPercent > 80 ? 'bg-status-error' : cpuPercent > 60 ? 'bg-status-warning' : 'bg-emerald-500';
              const ramColor = ramPercent > 85 ? 'bg-status-error' : ramPercent > 70 ? 'bg-status-warning' : 'bg-blue-500';

              return (
                <div
                  key={d.id}
                  onClick={() => onNavigate('monitoreo')}
                  className="bg-surface-elevated/50 hover:bg-surface-elevated border border-surface-border hover:border-brand/30 rounded-xl p-4 transition-all duration-200 cursor-pointer hover-card group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusDot status={d.status} />
                      <span className="text-sm font-semibold text-text-primary truncate max-w-[120px]">{d.name}</span>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-text-tertiary group-hover:text-status-success transition-colors" />
                  </div>

                  {/* Active App */}
                  {d.activeApp && d.status === 'online' && (
                    <div className="flex items-center gap-1.5 mb-3 mt-1">
                      <AppWindow className="w-3 h-3 text-brand shrink-0" />
                      <span className="text-[10px] text-text-secondary truncate">{d.activeApp}</span>
                    </div>
                  )}
                  
                  {/* Progress bars for stats */}
                  <div className="space-y-2 mt-3">
                    <div>
                      <div className="flex justify-between text-[10px] font-medium text-text-secondary mb-1">
                        <span>CPU</span>
                        <span className="font-mono">{cpuPercent}%</span>
                      </div>
                      <div className="w-full bg-surface-base rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-700 ease-out ${cpuColor}`} style={{ width: `${cpuPercent}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-medium text-text-secondary mb-1">
                        <span>RAM</span>
                        <span className="font-mono">{ramPercent}%</span>
                      </div>
                      <div className="w-full bg-surface-base rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all duration-700 ease-out ${ramColor}`} style={{ width: `${ramPercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {devices.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <Monitor className="w-12 h-12 text-surface-border mb-3" />
                <p className="text-sm text-text-secondary">No hay dispositivos conectados en este momento</p>
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed - Real-time */}
        <div className="glass rounded-2xl p-5 md:p-6 border border-surface-border flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Activity className="w-5 h-5 text-brand" />
              Feed en Vivo
            </h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
              <span className="text-[9px] text-text-tertiary font-mono uppercase">Live</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin space-y-3 max-h-[400px]">
            {/* Show socket-based live activities if available, otherwise show static from devices */}
            {liveActivities.length > 0 ? (
              liveActivities.map((act, i) => (
                <div key={act.id || i} className={`flex gap-3 group animate-fade-in-slide`} style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full mt-2 transition-transform duration-300 group-hover:scale-150 ${i === 0 ? 'bg-brand animate-live-pulse' : 'bg-brand/60'}`} />
                    {i !== liveActivities.length - 1 && <div className="w-[1px] flex-1 bg-surface-border mt-1.5" />}
                  </div>
                  <div className="bg-surface-elevated/40 border border-surface-border rounded-lg p-3 flex-1 hover:bg-surface-elevated transition-colors min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <p className="text-xs font-semibold text-text-primary truncate">{act.description}</p>
                      <span className="text-[8px] font-mono text-text-tertiary shrink-0">{timeAgo(act.date)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-text-secondary">@{act.deviceName?.toLowerCase()}</span>
                      {i === 0 && <Zap className="w-2.5 h-2.5 text-brand" />}
                    </div>
                  </div>
                </div>
              ))
            ) : recentApps.length > 0 ? (
              recentApps.map((item, i) => (
                <div key={item.id + i} className="flex gap-3 group">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-brand group-hover:scale-150 transition-transform duration-300 glow-brand mt-2" />
                    {i !== recentApps.length - 1 && <div className="w-[1px] flex-1 bg-surface-border mt-1.5" />}
                  </div>
                  <div className="bg-surface-elevated/40 border border-surface-border rounded-lg p-3 flex-1 hover:bg-surface-elevated transition-colors min-w-0">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <p className="text-xs font-semibold text-text-primary truncate">{item.app}</p>
                      <span className="text-[8px] font-mono font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded border border-brand/20 shrink-0">AHORA</span>
                    </div>
                    <p className="text-[10px] text-text-secondary">@{item.name.toLowerCase()}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <Clock className="w-8 h-8 text-surface-border mb-2" />
                <p className="text-xs text-text-tertiary">Esperando actividad...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
