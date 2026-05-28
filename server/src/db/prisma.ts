import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton
 * - Solo se inicializa si DATABASE_URL está definida.
 * - Si no, el server arranca en modo Legacy (en memoria / Supabase).
 * - Evita múltiples instancias durante hot-reload en desarrollo.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient | null = null;

if (process.env.DATABASE_URL) {
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }

  console.log('✅ Prisma Client inicializado correctamente.');
} else {
  console.warn('⚠️  DATABASE_URL no definida. Prisma NO inicializado.');
  console.warn('⚠️  Operando en modo Legacy (en memoria / Supabase).');
}

export { prisma };
