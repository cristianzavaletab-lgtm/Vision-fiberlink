import { WifiOff, RefreshCw } from 'lucide-react';
import { useOffline } from '../../hooks/useOffline';

export function OfflineBanner() {
  const { isOffline } = useOffline();

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[999] bg-status-warning/90 backdrop-blur-sm px-4 py-2 flex items-center justify-center gap-2 text-black text-xs font-semibold safe-top animate-slide-from-bottom">
      <WifiOff size={14} />
      <span>Sin conexion - mostrando datos guardados</span>
      <button
        onClick={() => window.location.reload()}
        className="ml-2 p-1 rounded-md bg-black/10 hover:bg-black/20 transition-colors"
      >
        <RefreshCw size={12} />
      </button>
    </div>
  );
}
