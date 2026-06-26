import axios from 'axios';

// Get URLs from env, fallback to single URL or localhost
const rawUrls = import.meta.env.VITE_SERVER_URLS || import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const SERVERS = rawUrls.split(',').map((u: string) => u.trim()).filter(Boolean);

let resolvedServerUrl: string | null = null;

/**
 * Pings a server to check if it's healthy.
 */
async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const res = await axios.get(`${url}/health`, { timeout: 5000 });
    return res.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Iterates over the available servers and returns the first healthy one.
 */
export async function getBestServerUrl(): Promise<string> {
  if (resolvedServerUrl) return resolvedServerUrl;
  
  if (SERVERS.length === 0) {
    throw new Error('No server URLs configured.');
  }

  for (const url of SERVERS) {
    const isHealthy = await checkServerHealth(url);
    if (isHealthy) {
      resolvedServerUrl = url;
      console.log(`[Resolver] Conectado al servidor activo: ${url}`);
      return url;
    }
  }

  // Si ninguno responde, devolvemos el primero como fallback para que falle limpiamente
  // o lance un error de red normal.
  console.warn('[Resolver] Ningún servidor de respaldo respondió. Usando el principal por defecto.');
  resolvedServerUrl = SERVERS[0];
  return resolvedServerUrl;
}

/**
 * Returns the currently resolved server URL synchronously.
 * Must be called after getBestServerUrl() has completed.
 */
export function getCurrentServerUrl(): string {
  return resolvedServerUrl || SERVERS[0];
}
