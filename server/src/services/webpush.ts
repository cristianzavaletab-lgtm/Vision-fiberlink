import webpush from 'web-push';
import { pwaStore } from './pwaStore';

let vapidKeys: { publicKey: string; privateKey: string };

// In-memory or env-based VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };
} else {
  // Generate keys dynamically if not provided in env (highly robust for local dev / quick deploy)
  console.log('[WebPush] Generando llaves VAPID dinamicas...');
  vapidKeys = webpush.generateVAPIDKeys();
}

// Initialize web-push
webpush.setVapidDetails(
  'mailto:support@visioncontrol.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export function getVapidPublicKey(): string {
  return vapidKeys.publicKey;
}

/**
 * Send a push notification to all subscribed devices of a user
 */
export async function sendPushNotificationToUser(userId: string, title: string, body: string, icon = '/pwa-192x192.png') {
  const subscriptions = pwaStore.getPushSubscriptionsByUser(userId);
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    title,
    body,
    icon,
    vibrate: [200, 100, 200],
    data: { url: '/' }
  });

  const promises = subscriptions.map(async (subItem) => {
    try {
      await webpush.sendNotification(subItem.subscription, payload);
    } catch (error: any) {
      // If subscription has expired or is invalid, remove it
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`[WebPush] Suscripcion expirada para usuario ${userId}. Eliminando...`);
        pwaStore.removePushSubscription(subItem.subscription.endpoint);
      } else {
        console.error('[WebPush] Error al enviar notificacion:', error);
      }
    }
  });

  await Promise.all(promises);
}

/**
 * Send a push notification to all subscribed devices of a company (e.g. all admins/technicians)
 */
export async function sendPushNotificationToCompany(companyId: string, title: string, body: string, icon = '/pwa-192x192.png') {
  const subscriptions = pwaStore.getPushSubscriptionsByCompany(companyId);
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    title,
    body,
    icon,
    vibrate: [200, 100, 200],
    data: { url: '/' }
  });

  const promises = subscriptions.map(async (subItem) => {
    try {
      await webpush.sendNotification(subItem.subscription, payload);
    } catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        pwaStore.removePushSubscription(subItem.subscription.endpoint);
      } else {
        console.error('[WebPush] Error al enviar notificacion a la empresa:', error);
      }
    }
  });

  await Promise.all(promises);
}
