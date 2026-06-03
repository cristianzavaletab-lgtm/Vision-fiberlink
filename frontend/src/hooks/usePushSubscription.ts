import { useState, useCallback } from 'react';
import { api } from '../services/api';

interface UsePushSubscriptionReturn {
  isSubscribed: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const [isSubscribed, setIsSubscribed] = useState(() => {
    return localStorage.getItem('vc-push-subscribed') === 'true';
  });

  const subscribe = useCallback(async (): Promise<boolean> => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] PushManager not supported');
        return false;
      }

      // Get VAPID public key from server
      const vapidRes = await api.get('/webpush/vapid-public-key');
      const vapidPublicKey = vapidRes.data.publicKey;

      if (!vapidPublicKey) {
        console.error('[Push] No VAPID public key returned from server');
        return false;
      }

      // Convert VAPID key to Uint8Array
      const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisuallyEnabled: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      } as any);

      // Send subscription to server
      await api.post('/webpush/subscribe', { subscription: subscription.toJSON() });

      localStorage.setItem('vc-push-subscribed', 'true');
      setIsSubscribed(true);
      console.log('[Push] Successfully subscribed to push notifications');
      return true;
    } catch (error) {
      console.error('[Push] Subscription error:', error);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await api.post('/webpush/unsubscribe', { endpoint: subscription.endpoint });
      }

      localStorage.removeItem('vc-push-subscribed');
      setIsSubscribed(false);
    } catch (error) {
      console.error('[Push] Unsubscribe error:', error);
    }
  }, []);

  return { isSubscribed, subscribe, unsubscribe };
}
