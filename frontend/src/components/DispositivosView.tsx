// DispositivosView
import { Filter, Search, Monitor, Cpu, HardDrive } from 'lucide-react';

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

export function DispositivosView({ devices }: { devices: Device[] }) {
  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3 className="text-brand-primary text-xs font-bold tracking-[0.2em] uppercase mb-2">Endpoints</h3>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Dispositivos supervisados</h1>
          <p className="text-text-secondary text-base max-w-xl">
            Inventario completo de laptops corporativas conectadas al sistema.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input type="text" placeholder="Buscar dispositivo..." className="bg-bg-surface border border-bg-elevated rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-text-secondary w-64 focus:border-brand-primary/50 outline-none" />
          </div>
          <button className="flex items-center gap-2 bg-bg-surface border border-bg-elevated hover:bg-bg-highlight px-4 py-2 rounded-full text-sm font-medium transition-colors text-white">
            <Filter className="w-4 h-4" /> Filtros
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {devices.map((dev) => {
          const isOffline = dev.status === 'offline';
          const isAlert = dev.cpu && dev.cpu > 80;

          return (
          <div key={dev.id} className="bg-bg-surface border border-bg-elevated rounded-xl p-5 hover:border-bg-highlight transition-colors flex flex-col group">
            <div className="flex justify-between mb-6">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </div>
              <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border flex items-center gap-1.5 ${
                isOffline ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                isAlert ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                'bg-green-500/10 text-green-500 border-green-500/20'
              }`}>
                {!isOffline && <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                {dev.status.toUpperCase()}
              </div>
            </div>
            
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-white font-bold tracking-tight flex items-center gap-2 truncate pr-2">
                <Monitor className={`w-4 h-4 shrink-0 ${isOffline ? 'text-text-tertiary' : 'text-brand-primary'}`} /> 
                {dev.name.toUpperCase()}
              </h4>
              <span className="text-xs font-mono text-text-tertiary shrink-0">{dev.id.substring(0, 6)}</span>
            </div>
            <p className="text-sm text-text-secondary mb-4 truncate">{dev.os}</p>
            
            <div className="flex items-center gap-4 text-xs font-mono mb-6 bg-bg-base p-3 rounded-lg border border-bg-elevated">
              <div className="flex-1 flex items-center justify-between">
                <span className="text-text-secondary flex items-center gap-1"><Cpu className="w-3 h-3"/> CPU</span>
                <span className="text-white">{dev.cpu || 0}%</span>
              </div>
              <div className="w-px h-4 bg-bg-elevated" />
              <div className="flex-1 flex items-center justify-between">
                <span className="text-text-secondary flex items-center gap-1"><HardDrive className="w-3 h-3"/> RAM</span>
                <span className="text-white">{dev.ram || 0}%</span>
              </div>
            </div>

            <button className={`w-full py-2 rounded-lg text-sm font-bold transition-colors border ${
              isOffline 
                ? 'bg-bg-elevated text-text-tertiary border-transparent cursor-not-allowed' 
                : 'bg-bg-base border-brand-primary/30 text-brand-secondary hover:bg-brand-primary hover:text-white'
            }`}>
              Ver en vivo
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
