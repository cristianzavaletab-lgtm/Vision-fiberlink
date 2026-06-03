// Offline Cache Service
// Stores critical data locally so the app can show cached content when offline

const CACHE_PREFIX = 'vc-offline-';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours max cache age

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export const offlineCache = {
  /**
   * Save data to local cache
   */
  set<T>(key: string, data: T): void {
    try {
      const item: CacheItem<T> = { data, timestamp: Date.now() };
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(item));
    } catch (e) {
      // localStorage might be full, silently ignore
      console.warn('[OfflineCache] Could not save to localStorage:', e);
    }
  },

  /**
   * Get data from local cache (returns null if expired or not found)
   */
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;
      const item: CacheItem<T> = JSON.parse(raw);
      
      // Check if expired
      if (Date.now() - item.timestamp > CACHE_TTL) {
        localStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }
      return item.data;
    } catch {
      return null;
    }
  },

  /**
   * Get the timestamp of a cached item
   */
  getTimestamp(key: string): number | null {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;
      const item = JSON.parse(raw);
      return item.timestamp || null;
    } catch {
      return null;
    }
  },

  /**
   * Remove a cached item
   */
  remove(key: string): void {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  },

  /**
   * Clear all offline cache
   */
  clearAll(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  }
};
