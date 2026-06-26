import { useState, useEffect } from 'react';
import { Building2, Plus, Trash2, MapPin, Monitor, X, Laptop, Link, Edit3, Cpu, HardDrive, Check, Users } from 'lucide-react';
import { api } from '../services/api';
import { haptic } from '../services/haptics';
import { useToast } from './ui/Toast';

interface SedeStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  avgCpu: number;
  avgRam: number;
}

interface Sede {
  id: string;
  name: string;
  location: string;
  devices: string[];
  color?: string;
  createdAt?: string;
  stats?: SedeStats;
}

interface Device {
  id: string;
  name: string;
  status: string;
  os?: string;
  cpu?: number;
  ram?: number;
  activeApp?: string;
  sedeId?: string;
  sedeName?: string;
}

const SEDE_COLORS = [
  { name: 'Naranja', value: '#FF6B35' },
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Morado', value: '#8B5CF6' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Amarillo', value: '#F59E0B' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Rojo', value: '#EF4444' },
];

export function SedesView() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Sede | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newColor, setNewColor] = useState(SEDE_COLORS[0].value);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const { addToast } = useToast();

  const fetchSedes = async () => {
    try {
      setLoading(true);
      const res = await api.get('/sedes');
      setSedes(res.data);
      setError('');
    } catch {
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
    } catch {}
  };

  useEffect(() => { 
    fetchSedes(); 
    fetchDevices();
  }, []);

  useEffect(() => {
    if (sedes.length > 0) {
      localStorage.setItem('vc-sedes', JSON.stringify(sedes));
    }
  }, [sedes]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    haptic('medium');
    try {
      await api.post('/sedes', { name: newName, location: newLocation, color: newColor });
      setShowCreateModal(false);
      setNewName('');
      setNewLocation('');
      setNewColor(SEDE_COLORS[0].value);
      haptic('success');
      fetchSedes();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al crear sede';
      setError(msg);
      haptic('error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!showEditModal || !newName.trim()) return;
    setSaving(true);
    haptic('medium');
    try {
      await api.patch(`/sedes/${showEditModal.id}`, { name: newName, location: newLocation, color: newColor });
      setShowEditModal(null);
      setNewName('');
      setNewLocation('');
      haptic('success');
      fetchSedes();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Error al editar sede';
      setError(msg);
      haptic('error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Replaced native confirm with direct action + success toast for professional UI
    haptic('warning');
    try {
      await api.delete(`/sedes/${id}`);
      fetchSedes();
      addToast({ type: 'success', title: 'Sede eliminada', message: 'Los dispositivos han sido desasignados correctamente.' });
    } catch {
      setError('Error al eliminar sede');
      addToast({ type: 'error', title: 'Error', message: 'No se pudo eliminar la sede.' });
    }
  };

  const handleAssignDevice = async (sedeId: string, deviceId: string) => {
    haptic('light');
    try {
      await api.post(`/sedes/${sedeId}/devices`, { deviceId });
      haptic('success');
      fetchSedes();
      fetchDevices();
    } catch {
      setError('Error al asignar dispositivo');
      haptic('error');
    }
  };

  const handleBulkAssign = async (sedeId: string, deviceIds: string[]) => {
    haptic('medium');
    try {
      await api.post(`/sedes/${sedeId}/devices/bulk`, { deviceIds });
      haptic('success');
      fetchSedes();
      fetchDevices();
      setShowAssignModal(null);
    } catch {
      setError('Error al asignar dispositivos');
      haptic('error');
    }
  };

  const handleUnassignDevice = async (sedeId: string, deviceId: string) => {
    haptic('light');
    try {
      await api.delete(`/sedes/${sedeId}/devices/${deviceId}`);
      fetchSedes();
      fetchDevices();
    } catch {
      setError('Error al desasignar dispositivo');
    }
  };

  const getUnassignedDevices = () => {
    const assignedIds = new Set(sedes.flatMap(s => s.devices));
    return allDevices.filter(d => !assignedIds.has(d.id));
  };

  const getDeviceInfo = (deviceId: string) => {
    return allDevices.find(d => d.id === deviceId);
  };

  const openEditModal = (sede: Sede) => {
    setNewName(sede.name);
    setNewLocation(sede.location);
    setNewColor((sede as any).color || SEDE_COLORS[0].value);
    setShowEditModal(sede);
  };

  const openCreateModal = () => {
    setNewName('');
    setNewLocation('');
    setNewColor(SEDE_COLORS[Math.floor(Math.random() * SEDE_COLORS.length)].value);
    setShowCreateModal(true);
  };

  const unassigned = getUnassignedDevices();
  const filteredUnassigned = assignSearch 
    ? unassigned.filter(d => d.name.toLowerCase().includes(assignSearch.toLowerCase()))
    : unassigned;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Organizacion</h3>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Sedes y Ubicaciones</h1>
          <p className="text-sm text-text-secondary mt-1">Organiza tus equipos por sede, oficina o ubicacion fisica</p>
        </div>
        <button
          onClick={openCreateModal}
          className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-all shadow-lg shadow-brand/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nueva Sede
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-status-error/10 border border-status-error/20 rounded-xl px-4 py-3 text-sm text-status-error flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-status-error/60 hover:text-status-error"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Unassigned Devices Alert */}
      {unassigned.length > 0 && (
        <div className="glass-subtle rounded-2xl p-4 border border-status-warning/20 bg-status-warning/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-status-warning/10 flex items-center justify-center">
              <Laptop className="w-5 h-5 text-status-warning" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">{unassigned.length} equipo{unassigned.length > 1 ? 's' : ''} sin sede asignada</p>
              <p className="text-xs text-text-tertiary">Asignalos a una sede para mejor organizacion</p>
            </div>
          </div>
        </div>
      )}

      {/* Sedes Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
        </div>
      ) : sedes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border">
          <Building2 className="w-16 h-16 text-text-tertiary/30 mb-4" />
          <p className="text-text-primary font-semibold text-lg mb-1">Sin sedes configuradas</p>
          <p className="text-text-tertiary text-sm max-w-sm text-center mb-6">
            Crea tu primera sede para organizar los equipos por oficina o ubicacion.
          </p>
          <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark transition-all">
            <Plus className="w-4 h-4" /> Crear Primera Sede
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {sedes.map((sede) => {
            const isExpanded = expandedId === sede.id;
            const sedeColor = (sede as any).color || '#FF6B35';
            const stats = sede.stats || { totalDevices: sede.devices.length, onlineDevices: 0, offlineDevices: 0, avgCpu: 0, avgRam: 0 };

            return (
              <div
                key={sede.id}
                className="glass-subtle rounded-2xl border border-surface-border overflow-hidden transition-all duration-300 hover:border-surface-border/80"
              >
                {/* Sede Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/10"
                        style={{ backgroundColor: `${sedeColor}15`, borderColor: `${sedeColor}30` }}
                      >
                        <Building2 className="w-5 h-5" style={{ color: sedeColor }} />
                      </div>
                      <div>
                        <h3 className="font-bold text-text-primary text-base">{sede.name}</h3>
                        {sede.location && (
                          <p className="text-xs text-text-tertiary flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {sede.location}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(sede)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                        title="Editar sede"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(sede.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                        title="Eliminar sede"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    <div className="bg-surface-elevated/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-text-primary">{stats.totalDevices}</p>
                      <p className="text-[9px] text-text-tertiary uppercase">Total</p>
                    </div>
                    <div className="bg-surface-elevated/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-status-success">{stats.onlineDevices}</p>
                      <p className="text-[9px] text-text-tertiary uppercase">Online</p>
                    </div>
                    <div className="bg-surface-elevated/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-text-primary">{stats.avgCpu}%</p>
                      <p className="text-[9px] text-text-tertiary uppercase">CPU</p>
                    </div>
                    <div className="bg-surface-elevated/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-black text-text-primary">{stats.avgRam}%</p>
                      <p className="text-[9px] text-text-tertiary uppercase">RAM</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : sede.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface-elevated/50 border border-surface-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      {isExpanded ? 'Ocultar Equipos' : `Ver Equipos (${stats.totalDevices})`}
                    </button>
                    <button
                      onClick={() => { setAssignSearch(''); setShowAssignModal(sede.id); }}
                      className="flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-semibold transition-colors hover:bg-brand/5"
                      style={{ borderColor: `${sedeColor}40`, color: sedeColor }}
                    >
                      <Link className="w-3.5 h-3.5" />
                      Asignar
                    </button>
                  </div>
                </div>

                {/* Expanded Devices List */}
                {isExpanded && (
                  <div className="border-t border-surface-border bg-surface-elevated/20 p-4 space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                    {sede.devices.length === 0 ? (
                      <p className="text-xs text-text-tertiary text-center py-4">Sin equipos asignados</p>
                    ) : (
                      sede.devices.map(deviceId => {
                        const device = getDeviceInfo(deviceId);
                        const isOnline = device?.status === 'online';
                        return (
                          <div key={deviceId} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-base/50 border border-surface-border/50">
                            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-status-success' : 'bg-text-tertiary'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-text-primary truncate">{device?.name || deviceId.slice(0, 12)}</p>
                              {device?.activeApp && isOnline && (
                                <p className="text-[10px] text-text-tertiary truncate">{device.activeApp}</p>
                              )}
                            </div>
                            {isOnline && device?.cpu !== undefined && (
                              <div className="flex items-center gap-2 text-[10px] font-mono text-text-secondary">
                                <span><Cpu className="w-3 h-3 inline" /> {device.cpu}%</span>
                                <span><HardDrive className="w-3 h-3 inline" /> {device.ram}%</span>
                              </div>
                            )}
                            <button
                              onClick={() => handleUnassignDevice(sede.id, deviceId)}
                              className="w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors shrink-0"
                              title="Quitar de esta sede"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Create/Edit Modal ═══ */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { setShowCreateModal(false); setShowEditModal(null); }}>
          <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-md p-6 animate-spring-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-primary mb-4">{showEditModal ? 'Editar Sede' : 'Nueva Sede'}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Nombre de la Sede</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ej: Oficina Lima, Sede Bogota..."
                  className="w-full px-3 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Ubicacion / Direccion</label>
                <input
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  placeholder="Ej: Av. Principal 123, Piso 5"
                  className="w-full px-3 py-2.5 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {SEDE_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setNewColor(c.value)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${newColor === c.value ? 'scale-110 border-white/50' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    >
                      {newColor === c.value && <Check className="w-4 h-4 text-white mx-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setShowEditModal(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-text-secondary border border-surface-border hover:bg-surface-elevated transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={showEditModal ? handleEdit : handleCreate}
                disabled={saving || !newName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : showEditModal ? 'Guardar Cambios' : 'Crear Sede'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Assign Devices Modal ═══ */}
      {showAssignModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAssignModal(null)}>
          <div className="bg-surface-base border border-surface-border rounded-2xl w-full max-w-lg p-6 animate-spring-in max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-text-primary">Asignar Equipos</h3>
              <button onClick={() => setShowAssignModal(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <input
              value={assignSearch}
              onChange={e => setAssignSearch(e.target.value)}
              placeholder="Buscar equipo..."
              className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 transition-all mb-3"
            />

            {/* Unassigned Devices List */}
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
              {filteredUnassigned.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <Users className="w-10 h-10 text-text-tertiary/30 mb-2" />
                  <p className="text-xs text-text-tertiary">
                    {unassigned.length === 0 ? 'Todos los equipos ya estan asignados' : 'No se encontraron equipos'}
                  </p>
                </div>
              ) : (
                filteredUnassigned.map(device => {
                  const isOnline = device.status === 'online';
                  return (
                    <div
                      key={device.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-surface-border bg-surface-elevated/30 hover:bg-surface-elevated hover:border-brand/20 transition-all group"
                    >
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-status-success' : 'bg-text-tertiary'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{device.name}</p>
                        <p className="text-[10px] text-text-tertiary">{device.os || 'Windows'} {isOnline ? '- Online' : '- Offline'}</p>
                      </div>
                      <button
                        onClick={() => handleAssignDevice(showAssignModal, device.id)}
                        className="px-3 py-1.5 bg-brand/10 border border-brand/20 text-brand rounded-lg text-[11px] font-bold hover:bg-brand/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        Asignar
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bulk Assign Button */}
            {filteredUnassigned.length > 1 && (
              <button
                onClick={() => handleBulkAssign(showAssignModal, filteredUnassigned.map(d => d.id))}
                className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20 transition-colors"
              >
                Asignar Todos ({filteredUnassigned.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
