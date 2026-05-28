import { prisma } from '../prisma';

/**
 * Servicio de Métricas de Dispositivos
 * Almacena snapshots de CPU, RAM y app activa.
 */

export async function recordMetric(data: {
  deviceId: string;
  cpu: number;
  ram: number;
  activeApp?: string;
}) {
  if (!prisma) return null;
  return prisma.deviceMetric.create({
    data: {
      deviceId: data.deviceId,
      cpu: data.cpu,
      ram: data.ram,
      activeApp: data.activeApp,
    },
  });
}

export async function getDeviceMetrics(deviceId: string, limit: number = 100) {
  if (!prisma) return [];
  return prisma.deviceMetric.findMany({
    where: { deviceId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
