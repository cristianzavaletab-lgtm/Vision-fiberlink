// Custom Push Notification Handler for VisionControl PWA
// This file is imported by the Workbox-generated service worker

// Handle push notifications from server
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'VisionControl', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Nueva notificacion',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: data.vibrate || [200, 100, 200],
    tag: data.tag || 'visioncontrol-push',
    renotify: true,
    data: {
      url: data.data?.url || '/',
      ...data.data
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VisionControl', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    })
  );
});

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'vc-background-sync') {
    event.waitUntil(
      // Notify the app to process sync queue
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC_READY' });
        });
      })
    );
  }
});
