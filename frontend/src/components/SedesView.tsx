import { useState, useEffect } from 'react';
import { Building2, Plus, Trash2, MapPin, Monitor, X, ChevronDown, ChevronUp, Laptop, Link } from 'lucide-react';
import { api } from '../services/api';
import { haptic } from '../services/haptics';

interface Sede {
  id: string;
  name: string;
  location: string;
  devices: string[];
}

interface Device {
  id: string;
  name: string;
  status: string;
}

export function SedesView() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSedes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sedes');
      setSedes(res.data);
      setError('');
    } catch {
      // Fallback: use localStorage cache
      const cached = localStorage.getItem('vc-sedes');
      if (cached) setSedes(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await api.get('/devices');
      setAllDevices(res.data);
    } catch {
      // Devices come from socket in real-time, this is just for assignment
    }
  };

  useEffect(() => { 
    fetchSedes(); 
    fetchDevices();
  }, []);

  // Cache sedes locally
  useEffect(() => {
    if (sedes.length > 0) {
      localStorage.setItem('vc-sedes', JSON.stringify(sedes));
    }
  }, [sedes]);

  const handleCreate = async () => {
    if (!newName.trim() || !newLocation.trim()) return;
    setSaving(true);
    haptic('medium');
    try {
      await api.post('/sedes', { name: newName, location: newLocation });
      setShowModal(false);
      setNewName('');
      setNewLocation('');
      haptic('success');
      fetchSedes();
    } catch {
      setError('Error al crear sede');
      haptic('error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta sede?')) return;
    haptic('warning');
    try {
      await api.delete(`/sedes/${id}`);
      fetchSedes();
    } catch {
      setError('Error al eliminar sede');
    }
  };

  const handleAssignDevice = async (sedeId: string, deviceId: string) => {
    haptic('light');
    try {
      await api.post(`/sedes/${sedeId}/devices`, { deviceId });
      haptic('success');
      fetchSedes();
    } catch {
      setError('Error al asignar dispositivo');
      haptic('error');
    }
  };

  const handleUnassignDevice = async (sedeId: string, deviceId: string) => {
    haptic('light');
    try {
      await api.delete(`/sedes/${sedeId}/devices/${deviceId}`);
      fetchSedes();
    } catch {
      setError('Error al desasignar dispositivo');
    }
  };

  // Get devices not assigned to any sede
  const getUnassignedDevices = () => {
    const assignedIds = new Set(sedes.flatMap(s => s.devices));
    return allDevices.filter(d => !assignedIds.has(d.id));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto animate-slide-up">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 stagger-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Sedes</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1">{sedes.length} ubicaciones registradas en total</p>
        </div>
        <button
          onClick={() => { setShowModal(true); haptic('light'); }}
          className="self-start md:self-auto flex items-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 border border-brand/20 hover:border-brand/40 glow-brand hover-card"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar Sede</span>
        </button>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error text-sm px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-status-error/60 hover:text-status-error"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-surface-elevated border border-surface-border rounded-xl p-5 animate-pulse h-40" />
          ))}
        </div>
      ) : sedes.length === 0 ? (
        <div className="text-center py-20 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border stagger-2">
          <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-surface-border flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-text-tertiary" />
          </div>
          <p className="text-base font-semibold text-text-primary mb-1">No hay sedes registradas</p>
          <p className="text-sm text-text-tertiary mt-1">Crea tu primera sede para organizar tus dispositivos</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-6 px-5 py-2.5 bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 hover:border-brand/40 rounded-xl text-sm font-semibold transition-all hover-card glow-brand"
          >
            Crear primera sede
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 stagger-2">
          {sedes.map(sede => (
            <div
              key={sede.id}
              className="glass-subtle rounded-2xl overflow-hidden hover:border-brand/40 transition-all duration-300 hover-card group"
            >
              {/* Header */}
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between">
                  <div
                    className="cursor-pointer flex-1"
                    onClick={() => setExpandedId(expandedId === sede.id ? null : sede.id)}
                  >
                    <h3 className="text-sm font-bold text-text-primary">{sede.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-text-tertiary">
                      <MapPin className="w-3 h-3" />
                      {sede.location}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExpandedId(expandedId === sede.id ? null : sede.id)}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-base transition-colors"
                    >
                      {expandedId === sede.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(sede.id)}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Device count + assign button */}
              <div className="px-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <Laptop className="w-3.5 h-3.5" />
                  <span>{sede.devices.length} dispositivo{sede.devices.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => { setShowAssignModal(sede.id); haptic('light'); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
                >
                  <Link className="w-3 h-3" />
                  Asignar
                </button>
              </div>

              {/* Expanded: show devices */}
              {expandedId === sede.id && (
                <div className="border-t border-surface-border px-4 py-3 space-y-2 bg-surface-base/50">
                  {sede.devices.length === 0 ? (
                    <p className="text-xs text-text-tertiary text-center py-2">Sin dispositivos asignados</p>
                  ) : (
                    sede.devices.map((devId) => {
                      const dev = allDevices.find(d => d.id === devId);
                      return (
                        <div key={devId} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2">
                            <Monitor className="w-3.5 h-3.5 text-text-tertiary" />
                            <span className="text-xs font-medium text-text-primary">
                              {dev?.name || devId.substring(0, 12) + '...'}
                            </span>
                            {dev && (
                              <span className={`w-1.5 h-1.5 rounded-full ${dev.status === 'online' ? 'bg-status-success' : 'bg-status-error'}`} />
                            )}
                          </div>
                          <button
                            onClick={() => handleUnassignDevice(sede.id, devId)}
                            className="text-[10px] text-text-tertiary hover:text-status-error transition-colors"
                          >
                            Quitar
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Sede Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6 w-full max-w-md animate-slide-from-bottom">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-text-primary">Nueva Sede</h2>
              <button onClick={() => setShowModal(false)} className="text-text-tertiary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Nombre de la sede</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-bg-base border border-surface-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
                  placeholder="Ej: Oficina Principal"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Ubicacion</label>
                <input
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  className="w-full bg-bg-base border border-surface-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
                  placeholder="Ej: Lima, Peru"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim() || !newLocation.trim()}
                className="w-full py-3 bg-brand text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-[0.97]"
              >
                {saving ? 'Creando...' : 'Crear Sede'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Device Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-2xl p-6 w-full max-w-md max-h-[70vh] flex flex-col animate-slide-from-bottom">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-lg font-bold text-text-primary">Asignar Dispositivo</h2>
              <button onClick={() => setShowAssignModal(null)} className="text-text-tertiary hover:text-text-primary transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-xs text-text-tertiary mb-3 shrink-0">
              Sede: <span className="font-medium text-text-secondary">{sedes.find(s => s.id === showAssignModal)?.name}</span>
            </p>

            <div className="flex-1 overflow-y-auto space-y-2">
              {getUnassignedDevices().length === 0 ? (
                <div className="text-center py-8">
                  <Monitor className="w-8 h-8 mx-auto mb-2 text-text-tertiary opacity-40" />
                  <p className="text-sm text-text-tertiary">Todos los dispositivos ya estan asignados</p>
                </div>
              ) : (
                getUnassignedDevices().map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => {
                      handleAssignDevice(showAssignModal!, dev.id);
                      setShowAssignModal(null);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-surface-border hover:border-brand/40 hover:bg-brand/5 transition-all text-left active:scale-[0.98]"
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-base border border-surface-border flex items-center justify-center">
                      <Laptop className="w-4 h-4 text-text-tertiary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{dev.name}</p>
                      <p className="text-[11px] text-text-tertiary">{dev.id.substring(0, 16)}...</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${dev.status === 'online' ? 'bg-status-success' : 'bg-status-error'}`} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
