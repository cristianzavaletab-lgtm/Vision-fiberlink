import { prisma } from '../prisma';

/**
 * Servicio de Auditoría
 * Registra acciones de usuarios y sistema para compliance.
 */

export async function createAuditLog(data: {
  companyId?: string;
  userId?: string;
  deviceId?: string;
  action: string;
  description: string;
  status?: string;
  ipAddress?: string;
}) {
  if (!prisma) return null;
  return prisma.auditLog.create({
    data: {
      companyId: data.companyId,
      userId: data.userId,
      deviceId: data.deviceId,
      action: data.action,
      description: data.description,
      status: data.status ?? 'success',
      ipAddress: data.ipAddress,
    },
  });
}

export async function getAuditLogs(filters: {
  companyId?: string;
  deviceId?: string;
  userId?: string;
  limit?: number;
}) {
  if (!prisma) return [];
  return prisma.auditLog.findMany({
    where: {
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.deviceId && { deviceId: filters.deviceId }),
      ...(filters.userId && { userId: filters.userId }),
    },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 50,
    include: { user: { select: { name: true, email: true } }, device: { select: { name: true } } },
  });
}
