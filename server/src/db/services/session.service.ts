import { prisma } from '../prisma';

/**
 * Servicio de Sesiones Remotas
 * Rastrea inicio/fin de sesiones de control remoto y terminal.
 */

export async function startRemoteSession(data: {
  deviceId: string;
  userId: string;
  type: string; // 'remote_desktop' | 'terminal'
}) {
  if (!prisma) return null;
  return prisma.remoteSession.create({
    data: {
      deviceId: data.deviceId,
      userId: data.userId,
      type: data.type,
    },
  });
}

export async function endRemoteSession(sessionId: string) {
  if (!prisma) return null;
  return prisma.remoteSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  }).catch(() => null);
}

export async function getActiveSessions(deviceId?: string) {
  if (!prisma) return [];
  return prisma.remoteSession.findMany({
    where: {
      endedAt: null,
      ...(deviceId && { deviceId }),
    },
    include: {
      user: { select: { name: true, email: true } },
      device: { select: { name: true, os: true, companyId: true } },
    },
    orderBy: { startedAt: 'desc' },
  });
}
