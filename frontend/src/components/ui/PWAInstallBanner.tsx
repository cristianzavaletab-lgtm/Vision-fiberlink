import { useState } from 'react';
import { Download, X, Smartphone, Bell } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

interface PWAInstallBannerProps {
  /** If true, only show the notification button (no install banner) */
  notificationsOnly?: boolean;
}

export function PWAInstallBanner({ notificationsOnly = false }: PWAInstallBannerProps) {
  const { isInstallable, isInstalled, notificationsGranted, installApp, requestNotificationPermission } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [notifRequesting, setNotifRequesting] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    await installApp();
    setInstalling(false);
  };

  const handleNotifRequest = async () => {
    setNotifRequesting(true);
    await requestNotificationPermission();
    setNotifRequesting(false);
  };

  // Don't show if already dismissed or already installed
  if (dismissed || isInstalled) return null;
  // Don't show if not installable and not needing notification prompt
  if (!isInstallable && (notificationsGranted || notificationsOnly)) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 
                 px-4 py-3 rounded-2xl border border-white/10 
                 bg-[#0d1117]/90 backdrop-blur-xl shadow-2xl
                 animate-in slide-in-from-bottom-4 duration-500"
      style={{ minWidth: 300, maxWidth: 480 }}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 
                      flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
        {isInstallable ? (
          <Smartphone size={18} className="text-white" />
        ) : (
          <Bell size={18} className="text-white" />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {isInstallable && (
          <p className="text-white text-xs font-semibold leading-snug">
            Instalar VisionControl
          </p>
        )}
        {!notificationsGranted && (
          <p className="text-white/60 text-[11px] leading-snug mt-0.5">
            {isInstallable
              ? 'Acceso rápido + notificaciones de alerta'
              : 'Activa notificaciones de monitoreo'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {!notificationsGranted && (
          <button
            onClick={handleNotifRequest}
            disabled={notifRequesting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                       bg-white/10 text-white/80 hover:bg-white/20 hover:text-white
                       transition-all duration-200 border border-white/10"
          >
            <Bell size={12} />
            {notifRequesting ? '...' : 'Notifs'}
          </button>
        )}

        {isInstallable && (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
                       bg-gradient-to-r from-orange-500 to-orange-600 text-white
                       hover:from-orange-400 hover:to-orange-500
                       transition-all duration-200 shadow-lg shadow-orange-500/30
                       disabled:opacity-60"
          >
            <Download size={12} />
            {installing ? 'Instalando...' : 'Instalar'}
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="w-7 h-7 flex items-center justify-center rounded-lg
                     text-white/40 hover:text-white/80 hover:bg-white/10
                     transition-all duration-200"
        >
          <X size={14} />
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
