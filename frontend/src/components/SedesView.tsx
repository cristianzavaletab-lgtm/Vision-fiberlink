import React, { useState } from 'react';
import { Building2, Plus, MapPin, Monitor, ArrowLeft, X, Laptop } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
}

interface Sede {
  id: string;
  name: string;
  location: string;
  devices: Device[];
  status: 'active' | 'offline' | 'warning';
}

export function SedesView() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  
  // State for Sedes View
  const [isSedeModalOpen, setIsSedeModalOpen] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');
  const [newSedeLocation, setNewSedeLocation] = useState('');
  
  // State for Detail View
  const [selectedSedeId, setSelectedSedeId] = useState<string | null>(null);
  const [isLaptopModalOpen, setIsLaptopModalOpen] = useState(false);
  const [newLaptopName, setNewLaptopName] = useState('');
  const [newLaptopOS, setNewLaptopOS] = useState('Windows 11');

  const selectedSede = sedes.find(s => s.id === selectedSedeId);

  const handleAddSede = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSedeName.trim()) return;

    const newSede: Sede = {
      id: Math.random().toString(36).substr(2, 9),
      name: newSedeName,
      location: newSedeLocation || 'Sin ubicación',
      devices: [],
      status: 'active'
    };

    setSedes([...sedes, newSede]);
    setNewSedeName('');
    setNewSedeLocation('');
    setIsSedeModalOpen(false);
  };

  const handleAddLaptop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLaptopName.trim() || !selectedSedeId) return;

    const newLaptop: Device = {
      id: Math.random().toString(36).substr(2, 9),
      name: newLaptopName,
      os: newLaptopOS,
      status: 'online'
    };

    setSedes(sedes.map(sede => {
      if (sede.id === selectedSedeId) {
        return { ...sede, devices: [...sede.devices, newLaptop] };
      }
      return sede;
    }));

    setNewLaptopName('');
    setIsLaptopModalOpen(false);
  };

  // ----------------------------------------------------
  // VISTA: DETALLE DE SEDE (Lista de laptops)
  // ----------------------------------------------------
  if (selectedSede) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-slide-up relative z-10">
        <button 
          onClick={() => setSelectedSedeId(null)}
          className="flex items-center gap-2 text-text-tertiary hover:text-text-primary mb-6 transition-colors font-medium text-sm group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Volver a Sedes
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 bg-surface-elevated border border-surface-border text-brand rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary tracking-tight">
                {selectedSede.name}
              </h1>
            </div>
            <p className="text-text-secondary text-sm flex items-center gap-1.5 mt-2 ml-14">
              <MapPin className="w-4 h-4 text-brand" /> {selectedSede.location}
            </p>
          </div>
          <div>
            <button 
              onClick={() => setIsLaptopModalOpen(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand hover:bg-brand-light text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.98] shadow-lg shadow-brand/20"
            >
              <Plus className="w-5 h-5" /> Agregar Equipo
            </button>
          </div>
        </div>

        {selectedSede.devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center mb-6 border border-surface-border">
              <Laptop className="w-8 h-8 text-text-tertiary" />
            </div>
            <p className="text-text-primary font-semibold text-lg mb-1">Sin equipos registrados</p>
            <p className="text-text-tertiary text-[13px] text-center">Registra los endpoints pertenecientes a esta sede para comenzar el monitoreo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {selectedSede.devices.map((dev) => (
              <div key={dev.id} className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-5 hover:border-brand/30 transition-all duration-200 flex flex-col group hover:-translate-y-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-1.5 opacity-50">
                    <div className="w-2.5 h-2.5 rounded-full bg-status-error/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-status-warning/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-status-success/50" />
                  </div>
                  <div className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border bg-status-success/10 text-status-success border-status-success/20 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    ONLINE
                  </div>
                </div>
                
                <h4 className="text-text-primary font-bold tracking-tight flex items-center gap-2 truncate pr-2 mb-1 text-[15px]">
                  <Monitor className="w-4 h-4 shrink-0 text-text-primary" /> 
                  {dev.name.toUpperCase()}
                </h4>
                <p className="text-[11px] text-text-tertiary truncate font-mono">{dev.os} • {dev.id.substring(0, 8)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Modal Agregar Laptop */}
        {isLaptopModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-md overflow-hidden relative">
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
              
              <div className="flex justify-between items-center p-6 border-b border-surface-border relative z-10">
                <h3 className="text-lg font-bold text-text-primary tracking-tight">Registrar Equipo</h3>
                <button onClick={() => setIsLaptopModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-highlight text-text-tertiary hover:text-text-primary transition-colors border border-surface-border">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <form onSubmit={handleAddLaptop} className="p-6 flex flex-col gap-5 relative z-10">
                <div>
                  <label className="block text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-2 ml-0.5">Nombre del equipo</label>
                  <input 
                    type="text" 
                    value={newLaptopName}
                    onChange={(e) => setNewLaptopName(e.target.value)}
                    placeholder="Ej. LAPTOP-JUAN"
                    className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-3 text-text-primary placeholder-text-tertiary/40 focus:border-brand/40 focus:ring-1 focus:ring-brand/40 outline-none transition-all duration-200 text-[13px]"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-2 ml-0.5">Sistema Operativo</label>
                  <select 
                    value={newLaptopOS}
                    onChange={(e) => setNewLaptopOS(e.target.value)}
                    className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-3 text-text-primary focus:border-brand/40 outline-none transition-all duration-200 appearance-none text-[13px] cursor-pointer"
                  >
                    <option value="Windows 11">Windows 11</option>
                    <option value="Windows 10">Windows 10</option>
                    <option value="macOS Sonoma">macOS Sonoma</option>
                    <option value="Ubuntu 22.04">Ubuntu 22.04</option>
                  </select>
                </div>
                
                <div className="mt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsLaptopModalOpen(false)}
                    className="flex-1 py-3 rounded-lg border border-surface-border text-text-primary hover:bg-surface-highlight font-semibold transition-colors text-[13px]"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 rounded-lg bg-brand text-white font-semibold transition-colors hover:bg-brand-light active:scale-[0.98] text-[13px] shadow-lg shadow-brand/20"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // VISTA: LISTADO DE SEDES
  // ----------------------------------------------------
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-slide-up relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Organización</h3>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary mb-2 tracking-tight">Gestión de Sedes</h1>
          <p className="text-text-secondary text-sm lg:text-base max-w-xl">
            Crea áreas de trabajo geográficas o departamentales y agrupa los endpoints para un control focalizado.
          </p>
        </div>
        <div>
          <button 
            onClick={() => setIsSedeModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand hover:bg-brand-light text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.98] shadow-lg shadow-brand/20"
          >
            <Plus className="w-5 h-5" /> Nueva Sede
          </button>
        </div>
      </div>

      {sedes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border animate-slide-up">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center border border-surface-border">
              <Building2 className="w-8 h-8 text-text-tertiary" />
            </div>
          </div>
          <p className="text-text-primary font-semibold text-lg mb-1">Aún no hay sedes registradas</p>
          <p className="text-text-tertiary text-[13px] text-center mb-6">Comienza organizando tu red creando la primera sede.</p>
          <button 
            onClick={() => setIsSedeModalOpen(true)}
            className="text-brand text-[13px] font-semibold hover:text-brand-light transition-colors"
          >
            Crear primera sede →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sedes.map((sede) => (
            <div 
              key={sede.id} 
              onClick={() => setSelectedSedeId(sede.id)}
              className="bg-surface-elevated/50 border border-surface-border hover:border-brand/30 cursor-pointer rounded-2xl p-6 transition-all duration-200 group hover:-translate-y-1 relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-5 relative z-10">
                <div className="w-11 h-11 bg-surface-elevated border border-surface-border text-brand rounded-lg flex items-center justify-center group-hover:bg-brand/10 group-hover:border-brand/20 transition-colors">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="w-7 h-7 rounded-md bg-surface-elevated flex items-center justify-center text-text-tertiary border border-surface-border group-hover:border-brand/30 group-hover:text-brand transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-text-primary mb-1 tracking-tight relative z-10">{sede.name}</h3>
              <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary mb-5 font-mono relative z-10">
                <MapPin className="w-3.5 h-3.5 text-text-secondary" /> {sede.location}
              </div>

              <div className="bg-surface-elevated/50 p-3 rounded-lg border border-surface-border flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-brand" />
                  <span className="text-text-tertiary text-[10px] font-semibold uppercase tracking-wider">Equipos</span>
                </div>
                <div className="text-text-primary font-mono font-bold">{sede.devices.length}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Agregar Sede */}
      {isSedeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl w-full max-w-md overflow-hidden relative">
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
            
            <div className="flex justify-between items-center p-6 border-b border-surface-border relative z-10">
              <h3 className="text-lg font-bold text-text-primary tracking-tight">Nueva Sede</h3>
              <button onClick={() => setIsSedeModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-highlight text-text-tertiary hover:text-text-primary transition-colors border border-surface-border">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleAddSede} className="p-6 flex flex-col gap-5 relative z-10">
              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-2 ml-0.5">Nombre de la sede</label>
                <input 
                  type="text" 
                  value={newSedeName}
                  onChange={(e) => setNewSedeName(e.target.value)}
                  placeholder="Ej. Oficina Principal"
                  className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-3 text-text-primary placeholder-text-tertiary/40 focus:border-brand/40 focus:ring-1 focus:ring-brand/40 outline-none transition-all duration-200 text-[13px]"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-2 ml-0.5">Ubicación</label>
                <input 
                  type="text" 
                  value={newSedeLocation}
                  onChange={(e) => setNewSedeLocation(e.target.value)}
                  placeholder="Ej. Lima, Perú"
                  className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-3 text-text-primary placeholder-text-tertiary/40 focus:border-brand/40 focus:ring-1 focus:ring-brand/40 outline-none transition-all duration-200 text-[13px]"
                />
              </div>
              
              <div className="mt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsSedeModalOpen(false)}
                  className="flex-1 py-3.5 rounded-xl border border-glass-border text-text-primary hover:bg-white/5 hover:text-white font-bold transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold transition-all shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40 active:scale-[0.98] text-sm"
                >
                  Crear Sede
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
