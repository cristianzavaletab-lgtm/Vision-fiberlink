import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { authRequired, requirePermission, requireRole } from '../middlewares/auth.middleware';
import { getDevicesByCompany, getDeviceById } from '../db/services/device.service';
import { getAuditLogs } from '../db/services/audit.service';
import { getActiveSessions } from '../db/services/session.service';
import { getDeviceMetrics } from '../db/services/metric.service';
import { getVapidPublicKey, sendPushNotificationToUser } from '../services/webpush';
import { pwaStore } from '../services/pwaStore';

// ── Zod schemas ──────────────────────────────────────────────────────────────
const CreateUserSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  email:    z.email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  roleId:   z.string().cuid('roleId inválido'),
});

const PushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys:     z.object({ p256dh: z.string(), auth: z.string() }).optional(),
  }),
});

/** Helper: parse Zod schema and return 400 on failure. */
function zodValidate<T>(schema: z.ZodType<T>, body: unknown, res: any): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Datos inválidos',
      fields: parsed.error.flatten().fieldErrors,
    });
    return null;
  }
  return parsed.data;
}
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

// Proteger todas las rutas de la API (si no hay prisma, el middleware hace fallback)
router.use(authRequired);

router.get('/devices', requirePermission('devices:view'), async (req, res) => {
  if (!prisma) {
    return res.json([]); // Mock/legacy could go here, but legacy uses sockets
  }
  const devices = await getDevicesByCompany(req.user!.companyId);
  res.json(devices);
});

