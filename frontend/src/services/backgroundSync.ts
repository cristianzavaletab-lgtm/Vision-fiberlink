// Background Sync Service
// Queues actions when offline and replays them when back online

import { api } from './api';

interface PendingAction {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  data?: any;
  createdAt: number;
}

const QUEUE_KEY = 'vc-sync-queue';

function getQueue(): PendingAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingAction[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add an action to the sync queue (called when offline)
 */
export function queueAction(url: string, method: 'POST' | 'PUT' | 'DELETE', data?: any): void {
  const queue = getQueue();
  queue.push({
    id: Math.random().toString(36).substring(2),
    url,
    method,
    data,
    createdAt: Date.now()
  });
  saveQueue(queue);
  console.log(`[BackgroundSync] Action queued: ${method} ${url}`);
}

/**
 * Process all pending actions in the queue
 * Called when the app comes back online
 */
export async function processSyncQueue(): Promise<{ processed: number; failed: number }> {
  const queue = getQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

  console.log(`[BackgroundSync] Processing ${queue.length} queued actions...`);
  
  let processed = 0;
  let failed = 0;
  const remainingQueue: PendingAction[] = [];

  for (const action of queue) {
    try {
      switch (action.method) {
        case 'POST':
          await api.post(action.url, action.data);
          break;
        case 'PUT':
          await api.put(action.url, action.data);
          break;
        case 'DELETE':
          await api.delete(action.url);
          break;
      }
      processed++;
    } catch (error) {
      // If server error (5xx), keep in queue for retry
      // If client error (4xx), discard (invalid action)
      const status = (error as any)?.response?.status;
      if (status && status >= 400 && status < 500) {
        // Client error, discard
        failed++;
      } else {
        // Server error or network issue, keep for retry
        remainingQueue.push(action);
        failed++;
      }
    }
  }

  saveQueue(remainingQueue);
  console.log(`[BackgroundSync] Done. Processed: ${processed}, Failed: ${failed}, Remaining: ${remainingQueue.length}`);
  return { processed, failed };
}

/**
 * Get the number of pending actions
 */
export function getPendingCount(): number {
  return getQueue().length;
}

/**
 * Clear the entire sync queue
 */
export function clearSyncQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

// Auto-process queue when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setTimeout(() => {
      processSyncQueue();
    }, 2000); // Wait 2s for connection to stabilize
  });
}
