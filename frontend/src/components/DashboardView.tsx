import { Building2, Monitor, AlertTriangle, Activity, Terminal } from 'lucide-react';
import { MetricCard } from './ui/MetricCard';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

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
}

export function DashboardView({ devices, onNavigate }: DashboardViewProps) {
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const alertCount = devices.filter(d => d.cpu && d.cpu > 80).length;
  const activeAppsCount = new Set(devices.filter(d => d.status === 'online' && d.activeApp).map(d => d.activeApp)).size;

  const stats = [
    { label: 'Sedes activas', value: '1', icon: Building2, highlightColor: 'brand' as const, trend: { value: 'Estable', isPositive: true } },
    { label: 'Equipos online', value: onlineCount.toString(), icon: Monitor, highlightColor: 'success' as const, trend: { value: 'En vivo', isPositive: true } },
    { label: 'Alertas críticas', value: alertCount.toString(), icon: AlertTriangle, highlightColor: alertCount > 0 ? 'error' as const : 'success' as const, trend: { value: alertCount > 0 ? 'Atención' : 'Todo OK', isPositive: alertCount === 0 } },
    { label: 'Apps monitoreadas', value: activeAppsCount.toString(), icon: Terminal, highlightColor: 'brand' as const },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-slide-up relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Operations Overview</h3>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary mb-2 tracking-tight">Centro de control</h1>
          <p className="text-text-secondary text-sm lg:text-base max-w-xl">
            Estado consolidado de endpoints, sedes y telemetría crítica del sistema VisionControl.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => onNavigate('reportes')}>
            Ver Reportes
          </Button>
          <Button variant="primary" onClick={() => onNavigate('monitoreo')} className="gap-2 shadow-brand/20">
            <Activity className="w-4 h-4" />
            Ir al War Room
          </Button>
        </div>
      </div>

      {/* ─── Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {stats.map((stat, idx) => (
          <MetricCard
            key={idx}
            title={stat.label}
            value={stat.value}
            icon={stat.icon}
            trend={stat.trend}
            highlightColor={stat.highlightColor}
          />
        ))}
      </div>

      {/* ─── Main Chart / Map Area ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="lg:col-span-2 p-6 relative group">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none mix-blend-overlay" />
          
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-1 tracking-tight">Telemetría de Red (24h)</h2>
              <p className="text-[13px] text-text-secondary">Actividad consolidada de endpoints y uso de banda ancha</p>
            </div>
            <div className="flex items-center gap-2 bg-brand/10 border border-brand/20 px-3 py-1 rounded-full shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
              <span className="text-[10px] font-bold text-brand tracking-wider uppercase">Live Sync</span>
            </div>
          </div>
          
          <div className="h-64 relative border-l border-b border-surface-border ml-8 flex items-end">
            {/* Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none">
              {[...Array(4)].map((_, i) => <div key={i} className="w-full h-px bg-white" />)}
            </div>
            
            {/* Holographic Chart Area */}
            <svg className="w-full h-full absolute bottom-0 left-0" preserveAspectRatio="none" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d="M0,100 L0,50 Q25,30 50,60 T100,20 L100,100 Z" fill="url(#chartGlow)" />
              <path d="M0,50 Q25,30 50,60 T100,20" fill="none" stroke="var(--color-brand-primary)" strokeWidth="0.8" className="drop-shadow-[0_0_8px_rgba(255,107,53,0.5)]" />
              
              <circle cx="50" cy="60" r="1.5" fill="white" className="drop-shadow-[0_0_4px_white]" />
              <circle cx="100" cy="20" r="1.5" fill="white" className="drop-shadow-[0_0_4px_white]" />
            </svg>
            
            {/* Y Axis */}
            <div className="absolute -left-10 bottom-0 text-[10px] text-text-tertiary font-mono">0 GB</div>
            <div className="absolute -left-12 bottom-1/2 text-[10px] text-text-tertiary font-mono translate-y-1/2">50 GB</div>
            <div className="absolute -left-12 top-0 text-[10px] text-text-tertiary font-mono">100 GB</div>
            
            {/* X Axis */}
            <div className="absolute bottom-[-24px] left-0 text-[10px] text-text-tertiary font-mono">00:00</div>
            <div className="absolute bottom-[-24px] left-1/2 text-[10px] text-text-tertiary font-mono -translate-x-1/2">12:00</div>
            <div className="absolute bottom-[-24px] right-0 text-[10px] text-text-tertiary font-mono">24:00</div>
          </div>
        </Card>

        {/* Top Apps List */}
        <Card className="p-6 relative">
          <div className="absolute top-0 right-0 w-full h-32 bg-gradient-to-b from-brand/5 to-transparent pointer-events-none" />
          <h2 className="text-lg font-bold text-text-primary mb-1 relative z-10 tracking-tight">Apps Activas</h2>
          <p className="text-[13px] text-text-secondary mb-5 relative z-10">Programas detectados en tiempo real</p>
          
          <div className="flex flex-col gap-2 relative z-10">
            {devices.filter(d => d.status === 'online' && d.activeApp).length > 0 ? (
              devices.filter(d => d.status === 'online' && d.activeApp).slice(0, 5).map((dev, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated/50 hover:bg-surface-elevated border border-surface-border transition-colors">
                  <div className="w-8 h-8 rounded-md bg-brand/10 flex items-center justify-center text-brand shrink-0">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-text-primary truncate">{dev.activeApp}</p>
                    <p className="text-[11px] text-text-tertiary truncate flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-success" />
                      {dev.name}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-surface-border rounded-lg bg-surface-elevated/30">
                <Terminal className="w-6 h-6 text-text-tertiary mb-2" />
                <p className="text-[13px] font-medium text-text-secondary">Sin datos</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">Esperando métricas...</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
