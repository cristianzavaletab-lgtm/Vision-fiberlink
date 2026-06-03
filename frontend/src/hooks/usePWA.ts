import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

interface UsePWAReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOSSafari: boolean;
  platform: Platform;
  notificationsGranted: boolean;
  installApp: () => Promise<boolean>;
  requestNotificationPermission: () => Promise<boolean>;
  sendLoginNotification: (userName: string) => void;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

export function usePWA(): UsePWAReturn {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform] = useState<Platform>(detectPlatform);
  const [iosSafari] = useState(isIOSSafari);
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

    // Listen for the install prompt (Android/Desktop Chrome)
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
      // Persist installed state
      localStorage.setItem('vc-pwa-installed', 'true');
      // Send notification confirming installation
      sendNotification(
        'VisionControl instalado!',
        'La aplicacion se descargo correctamente. Accede desde tu pantalla de inicio.',
        '/pwa-192x192.png'
      );
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // For iOS: mark as installable if in Safari and not standalone
    if (iosSafari && !window.matchMedia('(display-mode: standalone)').matches && !(navigator as any).standalone) {
      setIsInstallable(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [iosSafari]);

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
      if (choice.outcome === 'accepted') {
        localStorage.setItem('vc-pwa-installed', 'true');
      }
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
        hour < 12 ? 'Buenos dias' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

      sendNotification(
        `${greeting}, ${userName}`,
        'Sesion iniciada en VisionControl. Monitoreo activo y en tiempo real.',
        '/pwa-192x192.png'
      );
    },
    [requestNotificationPermission]
  );

  return {
    isInstallable,
    isInstalled,
    isIOSSafari: iosSafari,
    platform,
    notificationsGranted,
    installApp,
    requestNotificationPermission,
    sendLoginNotification,
  };
}
