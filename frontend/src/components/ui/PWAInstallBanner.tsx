import { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share, Plus, Monitor } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

const DISMISS_KEY = 'vc-pwa-banner-dismissed';
const DISMISS_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days before showing again

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, isIOSSafari, platform, installApp } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  // Check if previously dismissed (with expiry)
  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION) {
        setDismissed(true);
        return;
      }
      localStorage.removeItem(DISMISS_KEY);
    }
    // Delay showing the banner for a smoother UX (show after 2s)
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  const handleInstall = async () => {
    if (isIOSSafari) {
      setShowIOSGuide(true);
      return;
    }
    setInstalling(true);
    const success = await installApp();
    setInstalling(false);
    if (success) {
      setDismissed(true);
    }
  };

  // Don't show if: already installed, dismissed, or not installable
  if (isInstalled || dismissed || !isInstallable || !visible) return null;

  const platformIcon = () => {
    switch (platform) {
      case 'ios': return <Smartphone size={20} className="text-white" />;
      case 'android': return <Smartphone size={20} className="text-white" />;
      default: return <Monitor size={20} className="text-white" />;
    }
  };

  const platformText = () => {
    switch (platform) {
      case 'ios': return 'Instala la app en tu iPhone';
      case 'android': return 'Instala la app en tu celular';
      default: return 'Instala la app en tu equipo';
    }
  };

  // iOS Safari guide modal
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIOSGuide(false)} 
        />
        
        {/* Guide Card */}
        <div className="relative w-full max-w-sm bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-2xl animate-slide-from-bottom">
          {/* Close */}
          <button 
            onClick={() => setShowIOSGuide(false)}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-base text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>

          {/* Content */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/20">
              <Smartphone size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-bold text-text-primary">Instalar VisionControl</h3>
            <p className="text-sm text-text-secondary mt-1">Sigue estos pasos para agregar la app a tu pantalla de inicio</p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-brand">1</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                  Toca el boton <Share size={16} className="text-blue-400" /> Compartir
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">En la barra inferior de Safari</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-brand">2</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                  Selecciona <Plus size={14} className="text-text-secondary" /> "Agregar a inicio"
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">Desliza hacia abajo en el menu</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-brand">3</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Toca "Agregar"</p>
                <p className="text-xs text-text-tertiary mt-0.5">La app aparecera en tu pantalla de inicio</p>
              </div>
            </div>
          </div>

          {/* Done button */}
          <button
            onClick={() => { setShowIOSGuide(false); handleDismiss(); }}
            className="w-full mt-6 py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand-dark transition-colors active:scale-[0.97]"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed bottom-20 md:bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 
                  w-auto sm:w-[360px] 
                  rounded-2xl border border-surface-border 
                  bg-surface-elevated/95 backdrop-blur-2xl shadow-2xl shadow-black/20
                  transition-all duration-500 ease-out
                  ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
    >
      {/* Top gradient accent */}
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
      
      <div className="p-4">
        {/* Header with close */}
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shrink-0 shadow-lg shadow-brand/20">
            {platformIcon()}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-bold text-text-primary leading-tight">
              {platformText()}
            </p>
            <p className="text-xs text-text-secondary mt-0.5 leading-snug">
              Acceso directo, notificaciones y mejor rendimiento
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full 
                       text-text-tertiary hover:text-text-primary hover:bg-surface-base
                       transition-all duration-200 shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Install button */}
        <button
          onClick={handleInstall}
          disabled={installing}
          className="w-full mt-4 py-3 rounded-xl text-sm font-bold
                     bg-gradient-to-r from-brand to-brand-dark text-white
                     hover:from-brand-light hover:to-brand
                     active:scale-[0.97] transition-all duration-200 
                     shadow-lg shadow-brand/20
                     disabled:opacity-60 disabled:cursor-not-allowed
                     flex items-center justify-center gap-2"
        >
          <Download size={16} />
          {installing ? 'Instalando...' : isIOSSafari ? 'Ver instrucciones' : 'Descargar aplicacion'}
        </button>
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
