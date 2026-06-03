import { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share, Plus, Monitor, Zap, Bell, Shield } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

const DISMISS_KEY = 'vc-pwa-banner-dismissed-session';

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, isIOSSafari, platform, installApp } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Clean up old localStorage key from previous version (was blocking banner permanently)
    localStorage.removeItem('vc-pwa-banner-dismissed');

    // Don't show if already installed as PWA
    if (isInstalled) return;

    // Only dismiss per session (sessionStorage) - shows again on new tab/visit
    const dismissedThisSession = sessionStorage.getItem(DISMISS_KEY);
    if (dismissedThisSession) {
      setDismissed(true);
      return;
    }

    // Show popup after a short delay for smooth UX
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [isInstalled]);

  const handleDismiss = () => {
    setDismissed(true);
    // Only persist for this session - next visit it shows again
    sessionStorage.setItem(DISMISS_KEY, 'true');
  };

  const handleInstall = async () => {
    if (isInstallable) {
      // Native install prompt available
      setInstalling(true);
      const success = await installApp();
      setInstalling(false);
      if (success) {
        setDismissed(true);
      }
    } else {
      // Show manual guide
      setShowGuide(true);
    }
  };

  // Don't show if installed or dismissed
  if (isInstalled || dismissed || !visible) return null;

  // Manual install guide
  if (showGuide) {
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowGuide(false)} />
        <div className="relative w-full max-w-sm bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-2xl animate-slide-from-bottom">
          <button 
            onClick={() => { setShowGuide(false); handleDismiss(); }}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-base text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/20">
              <Smartphone size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-bold text-text-primary">Instalar VisionControl</h3>
            <p className="text-sm text-text-secondary mt-1">Sigue estos pasos</p>
          </div>

          <div className="space-y-4">
            {isIOSSafari ? (
              <>
                <Step num={1} title={<>Toca <Share size={14} className="inline text-blue-400" /> Compartir</>} desc="Barra inferior de Safari" />
                <Step num={2} title={<><Plus size={14} className="inline" /> Agregar a inicio</>} desc="Busca esta opcion en el menu" />
                <Step num={3} title="Toca Agregar" desc="Listo! La app estara en tu inicio" />
              </>
            ) : (
              <>
                <Step num={1} title="Menu del navegador" desc="Los 3 puntos arriba a la derecha" />
                <Step num={2} title={<><Download size={14} className="inline" /> Instalar aplicacion</>} desc='O "Agregar a pantalla de inicio"' />
                <Step num={3} title="Confirmar" desc="La app se instalara automaticamente" />
              </>
            )}
          </div>

          <button
            onClick={() => { setShowGuide(false); handleDismiss(); }}
            className="w-full mt-6 py-3 rounded-xl bg-brand text-white text-sm font-bold active:scale-[0.97] transition-transform"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  // Main popup
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss} />
      
      {/* Popup Card */}
      <div className="relative w-full max-w-sm bg-surface-elevated border border-surface-border rounded-2xl shadow-2xl overflow-hidden animate-slide-from-bottom">
        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white/70 hover:text-white hover:bg-black/40 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Header gradient */}
        <div className="bg-gradient-to-br from-brand to-brand-dark px-6 pt-8 pb-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.1),transparent_70%)]" />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mx-auto mb-4">
              {platform === 'ios' || platform === 'android' 
                ? <Smartphone size={28} className="text-white" />
                : <Monitor size={28} className="text-white" />
              }
            </div>
            <h2 className="text-xl font-bold text-white">Descarga VisionControl</h2>
            <p className="text-white/70 text-sm mt-1">Instala la app en tu dispositivo</p>
          </div>
        </div>

        {/* Benefits */}
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-brand" />
            </div>
            <p className="text-sm text-text-secondary">Acceso instantaneo sin abrir el navegador</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Bell size={16} className="text-brand" />
            </div>
            <p className="text-sm text-text-secondary">Notificaciones de alertas en tiempo real</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Shield size={16} className="text-brand" />
            </div>
            <p className="text-sm text-text-secondary">Funciona offline con datos guardados</p>
          </div>
        </div>

        {/* Install Button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-4 rounded-xl text-base font-bold
                       bg-gradient-to-r from-brand to-brand-dark text-white
                       hover:from-brand-light hover:to-brand
                       active:scale-[0.97] transition-all duration-200 
                       shadow-lg shadow-brand/30
                       disabled:opacity-60
                       flex items-center justify-center gap-2"
          >
            <Download size={20} />
            {installing ? 'Instalando...' : 'Instalar Ahora'}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full mt-3 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ num, title, desc }: { num: number; title: React.ReactNode; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-brand">{num}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary flex items-center gap-1">{title}</p>
        <p className="text-xs text-text-tertiary mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

/**
 * Small inline install button for use in TopBar/Sidebar
 */
export function PWAInstallButton({ className = '' }: { className?: string }) {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [installing, setInstalling] = useState(false);

  if (!isInstallable || isInstalled) return null;

  const handleInstall = async () => {
    setInstalling(true);
    await installApp();
    setInstalling(false);
  };

  return (
    <button
      onClick={handleInstall}
      disabled={installing}
      title="Instalar VisionControl"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                  bg-gradient-to-r from-orange-500/20 to-orange-600/10
                  border border-orange-500/30 text-orange-400
                  hover:from-orange-500/30 hover:border-orange-500/50 hover:text-orange-300
                  transition-all duration-200 ${className}`}
    >
      <Download size={13} />
      {installing ? 'Instalando...' : 'Instalar app'}
    </button>
  );
}
