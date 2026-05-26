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
      <div className="p-4 sm:p-8 max-w-7xl mx-auto animate-in slide-in-from-right-8 duration-300">
        <button 
          onClick={() => setSelectedSedeId(null)}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary mb-6 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Sedes
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                {selectedSede.name}
              </h1>
            </div>
            <p className="text-text-secondary text-sm sm:text-base flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> {selectedSede.location}
            </p>
          </div>
          <div>
            <button 
              onClick={() => setIsLaptopModalOpen(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-secondary text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-brand-primary/20"
            >
              <Plus className="w-5 h-5" /> Agregar Laptop
            </button>
          </div>
        </div>

        {selectedSede.devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 bg-bg-surface rounded-2xl border border-bg-elevated border-dashed">
            <Laptop className="w-12 h-12 text-bg-elevated mb-4" />
            <p className="text-text-tertiary font-medium">No hay laptops registradas en esta sede.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {selectedSede.devices.map((dev) => (
              <div key={dev.id} className="bg-bg-surface border border-bg-elevated rounded-xl p-5 hover:border-bg-highlight transition-colors flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  </div>
                  <div className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border bg-green-500/10 text-green-500 border-green-500/20 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    ONLINE
                  </div>
                </div>
                
                <h4 className="text-white font-bold tracking-tight flex items-center gap-2 truncate pr-2 mb-1">
                  <Monitor className="w-4 h-4 shrink-0 text-brand-primary" /> 
                  {dev.name}
                </h4>
                <p className="text-xs text-text-secondary truncate">{dev.os}</p>
              </div>
            ))}
          </div>
        )}

        {/* Modal Agregar Laptop */}
        {isLaptopModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-bg-surface border border-bg-elevated rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center p-5 border-b border-bg-elevated">
                <h3 className="text-lg font-bold text-text-primary">Registrar Laptop</h3>
                <button onClick={() => setIsLaptopModalOpen(false)} className="text-text-tertiary hover:text-text-primary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleAddLaptop} className="p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre del equipo</label>
                  <input 
                    type="text" 
                    value={newLaptopName}
                    onChange={(e) => setNewLaptopName(e.target.value)}
                    placeholder="Ej. LAPTOP-JUAN"
                    className="w-full bg-bg-base border border-bg-elevated rounded-lg px-4 py-2.5 text-text-primary placeholder-text-tertiary focus:border-brand-primary outline-none transition-colors"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Sistema Operativo</label>
                  <select 
                    value={newLaptopOS}
                    onChange={(e) => setNewLaptopOS(e.target.value)}
                    className="w-full bg-bg-base border border-bg-elevated rounded-lg px-4 py-2.5 text-text-primary focus:border-brand-primary outline-none transition-colors appearance-none"
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
                    className="flex-1 px-4 py-2.5 rounded-lg border border-bg-elevated text-text-primary hover:bg-bg-highlight font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-lg bg-brand-primary text-white hover:bg-brand-secondary font-medium transition-colors shadow-lg shadow-brand-primary/20"
                  >
                    Guardar Laptop
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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <h3 className="text-brand-primary text-xs font-bold tracking-[0.2em] uppercase mb-2">Organización</h3>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 tracking-tight">Gestión de Sedes</h1>
          <p className="text-text-secondary text-sm sm:text-base max-w-xl">
            Crea sedes y agrega laptops a cada una para facilitar el monitoreo.
          </p>
        </div>
        <div>
          <button 
            onClick={() => setIsSedeModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-secondary text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-brand-primary/20"
          >
            <Plus className="w-5 h-5" /> Crear Sede
          </button>
        </div>
      </div>

      {sedes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 bg-bg-surface rounded-2xl border border-bg-elevated border-dashed">
          <Building2 className="w-12 h-12 text-bg-elevated mb-4" />
          <p className="text-text-tertiary font-medium mb-4">Aún no hay sedes registradas.</p>
          <button 
            onClick={() => setIsSedeModalOpen(true)}
            className="text-brand-primary text-sm font-bold hover:underline"
          >
            Crear tu primera sede
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sedes.map(sede => (
            <div 
              key={sede.id} 
              onClick={() => setSelectedSedeId(sede.id)}
              className="bg-bg-surface border border-bg-elevated hover:border-brand-primary/50 cursor-pointer rounded-2xl p-6 transition-all group hover:shadow-lg hover:shadow-brand-primary/5"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="text-text-tertiary">
                  <ArrowLeft className="w-5 h-5 rotate-180 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-text-primary mb-1">{sede.name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-text-secondary mb-6">
                <MapPin className="w-4 h-4" /> {sede.location}
              </div>

              <div className="bg-bg-base p-3 rounded-xl border border-bg-elevated">
                <div className="text-text-tertiary text-xs font-bold uppercase mb-1 flex items-center gap-1.5">
                  <Monitor className="w-3 h-3" /> Equipos Registrados
                </div>
                <div className="text-text-primary font-mono text-lg">{sede.devices.length} laptops</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Agregar Sede */}
      {isSedeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-surface border border-bg-elevated rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-bg-elevated">
              <h3 className="text-lg font-bold text-text-primary">Nueva Sede</h3>
              <button onClick={() => setIsSedeModalOpen(false)} className="text-text-tertiary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddSede} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre de la sede</label>
                <input 
                  type="text" 
                  value={newSedeName}
                  onChange={(e) => setNewSedeName(e.target.value)}
                  placeholder="Ej. Oficina Principal"
                  className="w-full bg-bg-base border border-bg-elevated rounded-lg px-4 py-2.5 text-text-primary placeholder-text-tertiary focus:border-brand-primary outline-none transition-colors"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Ubicación</label>
                <input 
                  type="text" 
                  value={newSedeLocation}
                  onChange={(e) => setNewSedeLocation(e.target.value)}
                  placeholder="Ej. Lima, Perú"
                  className="w-full bg-bg-base border border-bg-elevated rounded-lg px-4 py-2.5 text-text-primary placeholder-text-tertiary focus:border-brand-primary outline-none transition-colors"
                />
              </div>
              
              <div className="mt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsSedeModalOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-bg-elevated text-text-primary hover:bg-bg-highlight font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-brand-primary text-white hover:bg-brand-secondary font-medium transition-colors shadow-lg shadow-brand-primary/20"
                >
                  Guardar Sede
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
