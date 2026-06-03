import { useState, useEffect } from 'react';

interface UseOfflineReturn {
  isOffline: boolean;
  lastOnlineAt: number | null;
}

export function useOffline(): UseOfflineReturn {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(
    navigator.onLine ? Date.now() : null
  );

  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
      setLastOnlineAt(Date.now());
    };
    const goOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOffline, lastOnlineAt };
}
