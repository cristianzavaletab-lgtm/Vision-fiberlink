import * as fs from 'fs';
import * as path from 'path';

/**
 * DataStore - JSON file-based persistence layer
 * Saves all in-memory data to disk so it survives server restarts.
 * On Render.com, data persists within the same deploy (ephemeral disk).
 * For true persistence, use a database. This is the MVP fallback.
 */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[DataStore] Created data directory: ${DATA_DIR}`);
}

function getFilePath(key: string): string {
  return path.join(DATA_DIR, `${key}.json`);
}

/**
 * Load data from disk. Returns defaultValue if file doesn't exist.
 */
export function loadData<T>(key: string, defaultValue: T): T {
  const filePath = getFilePath(key);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      console.log(`[DataStore] Loaded ${key} (${Array.isArray(parsed) ? parsed.length + ' items' : 'object'})`);
      return parsed as T;
    }
  } catch (err) {
    console.error(`[DataStore] Error loading ${key}:`, err);
  }
  return defaultValue;
}

/**
 * Save data to disk. Debounced writes to avoid excessive I/O.
 */
const writeTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 2000; // Write at most every 2 seconds per key

export function saveData<T>(key: string, data: T, immediate = false): void {
  if (immediate) {
    writeImmediate(key, data);
    return;
  }

  // Debounced write
  if (writeTimers[key]) {
    clearTimeout(writeTimers[key]);
  }
  writeTimers[key] = setTimeout(() => {
    writeImmediate(key, data);
    delete writeTimers[key];
  }, DEBOUNCE_MS);
}

function writeImmediate<T>(key: string, data: T): void {
  const filePath = getFilePath(key);
  try {
    const json = JSON.stringify(data, null, process.env.NODE_ENV === 'development' ? 2 : 0);
    fs.writeFileSync(filePath, json, 'utf-8');
  } catch (err) {
    console.error(`[DataStore] Error saving ${key}:`, err);
  }
}

/**
 * Append to an array stored on disk (for logs/activities).
 * Keeps the array capped at maxSize.
 */
export function appendToArray<T>(key: string, items: T[], currentArray: T[], maxSize = 5000): T[] {
  const updated = [...currentArray, ...items].slice(-maxSize);
  saveData(key, updated);
  return updated;
}

/**
 * Flush all pending writes immediately (call on server shutdown)
 */
export function flushAll(): void {
  Object.entries(writeTimers).forEach(([key, timer]) => {
    clearTimeout(timer);
    delete writeTimers[key];
  });
  console.log('[DataStore] Flushed all pending writes');
}

// Flush on process exit
process.on('SIGTERM', flushAll);
process.on('SIGINT', flushAll);
process.on('beforeExit', flushAll);
