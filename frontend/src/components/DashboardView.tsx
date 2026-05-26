import React from 'react';
import { Building2, Monitor, AlertTriangle, Users, TrendingUp, TrendingDown } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
  cpu?: number;
  ram?: number;
}

export function DashboardView({ devices }: { devices: Device[] }) {
  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const alertCount = devices.filter(d => d.cpu && d.cpu > 80).length;

  const stats = [
    { label: 'Sedes activas', value: '1', icon: Building2, trend: '+1', trendUp: true },
    { label: 'Dispositivos online', value: onlineCount.toString(), icon: Monitor, trend: '+1', trendUp: true },
    { label: 'Dispositivos offline', value: offlineCount.toString(), icon: Monitor, trend: '0', trendUp: false, alert: offlineCount > 0 },
    { label: 'Alertas activas', value: alertCount.toString(), icon: AlertTriangle, trend: alertCount > 0 ? '+1' : '0', trendUp: alertCount > 0, warning: alertCount > 0 },
    { label: 'Usuarios activos', value: onlineCount.toString(), icon: Users, trend: '+1', trendUp: true },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3 className="text-brand-primary text-xs font-bold tracking-[0.2em] uppercase mb-2">Operations Overview</h3>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Centro de control en tiempo real</h1>
          <p className="text-text-secondary text-base max-w-xl">
            Estado consolidado de endpoints, sedes y eventos críticos del sistema SentinelDesk.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="bg-bg-surface border border-bg-elevated hover:bg-bg-highlight px-6 py-2.5 rounded-full text-sm font-medium transition-colors text-white">
            Últimas 24h
          </button>
          <button className="bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-brand-secondary hover:to-brand-primary px-6 py-2.5 rounded-full text-sm font-bold transition-all text-white shadow-lg shadow-brand-primary/20">
            Generar reporte
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-bg-surface border border-bg-elevated rounded-2xl p-6 hover:border-bg-highlight transition-colors flex flex-col justify-between h-40 relative overflow-hidden group">
              <div className="flex justify-between items-start">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  stat.alert ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                  stat.warning ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                  'bg-bg-highlight text-brand-primary border-bg-elevated'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium ${
                  stat.alert ? 'text-text-secondary' : 'text-green-500'
                }`}>
                  {stat.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {stat.trend}
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold text-white mb-1 tracking-tight">{stat.value}</div>
                <div className="text-sm text-text-secondary font-medium">{stat.label}</div>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-bl-full pointer-events-none" />
            </div>
          );
        })}
      </div>

      <div className="bg-bg-surface border border-bg-elevated rounded-2xl p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Dispositivos conectados — 24h</h2>
            <p className="text-sm text-text-secondary">Telemetría en tiempo real por sede consolidada</p>
          </div>
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-500">En vivo</span>
          </div>
        </div>
        
        {/* Mock Chart Area */}
        <div className="h-64 relative border-l border-b border-bg-elevated ml-8 flex items-end">
          <svg className="w-full h-full absolute bottom-0 left-0" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M0,100 L0,50 Q25,30 50,50 T100,40 L100,100 Z" fill="rgba(255, 90, 40, 0.1)" />
            <path d="M0,50 Q25,30 50,50 T100,40" fill="none" stroke="var(--color-brand-primary)" strokeWidth="0.5" />
          </svg>
          <div className="absolute -left-8 bottom-0 text-xs text-text-tertiary">0</div>
          <div className="absolute -left-10 bottom-1/2 text-xs text-text-tertiary">600</div>
          <div className="absolute -left-12 top-0 text-xs text-text-tertiary">1200</div>
        </div>
      </div>
    </div>
  );
}
