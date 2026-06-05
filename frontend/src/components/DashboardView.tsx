import { useState, useEffect, useRef } from 'react';
import { Cpu, MemoryStick, AlertTriangle, Monitor, Activity, TrendingUp, ShieldCheck, AppWindow, Zap, Clock, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Wifi, WifiOff } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RePieChart, Pie, Cell, BarChart, Bar, CartesianGrid } from 'recharts';
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

interface MetricPoint {
  time: string;
  cpu: number;
  ram: number;
}

const CHART_COLORS = ['#FF6B35', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444'];

export function DashboardView({ devices, onNavigate, socket }: DashboardViewProps) {
  const [liveActivities, setLiveActivities] = useState<ActivityEntry[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<MetricPoint[]>([]);
  const metricsRef = useRef<MetricPoint[]>([]);

  // Listen for real-time activities
  useEffect(() => {
    if (!socket) return;
    const handleActivity = (data: ActivityEntry) => {
      setLiveActivities(prev => [data, ...prev].slice(0, 20));
    };
    socket.on('activity-log', handleActivity);
    return () => { socket.off('activity-log', handleActivity); };
  }, [socket]);

  // Collect metric history every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const onlineDevs = devices.filter(d => d.status === 'online');
      if (onlineDevs.length === 0) return;

      const avgCpu = Math.round(onlineDevs.reduce((s, d) => s + (d.cpu ?? 0), 0) / onlineDevs.length);
      const avgRam = Math.round(onlineDevs.reduce((s, d) => s + (d.ram ?? 0), 0) / onlineDevs.length);
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      const newPoint = { time: timeStr, cpu: avgCpu, ram: avgRam };
      metricsRef.current = [...metricsRef.current.slice(-29), newPoint];
      setMetricsHistory([...metricsRef.current]);
    }, 5000);

    return () => clearInterval(interval);
  }, [devices]);

  const onlineDevices = devices.filter(d => d.status === 'online');
  const offlineDevices = devices.filter(d => d.status === 'offline');
  const avgCpu = onlineDevices.length ? Math.round(onlineDevices.reduce((s, d) => s + (d.cpu ?? 0), 0) / onlineDevices.length) : 0;
  const avgRam = onlineDevices.length ? Math.round(onlineDevices.reduce((s, d) => s + (d.ram ?? 0), 0) / onlineDevices.length) : 0;
  const alertCount = devices.filter(d => (d.cpu ?? 0) > 80 || (d.ram ?? 0) > 85).length;

  // App usage distribution for pie chart
  const appDistribution = (() => {
    const apps: Record<string, number> = {};
    onlineDevices.forEach(d => {
      if (d.activeApp) {
        const appName = d.activeApp.split(' - ')[0].split('.')[0].trim();
        apps[appName] = (apps[appName] || 0) + 1;
      }
    });
    return Object.entries(apps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 15) + '...' : name, value }));
  })();

  // Device health distribution for bar chart
  const healthDistribution = (() => {
    const ranges = [
      { name: '0-25%', cpu: 0, ram: 0 },
      { name: '25-50%', cpu: 0, ram: 0 },
      { name: '50-75%', cpu: 0, ram: 0 },
      { name: '75-100%', cpu: 0, ram: 0 },
    ];
    onlineDevices.forEach(d => {
      const cpuIdx = Math.min(3, Math.floor((d.cpu ?? 0) / 25));
      const ramIdx = Math.min(3, Math.floor((d.ram ?? 0) / 25));
      ranges[cpuIdx].cpu++;
      ranges[ramIdx].ram++;
    });
    return ranges;
  })();

  const timeAgo = (dateStr: string) => {
    const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 5) return 'ahora';
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  };

  const metrics = [
    { label: 'Equipos Online', value: `${onlineDevices.length}`, subValue: `de ${devices.length} total`, icon: Monitor, color: 'text-status-success', bg: 'bg-status-success/10', trend: onlineDevices.length > 0 ? 'up' : 'neutral' },
    { label: 'CPU Promedio', value: `${avgCpu}%`, subValue: 'Cluster completo', icon: Cpu, color: 'text-brand', bg: 'bg-brand/10', trend: avgCpu < 70 ? 'up' : 'down' },
    { label: 'RAM Promedio', value: `${avgRam}%`, subValue: 'Uso de memoria', icon: MemoryStick, color: 'text-blue-400', bg: 'bg-blue-500/10', trend: avgRam < 75 ? 'up' : 'down' },
    { label: 'Alertas Activas', value: `${alertCount}`, subValue: alertCount > 0 ? 'Requieren atencion' : 'Todo estable', icon: AlertTriangle, color: alertCount > 0 ? 'text-status-error' : 'text-status-success', bg: alertCount > 0 ? 'bg-status-error/10' : 'bg-status-success/10', trend: alertCount === 0 ? 'up' : 'down' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 shadow-xl">
          <p className="text-[10px] text-text-tertiary font-mono mb-1">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} className="text-xs font-semibold" style={{ color: entry.color }}>
              {entry.name}: {entry.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 animate-slide-up max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 stagger-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Dashboard</h3>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Centro de Control</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1 flex items-center gap-2">
            <StatusDot status="online" />
            Infraestructura monitoreada en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-surface-elevated/50 border border-surface-border rounded-xl px-3 py-2">
            <Wifi className="w-3.5 h-3.5 text-status-success" />
            <span className="text-xs font-semibold text-text-secondary">{onlineDevices.length} activos</span>
            {offlineDevices.length > 0 && (
              <>
                <span className="text-text-tertiary">|</span>
                <WifiOff className="w-3.5 h-3.5 text-text-tertiary" />
                <span className="text-xs font-semibold text-text-tertiary">{offlineDevices.length} offline</span>
              </>
            )}
          </div>
          <button 
            onClick={() => onNavigate('monitoreo')}
            className="flex items-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 border border-brand/20 hover:border-brand/40"
          >
            <Activity className="w-4 h-4" />
            War Room
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 stagger-2">
        {metrics.map((m) => (
          <div key={m.label} className="glass-subtle rounded-2xl p-4 md:p-5 hover-card border border-surface-border transition-all duration-300 hover:border-brand/20 group">
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.bg} transition-transform duration-300 group-hover:scale-110`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              {m.trend === 'up' ? (
                <div className="flex items-center gap-0.5 bg-status-success/10 text-status-success px-1.5 py-0.5 rounded-md">
                  <ArrowUpRight className="w-3 h-3" />
                  <span className="text-[9px] font-bold">OK</span>
                </div>
              ) : m.trend === 'down' ? (
                <div className="flex items-center gap-0.5 bg-status-error/10 text-status-error px-1.5 py-0.5 rounded-md">
                  <ArrowDownRight className="w-3 h-3" />
                  <span className="text-[9px] font-bold">!</span>
                </div>
              ) : null}
            </div>
            <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{m.value}</p>
            <p className="text-sm font-semibold text-text-secondary mt-1">{m.label}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">{m.subValue}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 stagger-3">
        {/* Real-time CPU/RAM Chart */}
        <div className="lg:col-span-2 glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand" />
              Rendimiento en Tiempo Real
            </h2>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" /> CPU</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> RAM</span>
            </div>
          </div>
          <div className="h-[200px] md:h-[240px]">
            {metricsHistory.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metricsHistory} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#71717A' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#71717A' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cpu" name="CPU" stroke="#FF6B35" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" dot={false} />
                  <Area type="monotone" dataKey="ram" name="RAM" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#ramGradient)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-tertiary">
                <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-xs">Recopilando datos de rendimiento...</p>
                <p className="text-[10px] mt-1 text-text-tertiary/60">La grafica se mostrara en unos segundos</p>
              </div>
            )}
          </div>
        </div>

        {/* App Distribution Pie Chart */}
        <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2 mb-4">
            <PieChart className="w-4 h-4 text-brand" />
            Apps en Uso
          </h2>
          {appDistribution.length > 0 ? (
            <div className="flex flex-col items-center">
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={appDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {appDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }}
                      itemStyle={{ color: '#EDEDED' }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 w-full">
                {appDistribution.map((app, i) => (
                  <div key={app.name} className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-[10px] text-text-secondary truncate">{app.name}</span>
                    <span className="text-[9px] text-text-tertiary ml-auto font-mono">{app.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex flex-col items-center justify-center text-text-tertiary">
              <AppWindow className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">Sin apps activas</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Device Health + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-6 stagger-4">
        {/* Device Health Bar Chart */}
        <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-status-success" />
            Salud del Cluster
          </h2>
          {onlineDevices.length > 0 ? (
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthDistribution} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#71717A' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#71717A' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }}
                    itemStyle={{ color: '#EDEDED' }}
                  />
                  <Bar dataKey="cpu" name="CPU" fill="#FF6B35" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ram" name="RAM" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[180px] flex flex-col items-center justify-center text-text-tertiary">
              <Monitor className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">Sin dispositivos online</p>
            </div>
          )}
        </div>

        {/* Activity Feed - Real-time */}
        <div className="lg:col-span-2 glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand" />
              Actividad en Vivo
            </h2>
            <div className="flex items-center gap-1.5 bg-status-success/10 border border-status-success/20 rounded-full px-2.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
              <span className="text-[9px] text-status-success font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[280px] custom-scrollbar">
            {liveActivities.length > 0 ? (
              liveActivities.map((act, i) => (
                <div key={act.id || i} className="flex gap-3 group animate-fade-in" style={{ animationDelay: `${i * 20}ms` }}>
                  <div className="flex flex-col items-center">
                    <div className={`w-2 h-2 rounded-full mt-2 transition-transform duration-300 group-hover:scale-150 ${i === 0 ? 'bg-brand animate-pulse' : 'bg-brand/50'}`} />
                    {i !== liveActivities.length - 1 && <div className="w-[1px] flex-1 bg-surface-border mt-1" />}
                  </div>
                  <div className="bg-surface-elevated/40 border border-surface-border rounded-lg p-3 flex-1 hover:bg-surface-elevated/70 transition-colors min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-text-primary truncate">{act.description}</p>
                      <span className="text-[8px] font-mono text-text-tertiary shrink-0 bg-surface-base px-1.5 py-0.5 rounded">{timeAgo(act.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-text-secondary">@{act.deviceName?.toLowerCase()}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-semibold">{act.type}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <Clock className="w-8 h-8 text-surface-border mb-2" />
                <p className="text-xs text-text-tertiary">Esperando actividad de los agentes...</p>
                <p className="text-[10px] text-text-tertiary/60 mt-1">Las acciones apareceran aqui en tiempo real</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Device Status Grid */}
      {devices.length > 0 && (
        <div className="glass-subtle rounded-2xl p-5 md:p-6 border border-surface-border stagger-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Monitor className="w-4 h-4 text-brand" />
              Estado de Equipos
            </h2>
            <button onClick={() => onNavigate('dispositivos')} className="text-xs font-semibold text-brand hover:text-brand-light transition-colors">
              Ver todos &rarr;
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {devices.slice(0, 12).map(d => {
              const cpuPercent = d.cpu ?? 0;
              const ramPercent = d.ram ?? 0;
              const isAlert = cpuPercent > 80 || ramPercent > 85;
              
              return (
                <div
                  key={d.id}
                  onClick={() => onNavigate('monitoreo')}
                  className={`relative bg-surface-elevated/50 hover:bg-surface-elevated border rounded-xl p-3 transition-all duration-200 cursor-pointer group ${
                    isAlert ? 'border-status-error/30 hover:border-status-error/50' : 'border-surface-border hover:border-brand/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <StatusDot status={d.status} />
                    <span className="text-[11px] font-semibold text-text-primary truncate">{d.name}</span>
                  </div>
                  {d.status === 'online' ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-text-tertiary">CPU</span>
                        <span className={`font-mono font-bold ${cpuPercent > 80 ? 'text-status-error' : 'text-text-secondary'}`}>{cpuPercent}%</span>
                      </div>
                      <div className="w-full bg-surface-base rounded-full h-1">
                        <div className={`h-1 rounded-full transition-all duration-700 ${cpuPercent > 80 ? 'bg-status-error' : cpuPercent > 60 ? 'bg-status-warning' : 'bg-emerald-500'}`} style={{ width: `${cpuPercent}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="text-text-tertiary">RAM</span>
                        <span className={`font-mono font-bold ${ramPercent > 85 ? 'text-status-error' : 'text-text-secondary'}`}>{ramPercent}%</span>
                      </div>
                      <div className="w-full bg-surface-base rounded-full h-1">
                        <div className={`h-1 rounded-full transition-all duration-700 ${ramPercent > 85 ? 'bg-status-error' : ramPercent > 70 ? 'bg-status-warning' : 'bg-blue-500'}`} style={{ width: `${ramPercent}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-2">
                      <span className="text-[9px] text-text-tertiary font-medium">Desconectado</span>
                    </div>
                  )}
                  {isAlert && (
                    <div className="absolute top-2 right-2">
                      <Zap className="w-3 h-3 text-status-error animate-pulse" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