router.get('/devices/:id', requirePermission('devices:view'), async (req, res) => {
  if (!prisma) return res.status(404).json({ error: 'Not implemented in legacy' });
  const device = await getDeviceById(req.params.id);
  
  // Basic multi-tenant check
  if (device && device.companyId !== req.user!.companyId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json(device);
});

router.get('/audit-logs', requirePermission('logs:view'), async (req, res) => {
  if (!prisma) return res.json([]);
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = await getAuditLogs({ companyId: req.user!.companyId, limit });
  res.json(logs);
});

router.get('/metrics/realtime', requirePermission('devices:view'), async (req, res) => {
  // General metrics for dashboard
  if (!prisma) return res.json([]);
  res.json({ message: 'Use socket for realtime, this is historical' });
});

router.get('/sessions', requirePermission('dashboard:view'), async (req, res) => {
  if (!prisma) return res.json([]);
  const sessions = await getActiveSessions();
  // Filter by company in memory or update service (simplification for MVP)
  const companySessions = sessions.filter(s => s.device.companyId === req.user!.companyId);
  res.json(companySessions);
});

// ==========================================
// REPORTS ENDPOINTS
// ==========================================

router.get('/reports', requirePermission('logs:view'), async (req, res) => {
  if (!prisma) return res.json([]);
  const logs = await getAuditLogs({ companyId: req.user!.companyId, limit: 200 });
  res.json(logs.map(log => ({
    date: log.createdAt,
    device: log.deviceId,
    deviceName: log.device?.name,
    type: log.action,
    description: log.description,
    status: log.status
  })));
});

router.get('/reports/summary', requirePermission('logs:view'), async (req, res) => {
  if (!prisma) return res.json({ totalIncidents: 0, criticalOpen: 0, offlineDevices: 0, sessionsToday: 0 });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [totalIncidents, criticalOpen, offlineDevices, sessionsToday] = await Promise.all([
    prisma.incident.count({ where: { device: { companyId: req.user!.companyId } } }),
    prisma.incident.count({ where: { severity: 'critical', status: 'open', device: { companyId: req.user!.companyId } } }),
    prisma.device.count({ where: { status: 'offline', companyId: req.user!.companyId } }),
    prisma.appSession.count({ where: { startedAt: { gte: today }, device: { companyId: req.user!.companyId } } })
  ]);
  
  res.json({ totalIncidents, criticalOpen, offlineDevices, sessionsToday });
});

router.get('/reports/daily', requirePermission('logs:view'), async (req, res) => {
  if (!prisma) return res.json(null);
  const { deviceId, date } = req.query;
  const targetDateStr = (date as string) || new Date().toISOString().slice(0, 10);
  const targetDateStart = new Date(targetDateStr);
  targetDateStart.setHours(0,0,0,0);
  const targetDateEnd = new Date(targetDateStart);
  targetDateEnd.setDate(targetDateEnd.getDate() + 1);

  const whereCondition: any = {
    startedAt: { gte: targetDateStart, lt: targetDateEnd },
    device: { companyId: req.user!.companyId }
  };
  if (deviceId) whereCondition.deviceId = deviceId;

  const sessions = await prisma.appSession.findMany({
    where: whereCondition,
    include: { device: { select: { name: true } } }
  });

  const hourlyBreakdown: Record<number, { hour: number; apps: Record<string, number>; totalSeconds: number }> = {};
  for (let h = 0; h < 24; h++) {
    hourlyBreakdown[h] = { hour: h, apps: {}, totalSeconds: 0 };
  }
  
  const appUsage: Record<string, number> = {};
  
  for (const session of sessions) {
    const startHour = session.startedAt.getHours();
    const duration = session.duration || (session.endedAt 
      ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
      : Math.round((Date.now() - session.startedAt.getTime()) / 1000));
    
    if (!hourlyBreakdown[startHour].apps[session.appName]) {
      hourlyBreakdown[startHour].apps[session.appName] = 0;
    }
    hourlyBreakdown[startHour].apps[session.appName] += duration;
    hourlyBreakdown[startHour].totalSeconds += duration;

    if (!appUsage[session.appName]) appUsage[session.appName] = 0;
    appUsage[session.appName] += duration;
  }

  res.json({
    date: targetDateStr,
    deviceId: deviceId || 'all',
    hourlyBreakdown: Object.values(hourlyBreakdown),
    appUsage: Object.entries(appUsage).map(([app, seconds]) => ({ app, seconds })).sort((a, b) => b.seconds - a.seconds),
    bootSessions: [], 
    sessions: sessions.map(s => ({
       appName: s.appName, 
       startedAt: s.startedAt, 
       endedAt: s.endedAt, 
       duration: s.duration, 
       deviceName: s.device.name 
    })),
    activities: [], 
    summary: {
      totalApps: Object.keys(appUsage).length,
      totalActiveSeconds: Object.values(appUsage).reduce((a, b) => a + b, 0),
      totalSessions: sessions.length,
      mostUsedApp: Object.entries(appUsage).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
    }
  });
});

// ==========================================
// USERS & ROLES ENDPOINTS
// ==========================================

router.get('/roles', requireRole(['SuperAdmin', 'Admin']), async (_req, res) => {
  if (!prisma) {
    return res.json([
      { id: 'legacy-superadmin', name: 'SuperAdmin' },
      { id: 'legacy-admin', name: 'Admin' },
      { id: 'legacy-operator', name: 'Operator' },
      { id: 'legacy-viewer', name: 'Viewer' },
    ]);
  }

  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  res.json(roles);
});

router.get('/users', requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
  if (!prisma) return res.json([]);

  const users = await prisma.user.findMany({
    where: { companyId: req.user!.companyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      isActive: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });

  res.json(users.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.name,
    isActive: user.isActive,
    createdAt: user.createdAt,
  })));
});

router.post('/users', requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
  if (!prisma) return res.status(503).json({ error: 'Users are unavailable in legacy mode' });

  const body = zodValidate(CreateUserSchema, req.body, res);
  if (!body) return;
  const { name, email, password, roleId } = body;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return res.status(400).json({ error: 'roleId no existe' });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
  const hashedPassword = await bcrypt.hash(password, rounds);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      roleId,
      companyId: req.user!.companyId,
    },
    select: {
      id: true, name: true, email: true, roleId: true,
      isActive: true, createdAt: true,
      role: { select: { name: true } },
    },
  });

  res.status(201).json({
    id: user.id, name: user.name, email: user.email,
    roleId: user.roleId, roleName: user.role.name,
    isActive: user.isActive, createdAt: user.createdAt,
  });
});

