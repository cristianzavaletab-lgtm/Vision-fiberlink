import { useState, useEffect } from 'react';
import { Settings, Monitor, Shield, Smartphone, Save, Check, X, Fingerprint, Bell, BellRing } from 'lucide-react';
import { api } from '../services/api';
import { useBiometric } from '../hooks/useBiometric';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { haptic } from '../services/haptics';

interface SettingsData {
  fps: number;
  quality: number;
  heartbeatInterval: number;
  requireConfirmation: boolean;
}

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsData>({
    fps: 15,
    quality: 70,
    heartbeatInterval: 10,
    requireConfirmation: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const { hasBiometric, isSupported: biometricSupported, registerBiometric, removeBiometric } = useBiometric();
  const { isSubscribed: pushSubscribed, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushSubscription();
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/settings');
        setSettings(prev => ({ ...prev, ...res.data }));
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', settings);
      setToast({ type: 'success', msg: 'Configuración guardada' });
    } catch {
      setToast({ type: 'error', msg: 'Error al guardar' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-surface-elevated rounded-xl" />)}</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Configuración</h1>
          <p className="text-sm text-text-secondary mt-1">Ajustes del sistema</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-status-success/10 text-status-success border border-status-success/30' : 'bg-status-error/10 text-status-error border border-status-error/30'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Streaming */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Monitor className="w-4 h-4 text-brand" />
          Streaming
        </h2>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-text-secondary mb-2">
              <span>FPS</span><span>{settings.fps}</span>
            </div>
            <input
              type="range" min={1} max={30} value={settings.fps}
              onChange={e => setSettings(s => ({ ...s, fps: +e.target.value }))}
              className="w-full accent-brand"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs text-text-secondary mb-2">
              <span>Calidad</span><span>{settings.quality}%</span>
            </div>
            <input
              type="range" min={30} max={100} value={settings.quality}
              onChange={e => setSettings(s => ({ ...s, quality: +e.target.value }))}
              className="w-full accent-brand"
            />
          </div>
        </div>
      </section>

      {/* Agentes */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-brand" />
          Agentes
        </h2>
        <div>
          <label className="block text-xs text-text-secondary mb-1.5">Intervalo de heartbeat (segundos)</label>
          <input
            type="number" min={1} max={120} value={settings.heartbeatInterval}
            onChange={e => setSettings(s => ({ ...s, heartbeatInterval: +e.target.value }))}
            className="w-32 bg-bg-base border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
          />
        </div>
      </section>

      {/* Seguridad */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-brand" />
          Seguridad
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setSettings(s => ({ ...s, requireConfirmation: !s.requireConfirmation }))}
            className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${settings.requireConfirmation ? 'bg-brand' : 'bg-surface-border'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings.requireConfirmation ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-text-secondary">Control remoto requiere confirmación</span>
        </label>
      </section>

      {/* PWA & Seguridad Movil */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Smartphone className="w-4 h-4 text-brand" />
          Aplicacion Movil (PWA)
        </h2>
        <div className="space-y-4">
          {/* Biometric Auth */}
          {biometricSupported && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-5 h-5 text-brand" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Acceso Biometrico</p>
                  <p className="text-xs text-text-tertiary">
                    {hasBiometric ? 'Habilitado - puedes ingresar con huella/FaceID' : 'Usa tu huella o FaceID para ingresar'}
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  setBiometricLoading(true);
                  haptic('medium');
                  if (hasBiometric) {
                    removeBiometric();
                    setToast({ type: 'success', msg: 'Acceso biometrico eliminado' });
                    haptic('success');
                  } else {
                    const success = await registerBiometric();
                    if (success) {
                      setToast({ type: 'success', msg: 'Biometria registrada exitosamente' });
                      haptic('success');
                    } else {
                      setToast({ type: 'error', msg: 'No se pudo registrar la biometria' });
                      haptic('error');
                    }
                  }
                  setBiometricLoading(false);
                }}
                disabled={biometricLoading}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  hasBiometric
                    ? 'bg-status-error/10 text-status-error border border-status-error/30 hover:bg-status-error/20'
                    : 'bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20'
                } disabled:opacity-50`}
              >
                {biometricLoading ? '...' : hasBiometric ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}

          {/* Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {pushSubscribed ? <BellRing className="w-5 h-5 text-status-success" /> : <Bell className="w-5 h-5 text-text-tertiary" />}
              <div>
                <p className="text-sm font-medium text-text-primary">Notificaciones Push</p>
                <p className="text-xs text-text-tertiary">
                  {pushSubscribed ? 'Activas - recibiras alertas de dispositivos' : 'Recibe alertas incluso con la app cerrada'}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                setPushLoading(true);
                haptic('medium');
                if (pushSubscribed) {
                  await unsubscribePush();
                  setToast({ type: 'success', msg: 'Notificaciones desactivadas' });
                } else {
                  const success = await subscribePush();
                  if (success) {
                    setToast({ type: 'success', msg: 'Notificaciones push activadas' });
                    haptic('success');
                  } else {
                    setToast({ type: 'error', msg: 'No se pudo activar las notificaciones' });
                    haptic('error');
                  }
                }
                setPushLoading(false);
              }}
              disabled={pushLoading}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                pushSubscribed
                  ? 'bg-status-error/10 text-status-error border border-status-error/30 hover:bg-status-error/20'
                  : 'bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20'
              } disabled:opacity-50`}
            >
              {pushLoading ? '...' : pushSubscribed ? 'Desactivar' : 'Activar'}
            </button>
          </div>

          <p className="text-xs text-text-tertiary pt-2 border-t border-surface-border">
            Esta aplicacion puede instalarse como PWA en dispositivos moviles y de escritorio para acceso rapido sin navegador.
          </p>
        </div>
      </section>
    </div>
  );
}
