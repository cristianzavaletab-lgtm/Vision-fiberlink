import { useState } from 'react';
import { Cpu, MemoryStick, AlertTriangle, Monitor, Activity } from 'lucide-react';

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
  const onlineDevices = devices.filter(d => d.status === 'online');
  const avgCpu = onlineDevices.length ? Math.round(onlineDevices.reduce((s, d) => s + (d.cpu ?? 0), 0) / onlineDevices.length) : 0;
  const avgRam = onlineDevices.length ? Math.round(onlineDevices.reduce((s, d) => s + (d.ram ?? 0), 0) / onlineDevices.length) : 0;
  const alertCount = devices.filter(d => (d.cpu ?? 0) > 80 || (d.ram ?? 0) > 85).length;

  const recentApps = onlineDevices
    .filter(d => d.activeApp)
    .slice(0, 6)
    .map(d => ({ name: d.name, app: d.activeApp! }));

  const metrics = [
    { label: 'Equipos Online', value: `${onlineDevices.length} / ${devices.length}`, icon: Monitor, color: 'text-status-success' },
    { label: 'CPU Promedio', value: `${avgCpu}%`, icon: Cpu, color: 'text-brand' },
    { label: 'RAM Promedio', value: `${avgRam}%`, icon: MemoryStick, color: 'text-brand' },
    { label: 'Alertas', value: `${alertCount}`, icon: AlertTriangle, color: alertCount > 0 ? 'text-status-error' : 'text-text-tertiary' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Centro de Control</h1>
        <p className="text-sm text-text-secondary mt-1">Resumen en tiempo real de la infraestructura</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-surface-elevated border border-surface-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={`w-4 h-4 ${m.color}`} />
              <span className="text-xs text-text-tertiary font-medium">{m.label}</span>
            </div>
            <p className="text-xl font-bold text-text-primary">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Activity + Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand" />
            Actividad Reciente
          </h2>
          {recentApps.length === 0 ? (
            <p className="text-xs text-text-tertiary">Sin actividad reciente</p>
          ) : (
            <div className="space-y-3">
              {recentApps.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text-primary font-medium">{item.app}</p>
                    <p className="text-xs text-text-tertiary">{item.name}</p>
                  </div>
                  <span className="text-[10px] text-text-tertiary bg-bg-base px-2 py-0.5 rounded">Ahora</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Devices Strip */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-brand" />
            Dispositivos
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {devices.map(d => (
              <button
                key={d.id}
                onClick={() => onNavigate('monitoreo')}
                className="shrink-0 bg-bg-base border border-surface-border rounded-lg p-3 min-w-[140px] hover:border-brand/50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${d.status === 'online' ? 'bg-status-success' : 'bg-status-error'}`} />
                  <span className="text-xs font-medium text-text-primary truncate">{d.name}</span>
                </div>
                <div className="flex gap-3 text-[10px] text-text-tertiary">
                  <span>CPU {d.cpu ?? 0}%</span>
                  <span>RAM {d.ram ?? 0}%</span>
                </div>
              </button>
            ))}
            {devices.length === 0 && (
              <p className="text-xs text-text-tertiary">Sin dispositivos conectados</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
