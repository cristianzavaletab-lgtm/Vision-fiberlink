import { prisma } from '../prisma';

/**
 * Servicio de Dispositivos
 * Abstrae operaciones CRUD de devices con soporte multi-empresa.
 * Todas las funciones son no-op si Prisma no está inicializado.
 */

export async function upsertDevice(data: {
  id: string;
  companyId: string;
  name: string;
  os?: string;
  siteId?: string;
  ipAddress?: string;
  macAddress?: string;
}) {
  if (!prisma) return null;
  return prisma.device.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      os: data.os,
      status: 'online',
      ipAddress: data.ipAddress,
      updatedAt: new Date(),
    },
    create: {
      id: data.id,
      companyId: data.companyId,
      siteId: data.siteId,
      name: data.name,
      os: data.os,
      ipAddress: data.ipAddress,
      macAddress: data.macAddress,
      status: 'online',
    },
  });
}

export async function updateDeviceStatus(deviceId: string, status: string) {
  if (!prisma) return null;
  return prisma.device.update({
    where: { id: deviceId },
    data: { status, updatedAt: new Date() },
  }).catch(() => null); // Silently fail if device doesn't exist in DB yet
}

export async function getDevicesByCompany(companyId: string) {
  if (!prisma) return [];
  return prisma.device.findMany({
    where: { companyId },
    include: { agent: true, site: true },
    orderBy: { name: 'asc' },
  });
}

export async function getDeviceById(deviceId: string) {
  if (!prisma) return null;
  return prisma.device.findUnique({
    where: { id: deviceId },
    include: { agent: true, site: true, metrics: { take: 10, orderBy: { createdAt: 'desc' } } },
  });
}
