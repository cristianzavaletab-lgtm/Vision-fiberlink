import { useState, useEffect } from 'react';
import { Save, RefreshCw, Smartphone, Settings as SettingsIcon, Shield, Radio, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

interface SettingsData {
  streamingFps: string;
  streamingQuality: string;
  agentHeartbeat: string;
  pwaInstallable: string;
}

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsData>({
    streamingFps: '15',
    streamingQuality: 'medium',
    agentHeartbeat: '5',
    pwaInstallable: 'true'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data) setSettings(res.data);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await api.patch('/settings', settings);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-slide-up relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Sistema</h3>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary mb-2 tracking-tight">Configuración</h1>
          <p className="text-text-secondary text-sm lg:text-base max-w-xl">
            Ajustes globales de agentes, telemetría y experiencia PWA.
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchSettings}
            className="flex items-center gap-2 bg-surface-elevated/50 backdrop-blur-xl border border-surface-border hover:bg-surface-highlight px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-colors text-text-primary"
          >
            <RefreshCw className="w-4 h-4 text-text-secondary" /> Recargar
          </button>
          <button 
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 bg-brand hover:bg-brand-light shadow-lg shadow-brand/20 text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            {isSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Guardado' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Streaming & Telemetry */}
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-border">
            <div className="p-2.5 rounded-xl bg-brand/10 border border-brand/20">
              <Radio className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Streaming & Telemetría</h3>
              <p className="text-[13px] text-text-tertiary">Ajustes del WebSocket y captura de pantalla</p>
            </div>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-2">Imágenes por Segundo (FPS)</label>
              <select 
                value={settings.streamingFps}
                onChange={(e) => setSettings({...settings, streamingFps: e.target.value})}
                className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-2.5 text-[13px] text-text-primary focus:border-brand/40 outline-none transition-all"
              >
                <option value="5">5 FPS (Ahorro Ancho de Banda)</option>
                <option value="15">15 FPS (Balanceado)</option>
                <option value="30">30 FPS (Alto Rendimiento)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-2">Calidad de Imagen</label>
              <select 
                value={settings.streamingQuality}
                onChange={(e) => setSettings({...settings, streamingQuality: e.target.value})}
                className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-2.5 text-[13px] text-text-primary focus:border-brand/40 outline-none transition-all"
              >
                <option value="low">Baja (Rápida)</option>
                <option value="medium">Media (Recomendado)</option>
                <option value="high">Alta (Requiere ancho de banda)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Agentes & Heartbeat */}
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-border">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <SettingsIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Agentes y Conexión</h3>
              <p className="text-[13px] text-text-tertiary">Intervalos de reporte y timeout</p>
            </div>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-2">Intervalo de Heartbeat (Segundos)</label>
              <input 
                type="number"
                value={settings.agentHeartbeat}
                onChange={(e) => setSettings({...settings, agentHeartbeat: e.target.value})}
                className="w-full bg-surface-base border border-surface-border rounded-lg px-4 py-2.5 text-[13px] text-text-primary focus:border-brand/40 outline-none transition-all"
              />
              <p className="text-[11px] text-text-tertiary mt-2">Cada cuánto tiempo los agentes envían métricas de CPU/RAM.</p>
            </div>
          </div>
        </div>
        
        {/* PWA & Instalación */}
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-border">
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
              <Smartphone className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Instalación PWA</h3>
              <p className="text-[13px] text-text-tertiary">Gestión de la aplicación progresiva</p>
            </div>
          </div>
          
          <div className="space-y-5">
            <div className="p-4 bg-surface-base rounded-xl border border-surface-border/50">
              <h4 className="text-[13px] font-semibold text-text-primary mb-1">Guía de Instalación</h4>
              <p className="text-[12px] text-text-secondary mb-3">
                VisionControl puede ser instalado localmente como aplicación nativa.
              </p>
              <ul className="text-[11px] text-text-tertiary space-y-1.5 ml-4 list-disc marker:text-brand">
                <li><strong className="text-text-secondary">Chrome / Edge:</strong> Presiona el botón "Instalar" en la barra de URL o usa el botón del menú superior.</li>
                <li><strong className="text-text-secondary">iOS / Safari:</strong> Toca el botón "Compartir" y selecciona "Agregar a inicio".</li>
                <li><strong className="text-text-secondary">Android:</strong> Selecciona "Agregar a la pantalla principal" en el menú del navegador.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Seguridad */}
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-surface-border">
            <div className="p-2.5 rounded-xl bg-status-error/10 border border-status-error/20">
              <Shield className="w-5 h-5 text-status-error" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">Seguridad de Acceso</h3>
              <p className="text-[13px] text-text-tertiary">Políticas de control remoto</p>
            </div>
          </div>
          
          <div className="space-y-5">
             <div className="flex items-center justify-between p-3 bg-surface-base rounded-xl border border-surface-border">
               <div>
                 <p className="text-[13px] font-medium text-text-primary">Confirmación de Control Remoto</p>
                 <p className="text-[11px] text-text-tertiary">Requerir permiso explícito del usuario para controlar su equipo.</p>
               </div>
               <div className="w-10 h-5 bg-brand rounded-full relative cursor-pointer">
                 <div className="absolute right-1 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
               </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
