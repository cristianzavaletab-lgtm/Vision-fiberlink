import { useState, useEffect } from 'react';
import { Settings, Monitor, Shield, Smartphone, Save, Check, X, Fingerprint, Bell, BellRing, AlertTriangle, Plus, Trash2, Ban, Mail, Clock, Send } from 'lucide-react';
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

interface AlertRule {
  id: string;
  name: string;
  type: string;
  condition: { metric?: string; operator: string; value: number | string; duration?: number };
  action: string;
  enabled: boolean;
}

interface BlockedApp {
  id: string;
  name: string;
  action: string;
  enabled: boolean;
}

interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  recipients: string[];
  schedule: string;
  reportType: string;
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

  // Alert Rules
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', type: 'cpu_high', metric: 'cpu', operator: '>', value: 90, duration: 60, action: 'notify_and_log' });

  // Blocked Apps
  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>([]);
  const [newBlockedApp, setNewBlockedApp] = useState('');
  const [newBlockedAction, setNewBlockedAction] = useState('notify');

  // Email Reports
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    enabled: false, host: '', port: 587, secure: false,
    user: '', pass: '', from: '', recipients: [], schedule: '0 18 * * 1-5', reportType: 'daily'
  });
  const [newRecipient, setNewRecipient] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTestSending, setEmailTestSending] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settingsRes, rulesRes, appsRes, emailRes] = await Promise.all([
          api.get('/settings'),
          api.get('/alert-rules').catch(() => ({ data: [] })),
          api.get('/blocked-apps').catch(() => ({ data: [] })),
          api.get('/email-config').catch(() => ({ data: null })),
        ]);
        setSettings(prev => ({ ...prev, ...settingsRes.data }));
        setAlertRules(rulesRes.data);
        setBlockedApps(appsRes.data);
        if (emailRes.data) setEmailConfig(prev => ({ ...prev, ...emailRes.data }));
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
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="h-20 bg-surface-elevated rounded-xl skeleton-box mb-8" />
        {[1, 2, 3].map(i => <div key={i} className="h-48 bg-surface-elevated rounded-xl skeleton-box" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="relative flex items-center justify-between pb-6 border-b border-surface-border">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-brand/20 via-transparent to-transparent" />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand" />
            <span className="text-brand font-bold text-[10px] tracking-[0.2em] uppercase">Sistema</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Configuración del Sistema</h1>
          <p className="text-sm text-text-secondary mt-1">Personaliza y controla todos los aspectos de la plataforma</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:opacity-90 hover:shadow-[0_0_20px_rgba(255,107,53,0.3)] transition-all duration-200 disabled:opacity-50 active:scale-95"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Toast — animated premium version */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold border animate-slide-up shadow-lg ${
          toast.type === 'success'
            ? 'bg-status-success/10 text-status-success border-status-success/30 shadow-status-success/10'
            : 'bg-status-error/10 text-status-error border-status-error/30 shadow-status-error/10'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            toast.type === 'success' ? 'bg-status-success/20' : 'bg-status-error/20'
          }`}>
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </div>
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X className="w-3.5 h-3.5" />
          </button>
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

      {/* PWA & Seguridad Movil - Premium Redesign */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-5">
          <Smartphone className="w-4 h-4 text-brand" />
          Seguridad Móvil y PWA
        </h2>
        <div className="space-y-3">
          {/* Biometric Auth - Premium card */}
          {biometricSupported && (
            <div className={`relative p-4 rounded-xl border transition-all duration-300 ${
              hasBiometric
                ? 'bg-gradient-to-r from-status-success/10 to-transparent border-status-success/30 shadow-[0_0_24px_rgba(34,197,94,0.08)]'
                : 'bg-surface-base/60 border-surface-border hover:border-brand/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center ${
                    hasBiometric ? 'bg-status-success/15 border border-status-success/30' : 'bg-surface-elevated border border-surface-border'
                  }`}>
                    <Fingerprint className={`w-6 h-6 transition-colors ${
                      hasBiometric ? 'text-status-success' : 'text-text-tertiary'
                    }`} />
                    {hasBiometric && <div className="absolute inset-0 rounded-xl bg-status-success/10 animate-pulse" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Acceso Biométrico</p>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      {hasBiometric ? '✓ Activo — Huella dactilar / Face ID habilitado' : 'Inicia sesión con tu huella o Face ID'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setBiometricLoading(true);
                    haptic('medium');
                    if (hasBiometric) {
                      removeBiometric();
                      setToast({ type: 'success', msg: 'Acceso biométrico eliminado' });
                      haptic('success');
                    } else {
                      const success = await registerBiometric();
                      if (success) {
                        setToast({ type: 'success', msg: '¡Biometría registrada exitosamente!' });
                        haptic('success');
                      } else {
                        setToast({ type: 'error', msg: 'No se pudo registrar la biometría' });
                        haptic('error');
                      }
                    }
                    setBiometricLoading(false);
                  }}
                  disabled={biometricLoading}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 ${
                    hasBiometric
                      ? 'bg-status-error/10 text-status-error border border-status-error/30 hover:bg-status-error/20 hover:shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                      : 'bg-brand text-white hover:opacity-90 hover:shadow-[0_0_16px_rgba(255,107,53,0.3)]'
                  } disabled:opacity-50`}
                >
                  {biometricLoading ? '...' : hasBiometric ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          )}

          {/* Push Notifications - Premium card */}
          <div className={`relative p-4 rounded-xl border transition-all duration-300 ${
            pushSubscribed
              ? 'bg-gradient-to-r from-blue-500/10 to-transparent border-blue-500/30 shadow-[0_0_24px_rgba(59,130,246,0.08)]'
              : 'bg-surface-base/60 border-surface-border hover:border-brand/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  pushSubscribed ? 'bg-blue-500/15 border border-blue-500/30' : 'bg-surface-elevated border border-surface-border'
                }`}>
                  {pushSubscribed
                    ? <BellRing className="w-6 h-6 text-blue-400" />
                    : <Bell className="w-6 h-6 text-text-tertiary" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">Notificaciones Push</p>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    {pushSubscribed ? '✓ Activas — Recibirás alertas en tiempo real' : 'Recibe alertas aunque la app esté cerrada'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {pushSubscribed && (
                  <button
                    onClick={async () => {
                      try {
                        await api.post('/webpush/test');
                        setToast({ type: 'success', msg: 'Notificación de prueba enviada' });
                      } catch {
                        setToast({ type: 'error', msg: 'Error al enviar prueba' });
                      }
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                  >
                    Prueba
                  </button>
                )}
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
                        setToast({ type: 'success', msg: '¡Notificaciones push activadas!' });
                        haptic('success');
                      } else {
                        setToast({ type: 'error', msg: 'No se pudo activar las notificaciones' });
                        haptic('error');
                      }
                    }
                    setPushLoading(false);
                  }}
                  disabled={pushLoading}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 ${
                    pushSubscribed
                      ? 'bg-status-error/10 text-status-error border border-status-error/30 hover:bg-status-error/20'
                      : 'bg-blue-500 text-white hover:opacity-90 hover:shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                  } disabled:opacity-50`}
                >
                  {pushLoading ? '...' : pushSubscribed ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-text-tertiary px-1">
            Esta aplicación puede instalarse como PWA en móviles y escritorio para acceso rápido sin navegador.
          </p>
        </div>
      </section>

      {/* ═══ Alert Rules ═══ */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning" />
            Reglas de Alerta
          </h2>
          <button
            onClick={() => setShowNewRule(!showNewRule)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand/10 text-brand rounded-lg text-[11px] font-semibold border border-brand/20 hover:bg-brand/20 transition-colors"
          >
            <Plus className="w-3 h-3" /> Nueva Regla
          </button>
        </div>

        {/* New Rule Form */}
        {showNewRule && (
          <div className="bg-surface-base border border-surface-border rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">Nombre</label>
                <input
                  value={newRule.name}
                  onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
                  placeholder="Ej: CPU Critico"
                  className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">Metrica</label>
                <select
                  value={newRule.metric}
                  onChange={e => setNewRule(r => ({ ...r, metric: e.target.value, type: e.target.value === 'cpu' ? 'cpu_high' : 'ram_high' }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
                >
                  <option value="cpu">CPU %</option>
                  <option value="ram">RAM %</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">Umbral</label>
                <input
                  type="number"
                  value={newRule.value}
                  onChange={e => setNewRule(r => ({ ...r, value: +e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">Duracion (seg)</label>
                <input
                  type="number"
                  value={newRule.duration}
                  onChange={e => setNewRule(r => ({ ...r, duration: +e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">Accion</label>
                <select
                  value={newRule.action}
                  onChange={e => setNewRule(r => ({ ...r, action: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
                >
                  <option value="notify">Notificar</option>
                  <option value="notify_and_log">Notificar + Log</option>
                  <option value="log">Solo Log</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!newRule.name) return;
                  try {
                    const res = await api.post('/alert-rules', {
                      name: newRule.name,
                      type: newRule.type,
                      condition: { metric: newRule.metric, operator: newRule.operator, value: newRule.value, duration: newRule.duration },
                      action: newRule.action,
                    });
                    setAlertRules(prev => [...prev, res.data]);
                    setShowNewRule(false);
                    setNewRule({ name: '', type: 'cpu_high', metric: 'cpu', operator: '>', value: 90, duration: 60, action: 'notify_and_log' });
                    setToast({ type: 'success', msg: 'Regla creada' });
                  } catch {
                    setToast({ type: 'error', msg: 'Error al crear regla' });
                  }
                }}
                className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-dark transition-colors"
              >
                Crear Regla
              </button>
              <button onClick={() => setShowNewRule(false)} className="px-3 py-1.5 text-text-secondary text-xs font-medium">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="space-y-2">
          {alertRules.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">Sin reglas configuradas</p>
          ) : (
            alertRules.map(rule => (
              <div key={rule.id} className="flex items-center gap-3 p-3 bg-surface-base/50 border border-surface-border rounded-lg">
                <div
                  onClick={async () => {
                    try {
                      await api.patch(`/alert-rules/${rule.id}`, { enabled: !rule.enabled });
                      setAlertRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                    } catch {}
                  }}
                  className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${rule.enabled ? 'bg-brand' : 'bg-surface-border'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary">{rule.name}</p>
                  <p className="text-[10px] text-text-tertiary">
                    {rule.condition.metric} {rule.condition.operator} {rule.condition.value}% durante {rule.condition.duration}s &rarr; {rule.action}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api.delete(`/alert-rules/${rule.id}`);
                      setAlertRules(prev => prev.filter(r => r.id !== rule.id));
                    } catch {}
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ═══ Blocked Apps ═══ */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Ban className="w-4 h-4 text-status-error" />
          Aplicaciones Bloqueadas
        </h2>
        <p className="text-xs text-text-tertiary mb-4">
          Las apps en esta lista seran detectadas y se ejecutara la accion configurada cuando un equipo las abra.
        </p>

        {/* Add new blocked app */}
        <div className="flex gap-2 mb-4">
          <input
            value={newBlockedApp}
            onChange={e => setNewBlockedApp(e.target.value)}
            placeholder="Nombre de la app (ej: Discord, Steam, Netflix...)"
            className="flex-1 px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50"
          />
          <select
            value={newBlockedAction}
            onChange={e => setNewBlockedAction(e.target.value)}
            className="px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
          >
            <option value="notify">Notificar</option>
            <option value="kill">Cerrar App</option>
            <option value="log">Solo Log</option>
          </select>
          <button
            onClick={async () => {
              if (!newBlockedApp.trim()) return;
              try {
                const res = await api.post('/blocked-apps', { name: newBlockedApp, action: newBlockedAction });
                setBlockedApps(prev => [...prev, res.data]);
                setNewBlockedApp('');
                setToast({ type: 'success', msg: 'App bloqueada agregada' });
              } catch {
                setToast({ type: 'error', msg: 'Error al agregar' });
              }
            }}
            className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Blocked apps list */}
        <div className="space-y-2">
          {blockedApps.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">Sin apps bloqueadas</p>
          ) : (
            blockedApps.map(app => (
              <div key={app.id} className="flex items-center gap-3 p-3 bg-surface-base/50 border border-surface-border rounded-lg">
                <div
                  onClick={async () => {
                    try {
                      await api.patch(`/blocked-apps/${app.id}`, { enabled: !app.enabled });
                      setBlockedApps(prev => prev.map(a => a.id === app.id ? { ...a, enabled: !a.enabled } : a));
                    } catch {}
                  }}
                  className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${app.enabled ? 'bg-status-error' : 'bg-surface-border'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${app.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <Ban className="w-3 h-3 text-status-error" />
                    {app.name}
                  </p>
                  <p className="text-[10px] text-text-tertiary">
                    Accion: {app.action === 'kill' ? 'Cerrar App' : app.action === 'notify' ? 'Notificar' : 'Solo Log'}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api.delete(`/blocked-apps/${app.id}`);
                      setBlockedApps(prev => prev.filter(a => a.id !== app.id));
                    } catch {}
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ═══ Email Reports Scheduling ═══ */}
      <section className="bg-surface-elevated border border-surface-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-400" />
            Reportes por Email
          </h2>
          <div
            onClick={() => setEmailConfig(c => ({ ...c, enabled: !c.enabled }))}
            className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${emailConfig.enabled ? 'bg-brand' : 'bg-surface-border'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${emailConfig.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </div>
        <p className="text-xs text-text-tertiary mb-4">
          Programa el envio automatico de reportes de actividad por correo electronico. Recibe resumenes diarios o semanales directamente en tu bandeja.
        </p>

        <div className="space-y-4">
          {/* SMTP Config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-tertiary uppercase block mb-1">Servidor SMTP</label>
              <input
                value={emailConfig.host}
                onChange={e => setEmailConfig(c => ({ ...c, host: e.target.value }))}
                placeholder="smtp.gmail.com"
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">Puerto</label>
                <input
                  type="number"
                  value={emailConfig.port}
                  onChange={e => setEmailConfig(c => ({ ...c, port: +e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-tertiary uppercase block mb-1">SSL/TLS</label>
                <div
                  onClick={() => setEmailConfig(c => ({ ...c, secure: !c.secure }))}
                  className={`w-full px-3 py-2 border rounded-lg text-xs font-medium cursor-pointer text-center transition-colors ${
                    emailConfig.secure ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-surface-base border-surface-border text-text-secondary'
                  }`}
                >
                  {emailConfig.secure ? 'Activado' : 'Desactivado'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-tertiary uppercase block mb-1">Usuario SMTP</label>
              <input
                value={emailConfig.user}
                onChange={e => setEmailConfig(c => ({ ...c, user: e.target.value }))}
                placeholder="tu-email@empresa.com"
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-tertiary uppercase block mb-1">Contrasena</label>
              <input
                type="password"
                value={emailConfig.pass}
                onChange={e => setEmailConfig(c => ({ ...c, pass: e.target.value }))}
                placeholder="App password"
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-tertiary uppercase block mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Programacion
              </label>
              <select
                value={emailConfig.schedule}
                onChange={e => setEmailConfig(c => ({ ...c, schedule: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
              >
                <option value="0 18 * * 1-5">Lunes a Viernes 6:00 PM</option>
                <option value="0 9 * * 1-5">Lunes a Viernes 9:00 AM</option>
                <option value="0 18 * * *">Todos los dias 6:00 PM</option>
                <option value="0 9 * * 1">Cada Lunes 9:00 AM (Semanal)</option>
                <option value="0 9 1 * *">Primer dia del mes 9:00 AM</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-text-tertiary uppercase block mb-1">Tipo de Reporte</label>
              <select
                value={emailConfig.reportType}
                onChange={e => setEmailConfig(c => ({ ...c, reportType: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand/50"
              >
                <option value="daily">Resumen Diario</option>
                <option value="weekly">Resumen Semanal</option>
                <option value="full">Reporte Completo</option>
              </select>
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="text-[10px] text-text-tertiary uppercase block mb-1">Destinatarios</label>
            <div className="flex gap-2 mb-2">
              <input
                value={newRecipient}
                onChange={e => setNewRecipient(e.target.value)}
                placeholder="correo@empresa.com"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newRecipient.includes('@')) {
                    setEmailConfig(c => ({ ...c, recipients: [...c.recipients, newRecipient] }));
                    setNewRecipient('');
                  }
                }}
                className="flex-1 px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50"
              />
              <button
                onClick={() => {
                  if (newRecipient.includes('@')) {
                    setEmailConfig(c => ({ ...c, recipients: [...c.recipients, newRecipient] }));
                    setNewRecipient('');
                  }
                }}
                className="px-3 py-2 bg-brand/10 text-brand border border-brand/20 rounded-lg text-xs font-semibold hover:bg-brand/20 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {emailConfig.recipients.map((email, i) => (
                <span key={i} className="flex items-center gap-1 bg-surface-base border border-surface-border rounded-lg px-2.5 py-1 text-[10px] text-text-secondary">
                  {email}
                  <button onClick={() => setEmailConfig(c => ({ ...c, recipients: c.recipients.filter((_, idx) => idx !== i) }))} className="text-text-tertiary hover:text-status-error">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-surface-border">
            <button
              onClick={async () => {
                setEmailSaving(true);
                try {
                  await api.post('/email-config', emailConfig);
                  setToast({ type: 'success', msg: 'Configuracion de email guardada' });
                } catch {
                  setToast({ type: 'error', msg: 'Error al guardar config de email' });
                } finally {
                  setEmailSaving(false);
                }
              }}
              disabled={emailSaving}
              className="flex items-center gap-1.5 px-3 py-2 bg-brand text-white rounded-lg text-xs font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {emailSaving ? 'Guardando...' : 'Guardar Email'}
            </button>
            <button
              onClick={async () => {
                setEmailTestSending(true);
                try {
                  await api.post('/email-config/test');
                  setToast({ type: 'success', msg: 'Email de prueba enviado' });
                } catch {
                  setToast({ type: 'error', msg: 'Error al enviar email de prueba' });
                } finally {
                  setEmailTestSending(false);
                }
              }}
              disabled={emailTestSending || !emailConfig.host}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {emailTestSending ? 'Enviando...' : 'Enviar Prueba'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
