import { Router } from 'express';
import { prisma } from '../db/prisma';
import { authRequired, requirePermission } from '../middlewares/auth.middleware';
import { getDevicesByCompany, getDeviceById } from '../db/services/device.service';
import { getAuditLogs } from '../db/services/audit.service';
import { getActiveSessions } from '../db/services/session.service';
import { getDeviceMetrics } from '../db/services/metric.service';
import { getVapidPublicKey, sendPushNotificationToUser } from '../services/webpush';
import { pwaStore } from '../services/pwaStore';

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
// WEB PUSH NOTIFICATIONS ENDPOINTS
// ==========================================

// Get VAPID public key (needed by client to subscribe)
router.get('/webpush/vapid-public-key', (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// Subscribe to push notifications
router.post('/webpush/subscribe', (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription object is required' });
    }

    pwaStore.addPushSubscription(req.user!.userId, req.user!.companyId, subscription);
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
