import { useState, useEffect } from 'react';
import { Filter, Search, Monitor, Cpu, HardDrive, Terminal, Clock, Activity, ShieldAlert, X } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { api } from '../services/api';

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

interface DispositivosViewProps {
  devices: Device[];
  onNavigate: (view: string) => void;
}

export function DispositivosView({ devices, onNavigate }: DispositivosViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceActivities, setDeviceActivities] = useState<any[]>([]);
  const [deviceIncidents, setDeviceIncidents] = useState<any[]>([]);

  useEffect(() => {
    if (selectedDevice) {
      // Fetch details
      api.get(`/devices/${selectedDevice.id}/activity`).then((res: { data: any[] }) => setDeviceActivities(res.data)).catch(console.error);
      api.get(`/devices/${selectedDevice.id}/incidents`).then((res: { data: any[] }) => setDeviceIncidents(res.data)).catch(console.error);
    }
  }, [selectedDevice]);

  const filteredDevices = devices.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-slide-up relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Endpoints</h3>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary mb-2 tracking-tight">Dispositivos supervisados</h1>
          <p className="text-text-secondary text-sm lg:text-base max-w-xl">
            Inventario completo de laptops corporativas conectadas al sistema y su telemetría actual.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary group-focus-within:text-brand transition-colors duration-300" />
            <input 
              type="text" 
              placeholder="Buscar dispositivo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-surface-elevated/50 border border-surface-border rounded-lg pl-10 pr-4 py-2 text-[13px] text-text-primary placeholder-text-tertiary w-full sm:w-64 focus:border-brand/50 focus:bg-surface-elevated outline-none transition-all duration-300 focus:ring-1 focus:ring-brand/40" 
            />
          </div>
          <Button variant="secondary" className="gap-2">
            <Filter className="w-4 h-4" /> Filtros
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredDevices.map((dev) => {
          const isOffline = dev.status === 'offline';
          const isAlert = dev.cpu && dev.cpu > 80;

          return (
            <Card 
              key={dev.id} 
              hoverable
              className={`p-5 flex flex-col relative overflow-hidden group ${
                isOffline ? 'opacity-70 grayscale-[50%]' : 
                isAlert ? 'border-status-error/30 hover:border-status-error/50 hover:shadow-[0_8px_30px_rgba(239,68,68,0.1)]' :
                'hover:border-brand/40 hover:shadow-[0_8px_30px_rgba(255,107,53,0.1)]'
              }`}
            >
              {!isOffline && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full blur-[50px] pointer-events-none group-hover:bg-brand/10 transition-colors duration-500" />
              )}
              
              <div className="flex justify-between items-center mb-5 relative z-10">
                <div className="flex gap-1.5 opacity-60">
                  <div className="w-2.5 h-2.5 rounded-full bg-status-error/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-status-warning/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-status-success/50" />
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedDevice(dev)}
                    className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors"
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                  <Badge variant={isOffline ? 'neutral' : isAlert ? 'error' : 'success'}>
                    {!isOffline && <div className={`w-1.5 h-1.5 rounded-full mr-1.5 bg-current ${isAlert ? 'animate-pulse' : ''}`} />}
                    {isOffline ? 'Offline' : isAlert ? 'Alerta' : 'En línea'}
                  </Badge>
                </div>
              </div>
              
              <div className="flex justify-between items-start mb-1 relative z-10">
                <h4 className="text-text-primary font-bold tracking-tight flex items-center gap-2 truncate pr-2 text-[15px]">
                  <Monitor className={`w-4 h-4 shrink-0 ${isOffline ? 'text-text-tertiary' : 'text-text-primary'}`} /> 
                  {dev.name.toUpperCase()}
                </h4>
              </div>
              <p className="text-[11px] text-text-tertiary mb-5 truncate font-mono relative z-10">{dev.os} • {dev.id.substring(0, 8)}</p>
              
              {!isOffline && dev.activeApp ? (
                <div className="mb-5 flex items-center gap-2 bg-surface-elevated/50 border border-surface-border rounded-lg p-2.5 relative z-10">
                  <Terminal className="w-4 h-4 text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-wider mb-0.5">App Activa</p>
                    <p className="text-[12px] text-text-primary truncate font-medium">{dev.activeApp}</p>
                  </div>
                </div>
              ) : (
                <div className="mb-5 h-[52px]" />
              )}
              
              <div className="mt-auto relative z-10">
                <div className="flex items-center gap-4 text-xs font-mono mb-5 bg-surface-elevated/30 p-2.5 rounded-lg border border-surface-border">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-text-tertiary flex items-center gap-1.5 uppercase text-[9px] font-bold tracking-wider"><Cpu className="w-3 h-3"/> CPU</span>
                    <span className={`text-[13px] ${isAlert ? 'text-status-error font-bold' : 'text-text-primary'}`}>{dev.cpu || 0}%</span>
                  </div>
                  <div className="w-px h-6 bg-surface-border" />
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-text-tertiary flex items-center gap-1.5 uppercase text-[9px] font-bold tracking-wider"><HardDrive className="w-3 h-3"/> RAM</span>
                    <span className="text-[13px] text-text-primary">{dev.ram || 0}%</span>
                  </div>
                </div>

                <Button 
                  variant={isOffline ? 'secondary' : 'primary'}
                  onClick={() => !isOffline && onNavigate('monitoreo')}
                  disabled={isOffline}
                  className="w-full gap-2"
                >
                  {isOffline ? <Clock className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                  {isOffline ? 'Desconectado' : 'Ver en vivo'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-surface-base h-full border-l border-surface-border flex flex-col animate-slide-up sm:animate-in sm:slide-in-from-right-full">
            <div className="p-5 border-b border-surface-border flex justify-between items-center bg-surface-elevated/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand/10 border border-brand/20 rounded-xl">
                  <Monitor className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <h3 className="font-bold text-text-primary text-lg">{selectedDevice.name}</h3>
                  <span className="text-[11px] text-text-tertiary font-mono uppercase">{selectedDevice.os || 'Windows'} • {selectedDevice.id.slice(0, 8)}</span>
                </div>
              </div>
              <button onClick={() => setSelectedDevice(null)} className="p-2 text-text-tertiary hover:text-text-primary hover:bg-surface-highlight rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-surface-elevated/30 border border-surface-border rounded-xl">
                   <p className="text-[10px] text-text-tertiary font-bold uppercase mb-1 flex items-center gap-1.5"><Cpu className="w-3 h-3"/> CPU</p>
                   <p className="text-xl font-bold text-text-primary">{selectedDevice.cpu || 0}%</p>
                 </div>
                 <div className="p-4 bg-surface-elevated/30 border border-surface-border rounded-xl">
                   <p className="text-[10px] text-text-tertiary font-bold uppercase mb-1 flex items-center gap-1.5"><HardDrive className="w-3 h-3"/> RAM</p>
                   <p className="text-xl font-bold text-text-primary">{selectedDevice.ram || 0}%</p>
                 </div>
              </div>

              {/* Incidents */}
              <div>
                <h4 className="text-[13px] font-bold text-text-primary mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 text-status-error" /> Incidencias Recientes
                </h4>
                {deviceIncidents.length === 0 ? (
                  <p className="text-[13px] text-text-tertiary italic p-4 bg-surface-base border border-surface-border rounded-xl text-center">No hay incidencias registradas</p>
                ) : (
                  <div className="space-y-3">
                    {deviceIncidents.map(inc => (
                      <div key={inc.id} className="p-3 bg-status-error/5 border border-status-error/20 rounded-xl flex items-start gap-3">
                        <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-status-error animate-pulse" />
                        <div>
                          <p className="text-[13px] font-medium text-text-primary">{inc.description}</p>
                          <p className="text-[11px] text-text-tertiary mt-1">{new Date(inc.date).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Log */}
              <div>
                <h4 className="text-[13px] font-bold text-text-primary mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <Activity className="w-4 h-4 text-brand" /> Actividad
                </h4>
                {deviceActivities.length === 0 ? (
                  <p className="text-[13px] text-text-tertiary italic p-4 bg-surface-base border border-surface-border rounded-xl text-center">No hay actividad reciente</p>
                ) : (
                  <div className="relative border-l border-surface-border ml-3 space-y-6 pb-4">
                    {deviceActivities.map(act => (
                      <div key={act.id} className="relative pl-6">
                        <div className="absolute -left-1.5 top-1.5 w-3 h-3 bg-brand/20 border border-brand rounded-full" />
                        <p className="text-[13px] text-text-secondary">{act.description}</p>
                        <p className="text-[10px] text-text-tertiary mt-1 font-mono">{new Date(act.date).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            <div className="p-4 border-t border-surface-border bg-surface-base">
               <Button 
                 variant={selectedDevice.status === 'offline' ? 'secondary' : 'primary'}
                 onClick={() => selectedDevice.status !== 'offline' && onNavigate('monitoreo')}
                 disabled={selectedDevice.status === 'offline'}
                 className="w-full gap-2"
               >
                 <Monitor className="w-4 h-4" />
                 {selectedDevice.status === 'offline' ? 'Equipo Desconectado' : 'Conectar al War Room'}
               </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
