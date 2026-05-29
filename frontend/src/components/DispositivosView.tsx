import { useState, useMemo } from 'react';
import { MonitorSmartphone, Search, X, Cpu, MemoryStick, AppWindow, Wifi, WifiOff } from 'lucide-react';

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dispositivos</h1>
          <p className="text-sm text-text-secondary mt-1">{devices.length} registrados</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, OS o ID..."
            className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
        >
          <option>Todos</option>
          <option>Online</option>
          <option>Offline</option>
        </select>
        <select
          value={osFilter}
          onChange={e => setOsFilter(e.target.value)}
          className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
        >
          {osOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary">
          <MonitorSmartphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin dispositivos encontrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(device => (
            <button
              key={device.id}
              onClick={() => setSelectedDevice(device)}
              className="bg-surface-elevated border border-surface-border rounded-xl p-4 text-left hover:border-brand/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary truncate">{device.name}</h3>
                <span className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  device.status === 'online' ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-status-success' : 'bg-status-error'}`} />
                  {device.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-xs text-text-tertiary mb-3">{device.os}</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[10px] text-text-tertiary mb-1">
                    <span>CPU</span><span>{device.cpu ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${device.cpu ?? 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-text-tertiary mb-1">
                    <span>RAM</span><span>{device.ram ?? 0}%</span>
                  </div>
                  <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                    <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${device.ram ?? 0}%` }} />
                  </div>
                </div>
              </div>
              {device.activeApp && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-text-tertiary">
                  <AppWindow className="w-3 h-3" />
                  <span className="truncate">{device.activeApp}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail Panel */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedDevice(null)} />
          <div className="relative w-full max-w-md bg-surface-elevated border-l border-surface-border h-full overflow-y-auto p-6 animate-slide-in-right">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-text-primary">{selectedDevice.name}</h2>
              <button onClick={() => setSelectedDevice(null)} className="text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {selectedDevice.status === 'online' ? <Wifi className="w-4 h-4 text-status-success" /> : <WifiOff className="w-4 h-4 text-status-error" />}
                <span className={`text-sm font-medium ${selectedDevice.status === 'online' ? 'text-status-success' : 'text-status-error'}`}>
                  {selectedDevice.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-base rounded-lg p-3">
                  <p className="text-[10px] text-text-tertiary mb-1">Sistema</p>
                  <p className="text-sm text-text-primary font-medium">{selectedDevice.os}</p>
                </div>
                <div className="bg-bg-base rounded-lg p-3">
                  <p className="text-[10px] text-text-tertiary mb-1">ID</p>
                  <p className="text-sm text-text-primary font-mono truncate">{selectedDevice.id}</p>
                </div>
              </div>

              <div className="bg-bg-base rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary flex items-center gap-1.5"><Cpu className="w-3 h-3" />CPU</span>
                  <span className="text-sm font-bold text-text-primary">{selectedDevice.cpu ?? 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary flex items-center gap-1.5"><MemoryStick className="w-3 h-3" />RAM</span>
                  <span className="text-sm font-bold text-text-primary">{selectedDevice.ram ?? 0}%</span>
                </div>
                {selectedDevice.activeApp && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary flex items-center gap-1.5"><AppWindow className="w-3 h-3" />App</span>
                    <span className="text-sm text-text-primary truncate max-w-[160px]">{selectedDevice.activeApp}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setSelectedDevice(null); onNavigate('monitoreo'); }}
                  className="flex-1 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Control Remoto
                </button>
                <button
                  onClick={() => { setSelectedDevice(null); onNavigate('monitoreo'); }}
                  className="flex-1 py-2.5 bg-bg-base border border-surface-border text-text-primary rounded-lg text-sm font-medium hover:bg-surface-elevated transition-colors"
                >
                  Ver en Monitoreo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
