import { useState, useEffect } from 'react';
import { Building2, Plus, Trash2, MapPin, Monitor, X } from 'lucide-react';
import { api } from '../services/api';

interface Sede {
  id: string;
  name: string;
  location: string;
  devices: string[];
}

export function SedesView() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
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
      setError('Error al cargar sedes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSedes(); }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newLocation.trim()) return;
    setSaving(true);
    try {
      await api.post('/sedes', { name: newName, location: newLocation });
      setShowModal(false);
      setNewName('');
      setNewLocation('');
      fetchSedes();
    } catch {
      setError('Error al crear sede');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta sede?')) return;
    try {
      await api.delete(`/sedes/${id}`);
      fetchSedes();
    } catch {
      setError('Error al eliminar sede');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Sedes</h1>
          <p className="text-sm text-text-secondary mt-1">Gestión de ubicaciones</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Agregar Sede
        </button>
      </div>

      {error && (
        <div className="bg-status-error/10 border border-status-error/30 text-status-error text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-surface-elevated border border-surface-border rounded-xl p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : sedes.length === 0 ? (
        <div className="text-center py-16 text-text-tertiary">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay sedes registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sedes.map(sede => (
            <div
              key={sede.id}
              className="bg-surface-elevated border border-surface-border rounded-xl p-5 hover:border-brand/30 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="cursor-pointer flex-1"
                  onClick={() => setExpandedId(expandedId === sede.id ? null : sede.id)}
                >
                  <h3 className="text-sm font-semibold text-text-primary">{sede.name}</h3>
                  <div className="flex items-center gap-1 mt-1 text-xs text-text-tertiary">
                    <MapPin className="w-3 h-3" />
                    {sede.location}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(sede.id)}
                  className="p-1.5 rounded-md text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Monitor className="w-3 h-3" />
                <span>{sede.devices.length} dispositivos</span>
              </div>
              {expandedId === sede.id && sede.devices.length > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-border space-y-1">
                  {sede.devices.map((devId, i) => (
                    <p key={i} className="text-xs text-text-tertiary font-mono">{devId}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary">Nueva Sede</h2>
              <button onClick={() => setShowModal(false)} className="text-text-tertiary hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Nombre</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-bg-base border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
                  placeholder="Oficina Central"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Ubicación</label>
                <input
                  value={newLocation}
                  onChange={e => setNewLocation(e.target.value)}
                  className="w-full bg-bg-base border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
                  placeholder="Ciudad, País"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={saving || !newName.trim() || !newLocation.trim()}
                className="w-full py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Crear Sede'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
