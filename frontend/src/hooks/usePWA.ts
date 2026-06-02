import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UsePWAReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  notificationsGranted: boolean;
  installApp: () => Promise<boolean>;
  requestNotificationPermission: () => Promise<boolean>;
  sendLoginNotification: (userName: string) => void;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePWA(): UsePWAReturn {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(
    'Notification' in window && Notification.permission === 'granted'
  );

  useEffect(() => {
    // Detect if already installed (standalone mode)
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true;
      setIsInstalled(isStandalone);
    };
    checkInstalled();

    // Listen for the install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    // Listen for successful install
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPrompt = null;
      // Send notification confirming installation
      sendNotification(
        '¡VisionControl instalado! 🎉',
        'La aplicación se descargó correctamente. Accede desde tu escritorio o pantalla de inicio.',
        '/pwa-192x192.png'
      );
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * Trigger the native install prompt
   */
  const installApp = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      setIsInstallable(false);
      return choice.outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  /**
   * Request browser notification permission
   */
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      setNotificationsGranted(true);
      return true;
    }
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setNotificationsGranted(granted);
    return granted;
  }, []);

  /**
   * Internal helper: send a browser notification via Service Worker or fallback
   */
  const sendNotification = (title: string, body: string, icon?: string) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: icon || '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          vibrate: [200, 100, 200],
          tag: 'visioncontrol-login',
          renotify: true,
          data: { url: window.location.origin },
          actions: [
            { action: 'open', title: 'Abrir app' },
            { action: 'dismiss', title: 'Cerrar' },
          ],
        } as NotificationOptions);
      });
    } else {
      // Fallback: direct Notification API
      new Notification(title, {
        body,
        icon: icon || '/pwa-192x192.png',
      });
    }
  };

  /**
   * Send a welcome notification on login
   */
  const sendLoginNotification = useCallback(
    async (userName: string) => {
      // Request permission if not already granted
      if (Notification.permission !== 'granted') {
        const granted = await requestNotificationPermission();
        if (!granted) return;
      }

      const hour = new Date().getHours();
      const greeting =
        hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

      sendNotification(
        `${greeting}, ${userName} 👋`,
        'Sesión iniciada en VisionControl. Monitoreo activo y en tiempo real.',
        '/pwa-192x192.png'
      );
    },
    [requestNotificationPermission]
  );

  return {
    isInstallable,
    isInstalled,
    notificationsGranted,
    installApp,
    requestNotificationPermission,
    sendLoginNotification,
  };
}
