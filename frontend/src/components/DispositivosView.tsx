import { useState, useMemo } from 'react';
import { MonitorSmartphone, Search, X, Cpu, MemoryStick, AppWindow, Wifi, WifiOff, Terminal } from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [osFilter, setOsFilter] = useState('Todos');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);


  const osOptions = useMemo(() => {
    const set = new Set(devices.map(d => d.os));
    return ['Todos', ...Array.from(set)];
  }, [devices]);

  const filtered = useMemo(() => {
    return devices.filter(d => {
      const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.os.toLowerCase().includes(search.toLowerCase()) || d.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'Todos' || (statusFilter === 'Online' && d.status === 'online') || (statusFilter === 'Offline' && d.status === 'offline');
      const matchesOs = osFilter === 'Todos' || d.os === osFilter;
      return matchesSearch && matchesStatus && matchesOs;
    });
  }, [devices, search, statusFilter, osFilter]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto animate-slide-up">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 stagger-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Dispositivos</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1">{devices.length} equipos registrados en la plataforma</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 stagger-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, OS o ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated/50 border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 focus:bg-surface-elevated transition-all"
          />
        </div>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 md:w-36 bg-surface-elevated/50 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all appearance-none"
          >
            <option>Todos</option>
            <option>Online</option>
            <option>Offline</option>
          </select>
          <select
            value={osFilter}
            onChange={e => setOsFilter(e.target.value)}
            className="flex-1 md:w-40 bg-surface-elevated/50 border border-surface-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all appearance-none"
          >
            {osOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border stagger-3">
          <MonitorSmartphone className="w-12 h-12 mx-auto mb-4 text-text-tertiary opacity-50" />
          <p className="text-base font-semibold text-text-primary mb-1">Sin resultados</p>
          <p className="text-sm text-text-tertiary">Prueba ajustando los filtros de búsqueda</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 stagger-3">
          {filtered.map(device => (
            <button
              key={device.id}
              onClick={() => setSelectedDevice(device)}
              className={`text-left rounded-2xl p-5 transition-all duration-300 hover-card group ${
                device.status === 'online'
                  ? 'glass-subtle border border-surface-border hover:border-brand/40 glow-brand'
                  : 'bg-surface-elevated/30 border border-surface-border opacity-70 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${device.status === 'online' ? 'bg-brand/10' : 'bg-surface-elevated border border-surface-border'}`}>
                    <MonitorSmartphone className={`w-5 h-5 ${device.status === 'online' ? 'text-brand' : 'text-text-tertiary'}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary truncate">{device.name}</h3>
                    <p className="text-xs text-text-tertiary font-mono mt-0.5">{device.os}</p>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                  device.status === 'online' ? 'bg-status-success/20 text-status-success shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-surface-elevated text-text-tertiary'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-status-success animate-pulse' : 'bg-status-error'}`} />
                  {device.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] font-medium text-text-secondary mb-1">
                    <span>CPU</span><span>{device.cpu ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-base rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${(device.cpu ?? 0) > 80 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${device.cpu ?? 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-medium text-text-secondary mb-1">
                    <span>RAM</span><span>{device.ram ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-base rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${(device.ram ?? 0) > 80 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${device.ram ?? 0}%` }} />
                  </div>
                </div>
              </div>
              {device.activeApp && device.status === 'online' && (
                <div className="mt-4 flex items-center gap-1.5 text-[10px] text-text-tertiary bg-surface-base/50 px-2.5 py-1.5 rounded-md border border-surface-border">
                  <Terminal className="w-3 h-3 text-brand" />
                  <span className="truncate">{device.activeApp}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail Panel */}
      {selectedDevice && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setSelectedDevice(null)} />
          <div className="relative w-full max-w-md bg-surface-base border-l border-surface-border h-full flex flex-col shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between p-6 border-b border-surface-border/50">
              <h2 className="text-xl font-bold text-text-primary tracking-tight">{selectedDevice.name}</h2>
              <button onClick={() => setSelectedDevice(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex items-center gap-2">
                {selectedDevice.status === 'online' ? <Wifi className="w-5 h-5 text-status-success" /> : <WifiOff className="w-5 h-5 text-status-error" />}
                <span className={`text-base font-semibold ${selectedDevice.status === 'online' ? 'text-status-success' : 'text-status-error'}`}>
                  {selectedDevice.status === 'online' ? 'Dispositivo Online' : 'Dispositivo Offline'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-elevated/50 border border-surface-border rounded-xl p-4">
                  <p className="text-[11px] text-text-tertiary mb-1 uppercase tracking-wider font-semibold">Sistema</p>
                  <p className="text-sm text-text-primary font-medium">{selectedDevice.os}</p>
                </div>
                <div className="bg-surface-elevated/50 border border-surface-border rounded-xl p-4">
                  <p className="text-[11px] text-text-tertiary mb-1 uppercase tracking-wider font-semibold">ID único</p>
                  <p className="text-sm text-text-primary font-mono truncate">{selectedDevice.id}</p>
                </div>
              </div>

              <div className="bg-surface-elevated/30 border border-surface-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-secondary flex items-center gap-2"><Cpu className="w-4 h-4 text-brand" />CPU Usado</span>
                  <span className="text-lg font-black text-text-primary">{selectedDevice.cpu ?? 0}%</span>
                </div>
                <div className="w-full bg-surface-base rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all duration-500 ${(selectedDevice.cpu ?? 0) > 80 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${selectedDevice.cpu ?? 0}%` }} />
                </div>
                
                <div className="pt-2" />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-secondary flex items-center gap-2"><MemoryStick className="w-4 h-4 text-brand" />RAM Usada</span>
                  <span className="text-lg font-black text-text-primary">{selectedDevice.ram ?? 0}%</span>
                </div>
                <div className="w-full bg-surface-base rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all duration-500 ${(selectedDevice.ram ?? 0) > 80 ? 'bg-status-error' : 'bg-brand'}`} style={{ width: `${selectedDevice.ram ?? 0}%` }} />
                </div>

                {selectedDevice.activeApp && (
                  <>
                    <div className="pt-2 border-t border-surface-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-secondary flex items-center gap-2"><AppWindow className="w-4 h-4 text-brand" />App Actual</span>
                      <span className="text-sm font-semibold text-text-primary truncate max-w-[150px]">{selectedDevice.activeApp}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-surface-border/50 bg-surface-base space-y-3">
              <button
                onClick={() => { setSelectedDevice(null); onNavigate('monitoreo'); }}
                className="w-full py-3 bg-brand text-white rounded-xl text-sm font-bold shadow-[0_4px_14px_0_rgba(255,107,53,0.39)] hover:shadow-[0_6px_20px_rgba(255,107,53,0.23)] hover:-translate-y-0.5 transition-all"
              >
                Control Remoto Completo
              </button>
              <button
                onClick={() => { setSelectedDevice(null); onNavigate('monitoreo'); }}
                className="w-full py-3 bg-transparent border border-surface-border text-text-primary rounded-xl text-sm font-semibold hover:bg-surface-elevated transition-colors"
              >
                Ver en War Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
