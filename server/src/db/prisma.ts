import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton
 * - Solo se inicializa si DATABASE_URL está definida.
 * - Si no, el server arranca en modo Legacy (en memoria / Supabase).
 * - Evita múltiples instancias durante hot-reload en desarrollo.
 */

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient | null = null;

if (process.env.DATABASE_URL) {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
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
  console.warn('⚠️  DATABASE_URL no definida. Prisma NO inicializado.');
  console.warn('⚠️  Operando en modo Legacy (en memoria / Supabase).');
}

export { prisma };
