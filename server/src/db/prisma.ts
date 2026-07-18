// Prisma Client import

/**
 * Prisma Client Singleton
 * - Solo se inicializa si DATABASE_URL está definida.
 * - Si no, el server arranca en modo Legacy (en memoria / Supabase).
 * - Evita múltiples instancias durante hot-reload en desarrollo.
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient | null = null;

function normalizeConnectionString(connectionString: string) {
  return connectionString.trim().replace(/^['"]|['"]$/g, '');
}

function createPoolConfig(connectionString: string): PoolConfig {
  try {
    const url = new URL(normalizeConnectionString(connectionString));
    const host = url.hostname.toLowerCase();
    const sslMode = (url.searchParams.get('sslmode') || '').toLowerCase();
    const requiresSsl = host.includes('supabase.com') || host.includes('pooler.supabase.com') || host.includes('cockroachlabs.cloud') || ['require', 'verify-ca', 'verify-full'].includes(sslMode);
    const strictSsl = sslMode === 'verify-full' || sslMode === 'verify-ca';

    // `pgbouncer=true` is a Prisma datasource hint, not a valid pg startup option.
    // The pg adapter receives the raw URL, so remove it before opening the pool.
    url.searchParams.delete('pgbouncer');

    return {
      connectionString: url.toString(),
      ssl: requiresSsl ? { rejectUnauthorized: strictSsl } : undefined,
    };
  } catch {
    return { connectionString: normalizeConnectionString(connectionString) };
  }
}

const configuredDatabaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || '';
const isPostgresUrl = /^postgres(ql)?:\/\//i.test(normalizeConnectionString(configuredDatabaseUrl));

if (configuredDatabaseUrl && isPostgresUrl) {
  if (!globalForPrisma.prisma) {
    const connectionString = configuredDatabaseUrl;
    const pool = new Pool(createPoolConfig(connectionString));
    const adapter = new PrismaPg(pool);
    
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
    });
  }
  prisma = globalForPrisma.prisma;

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }

  console.log('✅ Prisma Client (Adapter PG) inicializado correctamente.');
} else {
  if (configuredDatabaseUrl && !isPostgresUrl) {
    console.warn('⚠️  DATABASE_URL/DIRECT_URL no es PostgreSQL. Prisma NO inicializado.');
  } else {
    console.warn('⚠️  DATABASE_URL no definida. Prisma NO inicializado.');
  }
  console.warn('⚠️  Operando en modo Legacy (en memoria / Supabase).');
}

export { prisma };