router.patch('/users/:id', requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
  if (!prisma) return res.status(503).json({ error: 'Users are unavailable in legacy mode' });

  const user = await prisma.user.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const data: { name?: string; roleId?: string; isActive?: boolean } = {};
  if (req.body.name !== undefined) data.name = `${req.body.name}`.trim();
  if (req.body.roleId !== undefined) {
    const role = await prisma.role.findUnique({ where: { id: req.body.roleId } });
    if (!role) return res.status(400).json({ error: 'Invalid roleId' });
    data.roleId = req.body.roleId;
  }
  if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      isActive: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    roleId: updated.roleId,
    roleName: updated.role.name,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  });
});

router.delete('/users/:id', requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
  if (!prisma) return res.status(503).json({ error: 'Users are unavailable in legacy mode' });
  if (req.params.id === req.user!.userId) {
    return res.status(400).json({ error: 'You cannot delete your own user' });
  }

  const user = await prisma.user.findFirst({
    where: { id: req.params.id, companyId: req.user!.companyId },
    select: { id: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  await prisma.user.delete({ where: { id: user.id } });
  res.status(204).send();
});

// ==========================================
// NOTIFICATIONS ENDPOINTS
// ==========================================

router.get('/notifications', requirePermission('dashboard:view'), async (req, res) => {
  if (!prisma) return res.json([]);

  const logs = await getAuditLogs({ companyId: req.user!.companyId, limit: 100 });
  res.json(logs.map(log => ({
    id: log.id,
    type: log.status === 'failed' || log.status === 'critical' ? 'alert' : 'system',
    title: log.action.replace(/_/g, ' '),
    message: log.description,
    deviceId: log.deviceId,
    deviceName: log.device?.name,
    read: true,
    createdAt: log.createdAt,
  })));
});

router.patch('/notifications/:id/read', requirePermission('dashboard:view'), async (_req, res) => {
  res.json({ success: true });
});

router.post('/notifications/mark-all-read', requirePermission('dashboard:view'), async (_req, res) => {
  res.json({ success: true });
});

router.delete('/notifications/read', requirePermission('dashboard:view'), async (_req, res) => {
  res.status(204).send();
});

// ==========================================
// WEB PUSH NOTIFICATIONS ENDPOINTS
// ==========================================

// Get VAPID public key (needed by client to subscribe)
router.get('/webpush/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// Subscribe to push notifications
router.post('/webpush/subscribe', (req, res) => {
  try {
    const body = zodValidate(PushSubscribeSchema, req.body, res);
    if (!body) return;
    pwaStore.addPushSubscription(req.user!.userId, req.user!.companyId, body.subscription);
    res.json({ success: true, message: 'Suscripcion push registrada' });
  } catch (error) {
    console.error('[WebPush Subscribe Error]:', error);
    res.status(500).json({ error: 'Error al registrar suscripcion' });
  }
});

// Unsubscribe from push notifications
router.post('/webpush/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }
    pwaStore.removePushSubscription(endpoint);
    res.json({ success: true, message: 'Suscripcion eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar suscripcion' });
  }
});

// Test push notification (for debugging)
router.post('/webpush/test', async (req, res) => {
  try {
    await sendPushNotificationToUser(
      req.user!.userId,
      'VisionControl - Test',
      'Las notificaciones push estan funcionando correctamente!'
    );
    res.json({ success: true, message: 'Notificacion de prueba enviada' });
  } catch (error) {
    console.error('[WebPush Test Error]:', error);
    res.status(500).json({ error: 'Error al enviar notificacion de prueba' });
  }
});

export default router;
