import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import xss from 'xss';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') return xss(input);
  return input;
};

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';
import { createEnterpriseRoutes } from './routes/enterprise.routes';
import { sendPushNotificationToCompany } from './services/webpush';
import { initEmailService, getEmailConfig, updateEmailConfig, sendScheduledReport, sendTestEmail, setReportDataGetter } from './services/emailReports';
import { startDriveUploadJob, getAuthUrl, handleAuthCallback, getDriveStatus, listDeviceFolders, listDateFolders, listScreenshots, getScreenshotStream, getScreenshotsByDeviceAndDate, uploadDailyReport, getDriveFolderUrl } from './services/driveUploader';
import { prisma } from './db/prisma';
import { setupDb, getDefaultCompanyId } from './db/setup';
import helmet from 'helmet';
import compression from 'compression';

const app = express();
app.use(helmet());
app.use(compression());
const execFileAsync = promisify(execFile);
let lastPrismaDbPush: { ok: boolean; message: string; at: string } | null = null;

// Dummy functions to satisfy legacy code without doing disk IO
function saveData(key: string, data: any, immediate?: boolean) { }
function loadData<T>(key: string, defaultValue: T): T { return defaultValue; }

const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL, 'http://localhost:5173'] : [];
app.use(cors({
  origin: process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL ? false : allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

// ==========================================
// PUBLIC ENDPOINTS (no auth required)
// ==========================================
const BUILD_TIME = new Date().toISOString();

app.get(['/health', '/api/health'], async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  
  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import('./db/prisma');
      if (prisma) {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'connected';
      } else {
        dbStatus = 'legacy_mode (no_db)';
      }
    } catch (err) {
      dbStatus = 'error';
      console.error('[HealthCheck] DB Error:', err);
    }
  } else {
    dbStatus = 'legacy_mode (no_db)';
  }

  res.status(dbStatus === 'error' ? 503 : 200).json({
    status: dbStatus === 'error' ? 'UNHEALTHY' : 'OK',
    db: dbStatus,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/version', (req: Request, res: Response) => {
  res.json({
    appName: 'VisionControl',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    buildTime: BUILD_TIME
  });
});

// Auth routes (public login/register/refresh)
app.use('/api/auth', authRoutes);

function requireDashboardAccess(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.DASHBOARD_ACCESS_TOKEN;
  const expectedAgentToken = process.env.AGENT_TOKEN || process.env.AGENT_SECRET || process.env.DASHBOARD_ACCESS_TOKEN;
  if (!expectedToken) return next();

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerToken = req.headers['x-dashboard-token'];
  const agentHeaderToken = req.headers['x-agent-token'];
  const queryToken = req.query.token;
  const providedToken = Array.isArray(headerToken) ? headerToken[0] : headerToken || bearerToken || queryToken;
  const providedAgentToken = Array.isArray(agentHeaderToken) ? agentHeaderToken[0] : agentHeaderToken || bearerToken || queryToken;

  if (providedToken === expectedToken) return next();
  if (req.path.startsWith('/agent') && expectedAgentToken && providedAgentToken === expectedAgentToken) return next();
  return res.status(401).json({ error: req.path.startsWith('/agent') ? 'Agent token invalid or missing' : 'Dashboard access token required' });
}

app.use('/api', requireDashboardAccess);

// NOTE: app.use('/api', apiRoutes) is mounted AFTER in-memory routes
// so that sedes/reports/settings endpoints are handled first without
// going through apiRoutes' strict authRequired middleware.

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  maxHttpBufferSize: 1e8 
});

export const agentNs = io.of('/agent');
export const dashboardNs = io.of('/dashboard');

// In-memory storage for MVP (loaded from disk on startup, persisted on changes)
const connectedDevices = new Map<string, any>();
const socketToDevice = new Map<string, string>(); // Maps socket.id -> deviceId
const machineToAgentSocket = new Map<string, string>(); // Maps machineId -> active /agent socket.id
const machineAgentTokenHashes = new Map<string, string>(); // Maps machineId -> agent token hash learned from register/heartbeat
const memoryActivities: any[] = [];
const memoryIncidents: any[] = [];
const memorySettings: Record<string, any> = {
  fps: 15,
  quality: 60,
  heartbeatInterval: 10,
  requireConfirmation: true
};

interface Sede {
  id: string;
  name: string;
  location: string;
  devices: string[];
  createdAt: string;
}
const memorySedes: Sede[] = [];

// ─── Activity Tracking: App Sessions & Boot Sessions (in-memory + DB) ───
interface AppSessionEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  appName: string;
  startedAt: string;
  endedAt?: string;
  duration?: number;
}

interface BootSessionEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  bootAt: string;
  shutdownAt?: string;
  totalSeconds?: number;
}

const memoryAppSessions: AppSessionEntry[] = [];
const activeAppSessions = new Map<string, AppSessionEntry>();
const memoryBootSessions: BootSessionEntry[] = [];
const activeBootSessions = new Map<string, BootSessionEntry>();
const memoryExcelLogs: any[] = [];
const memoryRemoteSessions: any[] = [];
const memorySupportEvents: any[] = [];
const memoryPermissionRequests: any[] = [];
const memorySupportAlerts: any[] = [];
const memoryWorkdays: any[] = [];
const memoryDailyCloses: any[] = [];
const memoryScreenEvents: any[] = [];
const memorySmartReports: any[] = [];
const memoryReportReviews: any[] = [];
const memoryCommunicationSessions: any[] = [];
const memoryChatMessages: any[] = [];
const memoryVoiceSessions: any[] = [];

const SUPPORT_SESSION_STATUSES = ['PENDING', 'WAITING_PERMISSION', 'VIEW_ONLY', 'CONTROL_REQUESTED', 'CONTROL_ACTIVE', 'REJECTED', 'ENDED', 'ERROR'] as const;
type SupportSessionStatus = typeof SUPPORT_SESSION_STATUSES[number];

function nowIso() {
  return new Date().toISOString();
}

function hasAgentSocket(raw: any) {
  const socketId = machineToAgentSocket.get(raw?.id || raw?.machineId) || raw?.socketId;
  return Boolean(socketId && agentNs.sockets.has(socketId));
}

function normalizeMachine(raw: any) {
  const lastSeenNumber = typeof raw.lastSeen === 'number' ? raw.lastSeen : new Date(raw.lastSeen || Date.now()).getTime();
  return {
    id: raw.id,
    machineId: raw.id,
    name: raw.name || raw.machineName || raw.id,
    os: raw.os || 'Windows',
    status: raw.status || 'offline',
    online: raw.status === 'online',
    lastSeen: lastSeenNumber,
    lastSeenAt: new Date(lastSeenNumber).toISOString(),
    agentVersion: raw.agentVersion || '',
    hostname: raw.hostname || raw.name || '',
    windowsUser: raw.windowsUser || raw.localUser || '',
    localUser: raw.localUser || raw.windowsUser || '',
    companyArea: raw.companyArea || '',
    ipAddress: raw.ipAddress || raw.localIp || '',
    localIp: raw.localIp || raw.ipAddress || '',
    remoteSupportEnabled: raw.remoteSupportEnabled !== false,
    supportSocketConnected: hasAgentSocket(raw),
    supportSocketId: machineToAgentSocket.get(raw.id) || raw.socketId || null,
    remoteSupportActive: Boolean(raw.remoteSupportActive),
    remoteControlMode: raw.remoteControlMode || 'request_permission',
    screenViewEnabled: raw.screenViewEnabled !== false,
    remoteControlEnabled: raw.remoteControlEnabled !== false,
    pendingEvents: Number(raw.pendingEvents || 0),
    lastSync: raw.lastSync || null,
  };
}

function generateSessionToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function hashSessionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getRequestToken(req: Request) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const dashboardHeader = req.headers['x-dashboard-token'];
  const agentHeader = req.headers['x-agent-token'];
  const providedDashboard = Array.isArray(dashboardHeader) ? dashboardHeader[0] : dashboardHeader;
  const providedAgent = Array.isArray(agentHeader) ? agentHeader[0] : agentHeader;
  return `${providedAgent || providedDashboard || bearerToken || req.query.token || ''}`.trim();
}

function rememberAgentToken(machineId: string, token: string) {
  if (!machineId || !token) return;
  machineAgentTokenHashes.set(machineId, hashSessionToken(token));
}

function isRememberedAgentToken(machineId: string, token: string) {
  const rememberedHash = machineAgentTokenHashes.get(machineId);
  return Boolean(rememberedHash && token && rememberedHash === hashSessionToken(token));
}

function addSupportEvent(sessionId: string, type: string, message: string, data: any = {}) {
  const event = {
    id: `support_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    type: sanitizeInput(type),
    message: sanitizeInput(message),
    data,
    createdAt: nowIso(),
  };
  memorySupportEvents.unshift(event);
  while (memorySupportEvents.length > 5000) memorySupportEvents.pop();
  dashboardNs.emit('support:event', event);
  if (prisma) {
    prisma.auditLog.create({
      data: {
        action: `support:${type}`,
        description: event.message,
        deviceId: data.deviceId || data.machineId || undefined,
        status: type.includes('error') ? 'failed' : 'success',
      } as any,
    }).catch(() => {});
  }
  return event;
}

function updateSupportSession(sessionId: string, patch: Record<string, any>) {
  const session = memoryRemoteSessions.find((item) => item.id === sessionId || item.sessionId === sessionId);
  if (!session) return null;
  Object.assign(session, patch, { lastActivityAt: nowIso() });
  dashboardNs.emit('support:session-updated', session);
  return session;
}

function createSupportSession(machineId: string, requestedBy: string, quality = 'medium') {
  const machine = connectedDevices.get(machineId);
  if (!machine) return null;
  const sessionToken = generateSessionToken();
  const session = {
    id: `support_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: '',
    machineId,
    deviceId: machineId,
    machineName: machine.name,
    status: 'PENDING' as SupportSessionStatus,
    requestedBy: sanitizeInput(requestedBy || 'dashboard'),
    viewPermissionStatus: 'pending',
    controlPermissionStatus: 'not_requested',
    startedAt: nowIso(),
    endedAt: null,
    lastActivityAt: nowIso(),
    sessionTokenHash: hashSessionToken(sessionToken),
    quality: sanitizeInput(quality),
    errorMessage: '',
  };
  session.sessionId = session.id;
  memoryRemoteSessions.unshift(session);
  addSupportEvent(session.id, 'session_created', 'Sesión de soporte creada.', { machineId, requestedBy });
  return { session, sessionToken };
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function businessDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function sanitizeObject<T extends Record<string, any>>(input: T): T {
  const output: Record<string, any> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (typeof value === 'string') output[key] = sanitizeInput(value);
    else output[key] = value;
  }
  return output as T;
}

function latestOpenWorkday(machineId: string) {
  return memoryWorkdays.find((item) => item.machineId === machineId && !['closed', 'CLOSED'].includes(String(item.status)));
}

function pushBusinessEvent(event: string, payload: any) {
  dashboardNs.emit(event, payload);
  io.emit(event, payload);
}

function auditBusinessAction(action: string, description: string, deviceId?: string, details?: any) {
  logActivity({ id: makeId('audit'), deviceId, type: action, description, status: 'Automatico', severity: 'low', date: nowIso(), details });
  if (prisma) {
    prisma.auditLog.create({ data: { action, description, deviceId, details: details ? JSON.stringify(details) : undefined, status: 'success' } as any }).catch(() => {});
  }
}

// Keep last 7 days of data in memory (cleanup old entries)
const MAX_MEMORY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cleanOldMemoryData() {
  const cutoff = new Date(Date.now() - MAX_MEMORY_AGE_MS).toISOString();
  while (memoryAppSessions.length > 0 && memoryAppSessions[0].startedAt < cutoff) { memoryAppSessions.shift(); }
  while (memoryActivities.length > 5000) { memoryActivities.shift(); }
  while (memoryExcelLogs.length > 5000) { memoryExcelLogs.shift(); }
}

function logActivity(activity: any) {
  memoryActivities.push(activity);
  if (prisma) {
    prisma.auditLog.create({
      data: {
        action: activity.type,
        description: activity.description || '',
        deviceId: activity.deviceId,
        status: activity.severity === 'high' ? 'critical' : 'success',
        date: new Date(activity.date || Date.now())
      } as any
    }).catch(() => {});
  }
}

function ingestExcelBusinessEvents(events: any[]): number {
  let processed = 0;
  for (const rawEvent of events) {
    if (!rawEvent || !rawEvent.eventId) continue;
    if (memoryExcelLogs.some(log => log.eventId === rawEvent.eventId || log.id === rawEvent.eventId)) continue;

    const deviceId = sanitizeInput(rawEvent.machineId || rawEvent.deviceId || 'unknown');
    const deviceName = sanitizeInput(rawEvent.machineName || rawEvent.deviceName || connectedDevices.get(deviceId)?.name || deviceId);
    const fileName = sanitizeInput(rawEvent.fileName || 'archivo.xlsx');
    const sheetName = sanitizeInput(rawEvent.sheetName || rawEvent.changedSheets?.[0] || 'General');
    const action = sanitizeInput(rawEvent.eventType || rawEvent.action || 'excel_event');
    const createdAt = new Date(rawEvent.timestamp || Date.now()).toISOString();
    const details = JSON.stringify({
      eventId: rawEvent.eventId,
      filePath: rawEvent.filePath,
      detectedAmount: rawEvent.detectedAmount,
      currency: rawEvent.currency || 'PEN',
      oldValue: rawEvent.oldValue,
      newValue: rawEvent.newValue,
      createdRows: rawEvent.createdRows || 0,
      updatedRows: rawEvent.updatedRows || 0,
      deletedRows: rawEvent.deletedRows || 0,
      totalCollected: rawEvent.totalCollected || 0,
      totalIncome: rawEvent.totalIncome || 0,
      totalSales: rawEvent.totalSales || 0,
      changedSheets: rawEvent.changedSheets || [],
      importantCells: rawEvent.importantCells || [],
      fileSize: rawEvent.fileSize || 0,
      fileModifiedAt: rawEvent.fileModifiedAt || null,
    });

    const logEntry = {
      id: rawEvent.eventId,
      eventId: rawEvent.eventId,
      deviceId,
      deviceName,
      fileName,
      sheetName,
      action,
      details,
      naturalText: sanitizeInput(rawEvent.actionSummary || `Evento Excel registrado en ${fileName}`),
      createdAt,
      amount: Number(rawEvent.detectedAmount || 0),
      totalCollected: Number(rawEvent.totalCollected || 0),
      totalIncome: Number(rawEvent.totalIncome || 0),
      source: 'excel_agent',
    };

    memoryExcelLogs.push(logEntry);
    while (memoryExcelLogs.length > 5000) memoryExcelLogs.shift();
    broadcastToDashboards('excel-audit-log', logEntry);

    if (prisma) {
      prisma.auditLog.create({
        data: {
          deviceId,
          action,
          description: logEntry.naturalText,
          details,
          status: 'success',
          date: new Date(createdAt),
        } as any
      }).catch(() => {});
    }
    processed++;
  }
  return processed;
}

// Run cleanup every hour
setInterval(cleanOldMemoryData, 60 * 60 * 1000);

// Periodic save of high-frequency data (activities, sessions) every 30 seconds
setInterval(() => {
  saveData('activities', memoryActivities);
  saveData('appSessions', memoryAppSessions);
  saveData('bootSessions', memoryBootSessions);
}, 30000);

function closeAppSession(deviceId: string) {
  const current = activeAppSessions.get(deviceId);
  if (current) {
    current.endedAt = new Date().toISOString();
    current.duration = Math.round((new Date(current.endedAt).getTime() - new Date(current.startedAt).getTime()) / 1000);
    activeAppSessions.delete(deviceId);
    if (prisma && current.id.startsWith('db_')) {
      prisma.appSession.update({ where: { id: current.id.replace('db_', '') }, data: { endedAt: new Date(current.endedAt), duration: current.duration } }).catch(() => {});
    }
  }
}

function startAppSession(deviceId: string, deviceName: string, appName: string): AppSessionEntry {
  closeAppSession(deviceId); // Close previous if exists
  const session: AppSessionEntry = {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    deviceName,
    appName,
    startedAt: new Date().toISOString(),
  };
  if (prisma) {
    prisma.appSession.create({ data: { deviceId, appName, startedAt: new Date(session.startedAt) } }).then(dbSess => {
      session.id = `db_${dbSess.id}`;
    }).catch(() => {});
  }
  memoryAppSessions.push(session);
  activeAppSessions.set(deviceId, session);
  saveData('appSessions', memoryAppSessions);
  return session;
}

function startBootSession(deviceId: string, deviceName: string): BootSessionEntry {
  const existing = activeBootSessions.get(deviceId);
  if (existing) {
    existing.shutdownAt = new Date().toISOString();
    existing.totalSeconds = Math.round((new Date(existing.shutdownAt).getTime() - new Date(existing.bootAt).getTime()) / 1000);
    if (prisma && existing.id.startsWith('db_')) {
      prisma.deviceBootSession.update({ where: { id: existing.id.replace('db_', '') }, data: { shutdownAt: new Date(existing.shutdownAt), totalSeconds: existing.totalSeconds } }).catch(() => {});
    }
  }
  const session: BootSessionEntry = {
    id: `boot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    deviceName,
    bootAt: new Date().toISOString(),
  };
  if (prisma) {
    prisma.deviceBootSession.create({ data: { deviceId, bootAt: new Date(session.bootAt) } }).then(dbSess => {
      session.id = `db_${dbSess.id}`;
    }).catch(() => {});
  }
  memoryBootSessions.push(session);
  activeBootSessions.set(deviceId, session);
  saveData('bootSessions', memoryBootSessions);
  return session;
}

function closeBootSession(deviceId: string) {
  const session = activeBootSessions.get(deviceId);
  if (session) {
    session.shutdownAt = new Date().toISOString();
    session.totalSeconds = Math.round((new Date(session.shutdownAt).getTime() - new Date(session.bootAt).getTime()) / 1000);
    activeBootSessions.delete(deviceId);
    if (prisma && session.id.startsWith('db_')) {
      prisma.deviceBootSession.update({ where: { id: session.id.replace('db_', '') }, data: { shutdownAt: new Date(session.shutdownAt), totalSeconds: session.totalSeconds } }).catch(() => {});
    }
    
    // Upload daily report to Drive when device disconnects
    const device = connectedDevices.get(deviceId);
    const deviceName = device?.name || session.deviceName || deviceId;
    const today = new Date().toISOString().split('T')[0];
    
    // Gather today's app sessions for this device
    const todaySessions = memoryAppSessions
      .filter(s => s.deviceId === deviceId && s.startedAt.startsWith(today))
      .map(s => ({
        app: s.appName,
        from: new Date(s.startedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        to: s.endedAt ? new Date(s.endedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'activo',
        durationSec: s.duration || 0,
      }));

    // Gather today's boot sessions
    const todayBoots = memoryBootSessions
      .filter(b => b.deviceId === deviceId && b.bootAt.startsWith(today))
      .map(b => ({
        bootAt: new Date(b.bootAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        shutdownAt: b.shutdownAt ? new Date(b.shutdownAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null,
        totalSeconds: b.totalSeconds || 0,
      }));

    const dailyReport = {
      device: deviceName,
      deviceId,
      date: today,
      bootAt: session.bootAt,
      shutdownAt: session.shutdownAt,
      totalHours: Math.round((session.totalSeconds || 0) / 3600 * 100) / 100,
      appSessions: todaySessions,
      bootSessions: todayBoots,
      totalAppChanges: todaySessions.length,
      generatedAt: new Date().toISOString(),
    };

    uploadDailyReport(deviceName, dailyReport).catch(() => {});
  }
}

const AGENT_TIMEOUT_MS = 15000; // 15 segundos sin reportarse = offline

// ─── Alert Rules System ───
interface AlertRule {
  id: string;
  name: string;
  type: 'cpu_high' | 'ram_high' | 'offline_timeout' | 'blocked_app' | 'custom';
  condition: {
    metric?: string;
    operator: '>' | '<' | '==' | 'contains';
    value: number | string;
    duration?: number; // seconds the condition must persist
  };
  action: 'notify' | 'block' | 'log' | 'notify_and_log';
  enabled: boolean;
  createdAt: string;
}

let memoryAlertRules: AlertRule[] = [];

// Track how long a condition has persisted per device
const alertConditionTimers = new Map<string, Map<string, number>>();

// ─── Blocked Apps System ───
interface BlockedApp {
  id: string;
  name: string;
  action: 'kill' | 'notify' | 'log';
  enabled: boolean;
  createdAt: string;
}

let memoryBlockedApps: BlockedApp[] = [];

// ─── Screenshot History (mini-cache for quick timeline preview, Drive handles long-term storage) ───
interface ScreenshotRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  image: string; // base64 (thumbnail quality)
  timestamp: string;
}

const screenshotHistory: ScreenshotRecord[] = [];

// ─── Alert Rule Evaluation ───
function evaluateAlertRules(deviceId: string, device: any) {
  if (!alertConditionTimers.has(deviceId)) {
    alertConditionTimers.set(deviceId, new Map());
  }
  const timers = alertConditionTimers.get(deviceId)!;
  const now = Date.now();

  for (const rule of memoryAlertRules) {
    if (!rule.enabled) continue;

    let conditionMet = false;

    if (rule.type === 'cpu_high' && rule.condition.metric === 'cpu') {
      conditionMet = device.cpu > (rule.condition.value as number);
    } else if (rule.type === 'ram_high' && rule.condition.metric === 'ram') {
      conditionMet = device.ram > (rule.condition.value as number);
    } else if (rule.type === 'blocked_app') {
      // Check against blocked apps list
      const blockedApp = memoryBlockedApps.find(b => 
        b.enabled && device.activeApp?.toLowerCase().includes(b.name.toLowerCase())
      );
      conditionMet = !!blockedApp;
    }

    if (conditionMet) {
      if (!timers.has(rule.id)) {
        timers.set(rule.id, now);
      }
      const elapsed = (now - timers.get(rule.id)!) / 1000;
      const requiredDuration = rule.condition.duration || 0;

      if (elapsed >= requiredDuration) {
        // Trigger alert!
        const alertId = `alert_${now}_${rule.id}`;
        const incident = {
          id: alertId,
          deviceId,
          deviceName: device.name,
          type: rule.type,
          severity: 'high',
          status: 'abierta',
          description: `[${rule.name}] ${device.name}: ${rule.condition.metric || 'app'} ${rule.condition.operator} ${rule.condition.value}`,
          date: new Date().toISOString(),
          ruleId: rule.id,
        };

        // Don't spam: only alert once per 5 minutes per rule per device
        const recentAlert = memoryIncidents.find(i => 
          (i as any).ruleId === rule.id && i.deviceId === deviceId && 
          (now - new Date(i.date).getTime()) < 300000
        );
        if (!recentAlert) {
          memoryIncidents.push(incident);
          if (prisma) {
            prisma.incident.create({
              data: { deviceId, type: incident.type, severity: incident.severity, status: incident.status, description: incident.description, date: new Date(incident.date) } as any
            }).catch(() => {});
          }
          broadcastToDashboards('incident-log', incident);
          broadcastToDashboards('alert-triggered', { rule, device, incident });
          
          if (rule.action === 'notify' || rule.action === 'notify_and_log') {
            sendPushNotificationToCompany('legacy', `Alerta: ${rule.name}`, incident.description).catch(() => {});
          }

          // If blocked app and action is 'block', notify agent to kill it
          if (rule.type === 'blocked_app') {
            const blockedApp = memoryBlockedApps.find(b => 
              b.enabled && device.activeApp?.toLowerCase().includes(b.name.toLowerCase())
            );
            if (blockedApp && blockedApp.action === 'kill') {
              const agentSocket = getAgentSocket(deviceId);
              if (agentSocket) {
                agentSocket.emit('app:kill', { appName: blockedApp.name, pattern: blockedApp.name });
              }
            }
          }
        }
        // Reset timer so it can fire again after cooldown
        timers.delete(rule.id);
      }
    } else {
      // Condition not met, reset timer
      timers.delete(rule.id);
    }
  }
}

// Helper: find agent socket by deviceId. The dedicated map survives HTTP heartbeat/register updates.
function getAgentSocket(deviceId: string) {
  const mappedSocketId = machineToAgentSocket.get(deviceId);
  if (mappedSocketId) {
    const mappedSocket = agentNs.sockets.get(mappedSocketId);
    if (mappedSocket) return mappedSocket;
    machineToAgentSocket.delete(deviceId);
  }
  const device = connectedDevices.get(deviceId);
  if (device && device.socketId) {
    return agentNs.sockets.get(device.socketId) || io.sockets.sockets.get(device.socketId);
  }
  // Fallback: try direct lookup (for legacy agents where deviceId === socket.id)
  return io.sockets.sockets.get(deviceId) || agentNs.sockets.get(deviceId);
}

// Helper para emitir a ambos (legacy y dashboard)
function broadcastToDashboards(event: string, data: any) {
  let companyId: string | undefined;
  
  // Inferencia de companyId para ruteo de salas (Rooms)
  if (data && data.deviceId) {
    companyId = (connectedDevices.get(data.deviceId) as any)?.companyId;
  } else if (data && data.id && connectedDevices.has(data.id)) {
    companyId = (connectedDevices.get(data.id) as any)?.companyId;
  } else if (Array.isArray(data) && data.length > 0) {
    // Si es un array de dispositivos, podríamos no tener un solo companyId, 
    // pero si filtramos los updates por compañía en vez de mandar todo:
    // Por ahora, si es array, lo manejaremos en la emisión específica.
  }

  if (companyId) {
    io.of('/dashboard').to(`company_${companyId}`).emit(event, data);
  } else {
    io.of('/dashboard').emit(event, data); // Fallback to all (New clients)
  }
  
  io.emit(event, data); // Legacy clients
}

// Monitor de estado offline
setInterval(() => {
  const now = Date.now();
  let statusChanged = false;
  const offlineDeviceNames: string[] = [];
  
  for (const [id, device] of connectedDevices.entries()) {
    if (device.status === 'online' && (now - device.lastSeen) > AGENT_TIMEOUT_MS) {
      console.log(`[Heartbeat] Dispositivo ${device.name} pasó a OFFLINE (timeout)`);
      device.status = 'offline';
      statusChanged = true;
      offlineDeviceNames.push(device.name);
      
      if (prisma) {
        prisma.device.update({ where: { id }, data: { status: 'offline', updatedAt: new Date() } }).catch(() => {});
      }
    }
  }
  if (statusChanged) {
    broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
    
    // Send push notification for offline devices
    const message = offlineDeviceNames.length === 1
      ? `${offlineDeviceNames[0]} se ha desconectado`
      : `${offlineDeviceNames.length} dispositivos se desconectaron`;
    
    // Send to all companies (in production, filter by device->company mapping)
    sendPushNotificationToCompany('legacy', 'Dispositivo Offline', message).catch(() => {});
  }
}, 5000);

// ==========================================
// 1. NAMESPACE: /agent (Nuevos Agentes)
// ==========================================

const EXPECTED_AGENT_SECRET = process.env.AGENT_TOKEN || process.env.AGENT_SECRET || '';

agentNs.use((socket, next) => {
  const token = `${socket.handshake.auth?.token || socket.handshake.query?.token || ''}`.trim();
  const machineId = `${socket.handshake.auth?.machineId || socket.handshake.query?.machineId || socket.handshake.query?.deviceId || ''}`.trim();
  const dashboardAccessToken = process.env.DASHBOARD_ACCESS_TOKEN;
  if ((EXPECTED_AGENT_SECRET && token === EXPECTED_AGENT_SECRET) || (dashboardAccessToken && token === dashboardAccessToken)) {
    return next();
  }

  if (!EXPECTED_AGENT_SECRET && !dashboardAccessToken && token) {
    if (!machineId || !machineAgentTokenHashes.has(machineId) || isRememberedAgentToken(machineId, token)) {
      console.warn('[Security] AGENT_TOKEN/AGENT_SECRET no configurado en Render; aceptando agente con token no vacío y registrando hash por máquina. Configura AGENT_TOKEN en producción.');
      return next();
    }
  }

  if (machineId && isRememberedAgentToken(machineId, token)) return next();

  console.warn(`[Security] Bloqueada conexión no autorizada al agente: token inválido para ${machineId || 'machineId desconocido'}`);
  return next(new Error('Authentication error: invalid token'));
});

app.post('/api/admin/db-push', requireDashboardAccess, async (_req: Request, res: Response) => {
  const result = await syncPrismaSchemaOnBoot();
  res.status(result.ok ? 200 : 500).json(result);
});

app.get('/api/admin/db-push', requireDashboardAccess, (_req: Request, res: Response) => {
  res.json(lastPrismaDbPush || { ok: false, message: 'No db push executed yet', at: null });
});

agentNs.on('connection', (socket) => {
  console.log(`[NS: /agent] Agente conectado (Autenticado): ${socket.id}`);

  socket.on('agent:register', async (data) => {
    data.name = sanitizeInput(data.name);
    data.os = sanitizeInput(data.os);
    if (data.deviceId) data.deviceId = sanitizeInput(data.deviceId);
    console.log(`[NS: /agent] agent:register -> ${data.name} (device: ${data.deviceId})`);
    
    const deviceId = data.deviceId || socket.id; // Fallback for old agents
    socketToDevice.set(socket.id, deviceId);
    machineToAgentSocket.set(deviceId, socket.id);
    const existingDevice = connectedDevices.get(deviceId) || {};

    connectedDevices.set(deviceId, {
      ...existingDevice,
      id: deviceId,
      name: data.name,
      os: data.os,
      status: 'online',
      lastSeen: Date.now(),
      socketId: socket.id,
      cpu: 0,
      ram: 0,
      activeApp: '',
      companyId: getDefaultCompanyId(),
      hostname: sanitizeInput(data.hostname || data.name || ''),
      windowsUser: sanitizeInput(data.windowsUser || data.localUser || ''),
      localUser: sanitizeInput(data.localUser || data.windowsUser || ''),
      localIp: sanitizeInput(data.localIp || data.ipAddress || socket.handshake.address || ''),
      ipAddress: sanitizeInput(data.ipAddress || data.localIp || socket.handshake.address || ''),
      companyArea: sanitizeInput(data.companyArea || ''),
      agentVersion: sanitizeInput(data.agentVersion || ''),
      mode: sanitizeInput(data.mode || 'excel_audit_remote_support'),
      remoteSupportEnabled: data.remoteSupportEnabled !== false,
      supportSocketConnected: true,
      remoteSupportActive: Boolean(data.remoteSupportActive),
      remoteControlMode: sanitizeInput(data.remoteControlMode || 'request_permission'),
      screenViewEnabled: data.screenViewEnabled !== false,
      remoteControlEnabled: data.remoteControlEnabled !== false,
    });
    broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
    
    // Notification: device connected
    addNotification('device_online', 'Dispositivo conectado', `${data.name} se conecto al sistema`, deviceId, data.name);
    
    // Start boot session tracking
    const bootSession = startBootSession(deviceId, data.name);
    broadcastToDashboards('boot-session', bootSession);
    
    // Send initial settings to the registered agent
    socket.emit('settings:init', {
      fps: parseInt(memorySettings.fps) || 15,
      quality: parseInt(memorySettings.quality) || 60,
      heartbeatInterval: parseInt(memorySettings.heartbeatInterval) || 10,
    });
    
    if (prisma) {
      prisma.device.upsert({
        where: { id: deviceId },
        update: { name: data.name, os: data.os, status: 'online', ipAddress: data.ipAddress || data.localIp || socket.handshake.address || null, updatedAt: new Date() },
        create: { id: deviceId, name: data.name, os: data.os, status: 'online', ipAddress: data.ipAddress || data.localIp || socket.handshake.address || null, companyId: getDefaultCompanyId() }
      }).catch(err => console.error('[DB] Error upserting device', err));
    }
  });

  // Handle boot event from agent (tracks system uptime from actual boot time)
  socket.on('agent:boot', (data: { deviceId: string; bootTime: string; uptime: number; hostname: string }) => {
    data.hostname = sanitizeInput(data.hostname);
    const deviceId = socketToDevice.get(socket.id) || sanitizeInput(data.deviceId);
    const device = connectedDevices.get(deviceId);
    if (device) {
      device.bootTime = data.bootTime;
      device.uptime = data.uptime;
      
      // Log boot event as activity
      const activity = {
        id: `boot_${Date.now()}`,
        deviceId,
        deviceName: device.name,
        type: 'Sistema',
        description: `Equipo encendido desde ${new Date(data.bootTime).toLocaleTimeString('es-CO')} (uptime: ${Math.round(data.uptime / 60)} min)`,
        status: 'Automatico',
        severity: 'low',
        date: new Date().toISOString()
      };
      logActivity(activity);
      broadcastToDashboards('activity-log', activity);
    }
  });

  socket.on('agent:heartbeat', async (data) => {
    // data: { cpu: number, ram: number, activeApp: string }
    data.activeApp = sanitizeInput(data.activeApp);
    const deviceId = socketToDevice.get(socket.id);
    if (!deviceId) return;
    
    const device = connectedDevices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      device.status = 'online';
      device.cpu = data.cpu;
      device.ram = data.ram;
      device.remoteSupportEnabled = data.remoteSupportEnabled !== undefined ? data.remoteSupportEnabled !== false : device.remoteSupportEnabled;
      device.remoteSupportActive = data.remoteSupportActive !== undefined ? Boolean(data.remoteSupportActive) : device.remoteSupportActive;
      device.pendingEvents = Number(data.pendingEvents ?? device.pendingEvents ?? 0);
      device.lastSync = data.lastSync || device.lastSync || null;
      
      if (data.activeApp && data.activeApp !== device.activeApp) {
        const previousApp = device.activeApp;
        device.activeApp = data.activeApp;
        
        // Track app session (close previous, start new)
        const appSession = startAppSession(deviceId, device.name, data.activeApp);
        
        const activity = { 
          id: Date.now().toString(), 
          deviceId: deviceId, 
          deviceName: device.name, 
          type: 'Actividad', 
          description: `Cambio a: ${data.activeApp}`, 
          previousApp: previousApp || null,
          status: 'Automatico', 
          severity: 'low', 
          date: new Date().toISOString(),
          appSession: appSession
        };
        logActivity(activity);
        
        broadcastToDashboards('activity-log', activity);
        dashboardNs.to(`device_${deviceId}`).emit('device:activity', activity);

        // Capturas/OCR legacy desactivados. La auditoría Excel usa eventos de archivos autorizados.
      }
      
      if (device.cpu > 80 && !device.cpuAlert) {
         device.cpuAlert = true;
         const incident = { id: Date.now().toString(), deviceId: deviceId, deviceName: device.name, type: 'high_cpu', severity: 'high', status: 'abierta', description: `CPU al ${Math.round(device.cpu)}%`, date: new Date().toISOString() };
         memoryIncidents.push(incident);
         if (prisma) {
           prisma.incident.create({
             data: { deviceId, type: incident.type, severity: incident.severity, status: incident.status, description: incident.description, date: new Date(incident.date) } as any
           }).catch(() => {});
         }
         broadcastToDashboards('incident-log', incident);
         dashboardNs.to(`device_${deviceId}`).emit('device:incident', incident);
         
         // Push notification for high CPU incident
         sendPushNotificationToCompany('legacy', 'Alerta CPU Alto', `${device.name}: CPU al ${Math.round(device.cpu)}%`).catch(() => {});
         
      } else if (device.cpu <= 80) {
         device.cpuAlert = false;
      }

      // Optimize: Only broadcast specific heartbeat update instead of full list to save bandwidth, unless using legacy
      io.emit('devices-update', Array.from(connectedDevices.values())); // Legacy
      dashboardNs.emit('devices-update', Array.from(connectedDevices.values()));

      // Evaluate alert rules on every heartbeat
      evaluateAlertRules(deviceId, device);

      // Check blocked apps
      if (device.activeApp) {
        const blockedApp = memoryBlockedApps.find(b => 
          b.enabled && device.activeApp.toLowerCase().includes(b.name.toLowerCase())
        );
        if (blockedApp) {
          const agentSocket = getAgentSocket(deviceId);
          if (blockedApp.action === 'kill' && agentSocket) {
            agentSocket.emit('app:kill', { appName: blockedApp.name, pattern: blockedApp.name });
          }
          // Log blocked app usage
          const blockActivity = {
            id: `block_${Date.now()}`,
            deviceId, deviceName: device.name,
            type: 'Alerta',
            description: `App bloqueada detectada: ${device.activeApp} (accion: ${blockedApp.action})`,
            status: 'Critico',
            severity: 'high',
            date: new Date().toISOString()
          };
          // Rate limit: once per minute per blocked app per device
          const recentBlock = memoryActivities.find(a => 
            a.deviceId === deviceId && a.type === 'Alerta' && 
            a.description?.includes(blockedApp.name) &&
            (Date.now() - new Date(a.date).getTime()) < 60000
          );
          if (!recentBlock) {
            logActivity(blockActivity);
            broadcastToDashboards('activity-log', blockActivity);
            
          }
        }
      }
    }
  });

  socket.on('agent:status', (data) => {
    console.log(`[NS: /agent] Status de ${socket.id}: ${data.status}`);
  });

  // ─── Terminal output from agent -> forward to dashboard ───
  socket.on('terminal:output', (data) => {
    console.warn(`[NS: /agent] Terminal output ignorado por política empresarial: ${socket.id}`);
  });

  socket.on('agent:screenshot', (data) => {
    const deviceId = socketToDevice.get(socket.id);
    if (!deviceId) return;
    const device = connectedDevices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
    }
    console.warn(`[NS: /agent] Screenshot legacy ignorado. Use remote-support:frame con sesión visible: ${deviceId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[NS: /agent] Agente desconectado: ${socket.id}`);
    const deviceId = socketToDevice.get(socket.id);
    if (deviceId) {
      socketToDevice.delete(socket.id);
      if (machineToAgentSocket.get(deviceId) === socket.id) machineToAgentSocket.delete(deviceId);
      // Close active app session and boot session
      closeAppSession(deviceId);
      closeBootSession(deviceId);
      
      const device = connectedDevices.get(deviceId);
      if (device) {
        device.supportSocketConnected = false;
        device.remoteSupportActive = false;
        if ((Date.now() - Number(device.lastSeen || 0)) > AGENT_TIMEOUT_MS) device.status = 'offline';
        addNotification('device_offline', 'Soporte remoto desconectado', `${device.name} perdió el canal de soporte remoto`, deviceId, device.name);
        broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
        if (prisma) {
          prisma.device.update({ where: { id: deviceId }, data: { status: 'offline', updatedAt: new Date() } }).catch(() => {});
        }
      }
    }
  });

  // ─── Excel Monitoring (Auditoria no intrusiva) con validacion estricta e Idempotencia ───
  const processedEventIds = new Set<string>();

  socket.on('excel:change', async (data: any) => {
    // 1. Idempotency Check
    if (data.eventId && processedEventIds.has(data.eventId)) {
      console.log(`[Excel] Evento duplicado ignorado: ${data.eventId}`);
      return;
    }
    if (data.eventId) {
      processedEventIds.add(data.eventId);
      // Keep set bounded to prevent memory leak
      if (processedEventIds.size > 10000) {
        const arr = Array.from(processedEventIds);
        processedEventIds.clear();
        arr.slice(5000).forEach(id => processedEventIds.add(id));
      }
    }

    const deviceId = socketToDevice.get(socket.id) || data.deviceId;
    if (!deviceId) return;

    const device = connectedDevices.get(deviceId);
    if (device) {
      if (prisma) {
        try {
          for (const change of data.changes) {
            // Flatten changes for frontend compatibility
            let naturalText = '';
            if (change.action === 'add_row') {
              naturalText = `Nueva fila registrada en '${change.sheetName}'`;
            } else if (change.action === 'update_row') {
              naturalText = `Fila modificada en '${change.sheetName}'`;
            } else if (change.action === 'schema_error') {
              naturalText = `[CRÍTICO] Error de Esquema en '${change.sheetName}': ${change.details}`;
            } else if (change.action === 'data_warning') {
              naturalText = `[ADVERTENCIA] Dato ignorado en '${change.sheetName}': ${change.details}`;
            } else {
              naturalText = `Eliminación de datos en '${change.sheetName}'`;
            }

            const logEntry = {
              id: `excel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              deviceId,
              deviceName: device.name,
              fileName: data.fileName,
              sheetName: change.sheetName,
              action: change.action === 'add_row' ? 'Nuevo Registro' 
                    : change.action === 'update_row' ? 'Modificación' 
                    : change.action === 'schema_error' ? 'Error Crítico'
                    : change.action === 'data_warning' ? 'Advertencia'
                    : 'Eliminación',
              details: JSON.stringify(change.data || change.modifications || {}),
              naturalText,
              createdAt: new Date(data.timestamp || Date.now()).toISOString()
            };
            
            memoryExcelLogs.push(logEntry);
            broadcastToDashboards('excel-audit-log', logEntry);

            if (change.action === 'schema_error') {
              const incident = {
                id: `alert_${Date.now()}`,
                deviceId,
                type: 'custom',
                severity: 'high',
                status: 'abierta',
                description: `Error de Esquema en Excel: ${change.details}`,
                date: new Date()
              };
              await prisma.incident.create({ data: incident as any });
              broadcastToDashboards('incident-log', incident);
              continue;
            }

            // Normal audit logs
            await prisma.auditLog.create({
              data: {
                deviceId,
                action: logEntry.action,
                description: change.details || `Hoja: ${change.sheetName}`,
                details: logEntry.details,
                status: change.action === 'data_warning' ? 'warning' : 'success',
                date: new Date(logEntry.createdAt)
              } as any
            });
          }
        } catch (err) {
          console.error('[DB] Error guardando log Excel:', err);
        }
      }
      console.log(`[Excel] Cambios procesados de ${device.name}: ${data.changes.length} modificaciones.`);
    }
  });

  // ─── WebRTC Signaling (Agent -> Dashboard) ───
  socket.on('webrtc:offer', (data: { offer: any }) => {
    const deviceId = socketToDevice.get(socket.id);
    if (deviceId) dashboardNs.to(`device_${deviceId}`).emit('webrtc:offer', { deviceId, offer: data.offer });
  });
  socket.on('webrtc:answer', (data: { answer: any }) => {
    const deviceId = socketToDevice.get(socket.id);
    if (deviceId) dashboardNs.to(`device_${deviceId}`).emit('webrtc:answer', { deviceId, answer: data.answer });
  });
  socket.on('webrtc:ice-candidate', (data: { candidate: any }) => {
    const deviceId = socketToDevice.get(socket.id);
    if (deviceId) dashboardNs.to(`device_${deviceId}`).emit('webrtc:ice-candidate', { deviceId, candidate: data.candidate });
  });

  // ─── Authorized Remote Support Events (agent -> dashboard) ───
  socket.on('remote-support:frame', (data: any) => {
    const deviceId = socketToDevice.get(socket.id) || data.machineId || data.deviceId;
    if (data.sessionId) updateSupportSession(data.sessionId, { status: 'VIEW_ONLY', viewPermissionStatus: 'accepted' });
    dashboardNs.to(`device_${deviceId}`).emit('remote-support:frame', { ...data, deviceId });
  });

  socket.on('remote-support:session-started', (session: any) => {
    const sessionId = session.id || session.sessionId;
    const updated = updateSupportSession(sessionId, { status: 'VIEW_ONLY', viewPermissionStatus: 'accepted', startedAt: session.startedAt || nowIso() });
    if (!updated) memoryRemoteSessions.unshift({ ...session, id: sessionId, sessionId, status: 'VIEW_ONLY' });
    addSupportEvent(sessionId, 'view_accepted', 'Permiso de visualización aceptado. Transmisión iniciada.', session);
    dashboardNs.emit('remote-support:session-started', session);
  });

  socket.on('remote-support:session-ended', (session: any) => {
    const sessionId = session.id || session.sessionId;
    updateSupportSession(sessionId, { status: 'ENDED', endedAt: session.endedAt || nowIso(), summary: session.summary || 'Sesión finalizada.' });
    addSupportEvent(sessionId, 'session_ended', session.summary || 'Sesión finalizada por el agente.', session);
    dashboardNs.emit('remote-support:session-ended', session);
  });

  socket.on('remote-support:control-accepted', (session: any) => {
    const sessionId = session.id || session.sessionId;
    updateSupportSession(sessionId, { status: 'CONTROL_ACTIVE', controlPermissionStatus: 'accepted' });
    addSupportEvent(sessionId, 'control_accepted', 'Control remoto autorizado por el usuario.', session);
    dashboardNs.emit('remote-support:control-accepted', session);
  });

  socket.on('remote-support:control-rejected', (session: any) => {
    const sessionId = session.id || session.sessionId;
    updateSupportSession(sessionId, { status: 'VIEW_ONLY', controlPermissionStatus: 'rejected' });
    addSupportEvent(sessionId, 'control_rejected', 'Control remoto rechazado o no disponible.', session);
    dashboardNs.emit('remote-support:control-rejected', session);
  });

  socket.on('remote-support:session-error', (data: any) => {
    if (data?.sessionId) {
      updateSupportSession(data.sessionId, { status: 'ERROR', errorMessage: sanitizeInput(data.message || 'Error de soporte remoto') });
      addSupportEvent(data.sessionId, 'session_error', sanitizeInput(data.message || 'Error de soporte remoto'), data);
    }
    dashboardNs.emit('remote-support:session-error', data);
  });

  socket.on('support-alert:confirmed', (data: any) => {
    const alert = memorySupportAlerts.find(a => a.alertId === data.alertId);
    if (alert) Object.assign(alert, { status: 'confirmed', confirmedAt: data.confirmedAt });
    dashboardNs.emit('support-alert:confirmed', data);
  });

  socket.on('support-alert:rejected', (data: any) => {
    const alert = memorySupportAlerts.find(a => a.alertId === data.alertId);
    if (alert) Object.assign(alert, { status: 'rejected', rejectedAt: data.rejectedAt });
    dashboardNs.emit('support-alert:rejected', data);
  });

  socket.on('voice:accepted', (data: any) => dashboardNs.emit('voice:accepted', data));
  socket.on('voice:rejected', (data: any) => dashboardNs.emit('voice:rejected', data));
});

// ==========================================
// 2. NAMESPACE: /dashboard (Nuevos Clientes UI)
// ==========================================
const getRoomSubscriberCount = (deviceId: string): number => {
  const room = dashboardNs.adapter.rooms.get(`device_${deviceId}`);
  return room ? room.size : 0;
};

// ─── Dashboard Socket Authentication Middleware ───
dashboardNs.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const secret = process.env.JWT_ACCESS_SECRET;
  const dashboardAccessToken = process.env.DASHBOARD_ACCESS_TOKEN;

  if (dashboardAccessToken) {
    if (token === dashboardAccessToken) {
      return next();
    }
    console.warn(`[Auth] Dashboard connection rejected: invalid dashboard access token (${socket.id})`);
    return next(new Error('Invalid dashboard access token'));
  }
  
  // Graceful fallback: if no JWT_ACCESS_SECRET configured, allow connection (dev/legacy mode)
  if (!secret) {
    console.warn('[Auth] No JWT_ACCESS_SECRET set - dashboard socket auth skipped (dev mode)');
    return next();
  }
  
  if (!token) {
    console.warn(`[Auth] Dashboard connection rejected: no token provided (${socket.id})`);
    return next(new Error('Authentication required'));
  }
  
  try {
    const decoded = jwt.verify(token as string, secret) as { userId: string; roleId: string; companyId: string };
    (socket as any).user = decoded;
    next();
  } catch (err) {
    console.warn(`[Auth] Dashboard connection rejected: invalid token (${socket.id})`);
    return next(new Error('Invalid or expired token'));
  }
});

dashboardNs.on('connection', (socket) => {
  const user = (socket as any).user;
  const companyId = user?.companyId || getDefaultCompanyId();
  socket.join(`company_${companyId}`);
  console.log(`[NS: /dashboard] Admin conectado: ${socket.id} a la sala company_${companyId}`);
  
  // Enviar estado actual de inmediato filtrado por empresa
  const devices = Array.from(connectedDevices.values()).filter(d => (d as any).companyId === companyId || !user); // !user fallback for legacy tests
  socket.emit('devices-update', devices);

  socket.on('dashboard:subscribe', (data) => {
    console.log(`[NS: /dashboard] Admin ${socket.id} se suscribió al equipo ${data.deviceId}`);
    socket.join(`device_${data.deviceId}`);
  });

  socket.on('dashboard:unsubscribe', (data) => {
    console.log(`[NS: /dashboard] Admin ${socket.id} se desuscribió del equipo ${data.deviceId}`);
    socket.leave(`device_${data.deviceId}`);
    
    // Check if there are other dashboards still watching
    const count = getRoomSubscriberCount(data.deviceId);
    if (count === 0) {
      const targetAgent = getAgentSocket(data.deviceId);
      if (targetAgent) {
        targetAgent.emit('stream:stop');
      }
    }
  });

  socket.on('remote-support:screen-start', (data: any) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (!targetSocket) return socket.emit('remote-support:session-error', { message: 'Máquina no disponible.' });
    socket.join(`device_${data.deviceId}`);
    const created = createSupportSession(data.deviceId, user?.userId || socket.id, data.quality || 'medium');
    if (!created) return socket.emit('remote-support:session-error', { message: 'No se pudo crear la sesión.' });
    const session = updateSupportSession(created.session.id, { status: 'WAITING_PERMISSION', viewPermissionStatus: 'pending' }) || created.session;
    targetSocket.emit('remote-support:screen-start', { ...data, sessionId: session.id, sessionTokenHash: session.sessionTokenHash });
    socket.emit('remote-support:session-requested', session);
  });

  socket.on('remote-support:screen-stop', (data: any) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-support:screen-stop', data);
  });

  socket.on('remote-support:request-control', (data: any) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) {
      if (data.sessionId) updateSupportSession(data.sessionId, { status: 'CONTROL_REQUESTED', controlPermissionStatus: 'pending' });
      targetSocket.emit('remote-support:request-control', data);
    }
  });

  socket.on('remote-support:end', (data: any) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (data.sessionId) updateSupportSession(data.sessionId, { status: 'ENDED', endedAt: nowIso(), summary: data.summary || 'Sesión finalizada.' });
    if (targetSocket) targetSocket.emit('remote-support:end', data);
  });

  socket.on('remote-support:mouse', (data: any) => {
    const session = memoryRemoteSessions.find((item) => item.id === data.sessionId || item.sessionId === data.sessionId);
    if (!session || session.status !== 'CONTROL_ACTIVE') return socket.emit('remote-support:session-error', { sessionId: data.sessionId, message: 'Control remoto no autorizado o sesión inválida.' });
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-support:mouse', data);
  });

  socket.on('remote-support:keyboard', (data: any) => {
    const session = memoryRemoteSessions.find((item) => item.id === data.sessionId || item.sessionId === data.sessionId);
    if (!session || session.status !== 'CONTROL_ACTIVE') return socket.emit('remote-support:session-error', { sessionId: data.sessionId, message: 'Teclado remoto no autorizado o sesión inválida.' });
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-support:keyboard', data);
  });

  socket.on('remote-support:quality', (data: any) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-support:quality', data);
  });

  socket.on('voice:request', (data: any) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('voice:request', data);
  });

  socket.on('support-alert:send', (data: any) => {
    const machineId = sanitizeInput(data.machineId || data.deviceId || '');
    const alert = {
      alertId: data.alertId || `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: sanitizeInput(data.sessionId || ''),
      machineId,
      title: sanitizeInput(data.title || 'Mensaje de soporte'),
      message: sanitizeInput(data.message || ''),
      priority: sanitizeInput(data.priority || 'normal'),
      requiresConfirmation: data.requiresConfirmation !== false,
      timestamp: nowIso(),
      status: 'sent',
    };
    memorySupportAlerts.unshift(alert);
    const targetSocket = getAgentSocket(machineId);
    if (targetSocket) targetSocket.emit('support-alert:show', alert);
    if (alert.sessionId) addSupportEvent(alert.sessionId, 'alert_sent', 'Alerta visible enviada al agente.', alert);
    dashboardNs.emit('support-alert:sent', alert);
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('device_')) {
        const deviceId = room.replace('device_', '');
        process.nextTick(() => {
          const count = getRoomSubscriberCount(deviceId);
          if (count === 0) {
            // Legacy hidden streaming is disabled. Authorized support uses remote-support:end.
          }
        });
      }
    }
  });

  socket.on('remote:mouse', (data) => {
    socket.emit('remote-support:session-error', { message: 'Mouse remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  socket.on('remote:keyboard', (data) => {
    socket.emit('remote-support:session-error', { message: 'Teclado remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  socket.on('remote:command', (data) => {
    socket.emit('remote-support:session-error', { message: 'Comando remoto libre desactivado por política empresarial.' });
  });

  socket.on('remote:disconnect', (data) => {
    socket.emit('remote-support:session-error', { message: 'Desconexión remota de agente desactivada por política empresarial.' });
  });

  socket.on('remote:scroll', (data) => {
    socket.emit('remote-support:session-error', { message: 'Scroll remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  // ─── WebRTC Signaling (Dashboard -> Agent) ───
  socket.on('webrtc:offer', (data: { deviceId: string; offer: any }) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('webrtc:offer', data);
  });
  socket.on('webrtc:answer', (data: { deviceId: string; answer: any }) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('webrtc:answer', data);
  });
  socket.on('webrtc:ice-candidate', (data: { deviceId: string; candidate: any }) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('webrtc:ice-candidate', data);
  });

  // ─── New Admin Boss Actions ───

  // Send a toast/message that appears on the employee's screen
  socket.on('admin:send-toast', (data: { deviceId: string; message: string }) => {
    const xssClean = xss(data.message || '').substring(0, 100);
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) {
      targetSocket.emit('admin:send-toast', { message: xssClean });
      console.log(`[Admin] send-toast -> ${data.deviceId}: "${xssClean}"`);
    }
  });

  // Force the employee's browser to open a specific URL
  socket.on('admin:force-url', (data: { deviceId: string; url: string }) => {
    socket.emit('remote-support:session-error', { message: 'Apertura remota de URL desactivada por política empresarial.' });
  });

  // Lock/freeze the employee's mouse and keyboard
  socket.on('admin:lock-input', (data: { deviceId: string }) => {
    socket.emit('remote-support:session-error', { message: 'Bloqueo remoto de input desactivado por política empresarial.' });
  });

  socket.on('remote:monitor-select', (data) => {
    socket.emit('remote-support:session-error', { message: 'Selección legacy de monitor desactivada. Use Soporte remoto autorizado.' });
  });

  // Dynamic quality change (HD toggle from dashboard)
  socket.on('stream:quality', (data: { deviceId: string; quality: number; fps: number }) => {
    socket.emit('remote-support:session-error', { message: 'Streaming legacy desactivado. Use calidad dentro de Soporte remoto autorizado.' });
  });

  socket.on('start-remote', (data) => {
    socket.emit('remote-support:session-error', { message: 'Inicio remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  socket.on('stop-remote', (data) => {
    socket.emit('remote-support:session-error', { message: 'Cierre remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  socket.on('remote-power', (data) => {
    socket.emit('remote-support:session-error', { message: 'Comandos de energía remotos desactivados por política empresarial.' });
  });

  socket.on('remote-ctrl-alt-del', (data) => {
    socket.emit('remote-support:session-error', { message: 'Ctrl+Alt+Del remoto desactivado por política empresarial.' });
  });

  // ─── Terminal relay ───
  socket.on('terminal:start', (data) => {
    socket.emit('remote-support:session-error', { message: 'Terminal remota libre desactivada por política empresarial.' });
  });

  socket.on('terminal:input', (data) => {
    socket.emit('remote-support:session-error', { message: 'Terminal remota libre desactivada por política empresarial.' });
  });

  socket.on('terminal:stop', (data) => {
    socket.emit('remote-support:session-error', { message: 'Terminal remota libre desactivada por política empresarial.' });
  });

  // ─── Audio relay (Escucha Activa) ───
  socket.on('audio:start', (data) => {
    socket.emit('remote-support:session-error', { message: 'Use Comunicación autorizada. Audio oculto desactivado.' });
  });

  socket.on('audio:chunk', (data) => {
    socket.emit('remote-support:session-error', { message: 'Audio oculto desactivado.' });
  });

  socket.on('audio:stream', (data) => {
    socket.emit('remote-support:session-error', { message: 'Audio oculto desactivado.' });
  });

  socket.on('audio:stop', (data) => {
    socket.emit('remote-support:session-error', { message: 'Audio oculto desactivado.' });
  });
});

// ==========================================
// 3. NAMESPACE: / (Legacy, Mantiene compatibilidad)
// ==========================================
io.on('connection', (socket) => {
  console.log(`[Legacy] Cliente conectado: ${socket.id}`);
  
  socket.on('register-agent', async (data) => {
    console.log(`[Legacy] register-agent: ${data.name}`);
    connectedDevices.set(socket.id, { id: socket.id, name: data.name, os: data.os, status: 'online', lastSeen: Date.now(), socketId: socket.id, companyId: getDefaultCompanyId() });
    broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
  });

  socket.on('screenshot', async (data) => {
    const device = connectedDevices.get(socket.id);
    if (device) {
      device.lastSeen = Date.now();
      device.status = 'online';
      if (data.metrics) {
        device.cpu = data.metrics.cpu;
        device.ram = data.metrics.ram;
        if (data.metrics.activeApp && data.metrics.activeApp !== device.activeApp) {
          device.activeApp = data.metrics.activeApp;
          broadcastToDashboards('activity-log', { deviceId: socket.id, type: 'Actividad', description: `Cambió a: ${data.activeApp}`, status: 'Automático' });
        }
        broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
      }
      // Legacy screenshots are not relayed. Authorized viewing uses remote-support:frame with a visible session indicator.
    }
  });

  // Proxy de control remoto (Legacy frontend)
  socket.on('remote-mouse', (data) => {
    socket.emit('remote-support:session-error', { message: 'Mouse remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  socket.on('remote-keyboard', (data) => {
    socket.emit('remote-support:session-error', { message: 'Teclado remoto legacy desactivado. Use Soporte remoto autorizado.' });
  });

  socket.on('disconnect', () => {
    const device = connectedDevices.get(socket.id);
    if (device) {
      device.status = 'offline';
      broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
    }
  });
});

app.get('/api/devices', (req: Request, res: Response) => {
  // Enrich devices with sede info
  const devicesWithSede = Array.from(connectedDevices.values()).map(d => {
    const sede = memorySedes.find(s => s.devices.includes(d.id));
    return { ...d, sedeId: sede?.id || null, sedeName: sede?.name || null };
  });
  res.json(devicesWithSede);
});

app.get('/api/machines', (_req: Request, res: Response) => {
  res.json(Array.from(connectedDevices.values()).map(normalizeMachine));
});

app.get('/api/machines/active', (_req: Request, res: Response) => {
  res.json(Array.from(connectedDevices.values()).map(normalizeMachine).filter((machine) => machine.status === 'online'));
});

app.get('/api/machines/:id', (req: Request, res: Response) => {
  const machine = connectedDevices.get(req.params.id);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });
  res.json(normalizeMachine(machine));
});

app.get('/api/excel-logs', (req: Request, res: Response) => {
  const { deviceId, fileName, from, to } = req.query;
  const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
  let logs = [...memoryExcelLogs];

  if (deviceId) logs = logs.filter(log => log.deviceId === deviceId);
  if (fileName) logs = logs.filter(log => log.fileName === fileName);
  if (from) logs = logs.filter(log => new Date(log.createdAt).getTime() >= new Date(from as string).getTime());
  if (to) logs = logs.filter(log => new Date(log.createdAt).getTime() <= new Date(to as string).getTime());

  res.json(logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit));
});

app.post('/api/agent/register', (req: Request, res: Response) => {
  const machineId = `${req.body.machineId || req.body.deviceId || ''}`.trim();
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  rememberAgentToken(machineId, getRequestToken(req));

  const machineName = sanitizeInput(req.body.machineName || req.body.name || req.body.hostname || machineId);
  const existingDevice = connectedDevices.get(machineId) || {};
  const device = {
    ...existingDevice,
    id: machineId,
    name: machineName,
    os: sanitizeInput(req.body.os || 'Windows'),
    status: req.body.status === 'inactive' ? 'offline' : 'online',
    lastSeen: Date.now(),
    agentVersion: sanitizeInput(req.body.agentVersion || ''),
    hostname: sanitizeInput(req.body.hostname || ''),
    windowsUser: sanitizeInput(req.body.windowsUser || req.body.localUser || ''),
    localUser: sanitizeInput(req.body.localUser || req.body.windowsUser || ''),
    localIp: sanitizeInput(req.body.localIp || req.body.ipAddress || req.ip || ''),
    ipAddress: sanitizeInput(req.body.ipAddress || req.body.localIp || req.ip || ''),
    companyArea: sanitizeInput(req.body.companyArea || ''),
    watchFolders: Array.isArray(req.body.watchFolders) ? req.body.watchFolders.map((folder: string) => sanitizeInput(folder)) : [],
    pendingEvents: 0,
    companyId: getDefaultCompanyId(),
    mode: 'excel_audit_remote_support',
    remoteSupportEnabled: req.body.remoteSupportEnabled !== false,
    remoteSupportActive: Boolean(req.body.remoteSupportActive),
    remoteControlMode: sanitizeInput(req.body.remoteControlMode || 'request_permission'),
    screenViewEnabled: req.body.screenViewEnabled !== false,
    remoteControlEnabled: req.body.remoteControlEnabled !== false,
  };

  connectedDevices.set(machineId, device);
  broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
  addNotification('system', 'Agente Excel registrado', `${machineName} se registró como agente de auditoría Excel`, machineId, machineName);
  res.json({ success: true, machineId, serverTime: new Date().toISOString() });
});

app.post('/api/agent/heartbeat', (req: Request, res: Response) => {
  const machineId = `${req.body.machineId || ''}`.trim();
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  rememberAgentToken(machineId, getRequestToken(req));

  const existing = connectedDevices.get(machineId) || {};
  const machineName = sanitizeInput(req.body.machineName || existing.name || machineId);
  connectedDevices.set(machineId, {
    ...existing,
    id: machineId,
    name: machineName,
    os: existing.os || 'Windows',
    status: req.body.status === 'inactive' ? 'offline' : 'online',
    lastSeen: Date.now(),
    lastSync: req.body.lastSync || existing.lastSync || null,
    pendingEvents: Number(req.body.pendingEvents || 0),
    monitoredFolders: Number(req.body.monitoredFolders || 0),
    agentVersion: sanitizeInput(req.body.agentVersion || existing.agentVersion || ''),
    companyArea: sanitizeInput(req.body.companyArea || existing.companyArea || ''),
    remoteSupportEnabled: req.body.remoteSupportEnabled !== false,
    remoteSupportActive: Boolean(req.body.remoteSupportActive),
    remoteControlMode: sanitizeInput(req.body.remoteControlMode || existing.remoteControlMode || 'request_permission'),
    screenViewEnabled: req.body.screenViewEnabled !== false,
    remoteControlEnabled: req.body.remoteControlEnabled !== false,
    companyId: existing.companyId || getDefaultCompanyId(),
    mode: 'excel_audit_remote_support',
  });

  broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
  res.json({ success: true, serverTime: new Date().toISOString() });
});

app.get('/api/agent/config', (_req: Request, res: Response) => {
  res.json(null);
});

app.post('/api/agent/sync-status', (req: Request, res: Response) => {
  const machineId = `${req.body.machineId || ''}`.trim();
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  const device = connectedDevices.get(machineId);
  if (device) {
    device.lastSync = req.body.lastSync || device.lastSync || null;
    device.syncStatus = sanitizeInput(req.body.syncStatus || 'pending');
    device.pendingEvents = Number(req.body.pendingEvents || 0);
    device.lastError = sanitizeInput(req.body.lastError || '');
    device.lastSeen = Date.now();
    broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
  }
  res.json({ success: true });
});

app.post('/api/excel-logs', (req: Request, res: Response) => {
  const events = Array.isArray(req.body) ? req.body : Array.isArray(req.body.events) ? req.body.events : [req.body];
  const processed = ingestExcelBusinessEvents(events);
  res.status(201).json({ success: true, processed });
});

app.post('/api/excel-events/bulk', (req: Request, res: Response) => {
  const events = Array.isArray(req.body.events) ? req.body.events : [];
  const processed = ingestExcelBusinessEvents(events);
  if (req.body.dailySummary) {
    broadcastToDashboards('excel-daily-summary', req.body.dailySummary);
  }
  res.json({ success: true, processed });
});

app.post('/api/agent/events', (req: Request, res: Response) => {
  const events = Array.isArray(req.body.events) ? req.body.events : [req.body];
  for (const event of events) {
    if (!event) continue;
    addSupportEvent(String(event.sessionId || 'agent'), sanitizeInput(event.type || 'agent_event'), sanitizeInput(event.message || 'Evento del agente.'), event);
  }
  res.status(201).json({ success: true, processed: events.length });
});

app.post('/api/workday/start', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || req.body.deviceId || '');
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  const existing = latestOpenWorkday(machineId);
  if (existing) return res.json(existing);
  const workday = sanitizeObject({
    id: req.body.id || makeId('workday'),
    machineId,
    machineName: req.body.machineName || connectedDevices.get(machineId)?.name || machineId,
    userLocal: req.body.userLocal || req.body.windowsUser || '',
    area: req.body.area || req.body.companyArea || '',
    responsible: req.body.responsible || '',
    openingObservation: req.body.openingObservation || '',
    startedAt: req.body.startedAt || nowIso(),
    status: 'active',
    businessDate: businessDate(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  memoryWorkdays.unshift(workday);
  auditBusinessAction('workday:start', 'Jornada empresarial iniciada.', machineId, workday);
  pushBusinessEvent('workday:update', workday);
  res.status(201).json(workday);
});

app.post('/api/workday/pause', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || '');
  const workday = latestOpenWorkday(machineId);
  if (!workday) return res.status(404).json({ error: 'Open workday not found' });
  Object.assign(workday, sanitizeObject({ status: 'paused', pausedAt: nowIso(), pauseObservation: req.body.observation || '', updatedAt: nowIso() }));
  auditBusinessAction('workday:pause', 'Jornada pausada.', machineId, workday);
  pushBusinessEvent('workday:update', workday);
  res.json(workday);
});

app.post('/api/workday/resume', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || '');
  const workday = latestOpenWorkday(machineId);
  if (!workday) return res.status(404).json({ error: 'Open workday not found' });
  Object.assign(workday, sanitizeObject({ status: 'active', resumedAt: nowIso(), resumeObservation: req.body.observation || '', updatedAt: nowIso() }));
  auditBusinessAction('workday:resume', 'Jornada reanudada.', machineId, workday);
  pushBusinessEvent('workday:update', workday);
  res.json(workday);
});

app.post('/api/workday/close', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || '');
  const workday = latestOpenWorkday(machineId) || memoryWorkdays.find((item) => item.id === req.body.workdayId);
  if (!workday) return res.status(404).json({ error: 'Open workday not found' });
  Object.assign(workday, sanitizeObject({ status: 'closed', closedAt: nowIso(), closingObservation: req.body.closingObservation || req.body.observation || '', responsible: req.body.responsible || workday.responsible || '', updatedAt: nowIso() }));
  auditBusinessAction('workday:close', 'Jornada cerrada.', machineId, workday);
  pushBusinessEvent('workday:update', workday);
  res.json(workday);
});

app.get('/api/workday/today', (req: Request, res: Response) => {
  const date = String(req.query.date || businessDate());
  let rows = memoryWorkdays.filter((item) => item.businessDate === date || String(item.startedAt || '').startsWith(date));
  if (req.query.machineId) rows = rows.filter((item) => item.machineId === req.query.machineId);
  res.json(rows);
});

app.get('/api/workday/by-machine/:machineId', (req: Request, res: Response) => {
  res.json(memoryWorkdays.filter((item) => item.machineId === req.params.machineId).slice(0, 100));
});

app.post('/api/daily-close', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || '');
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  const close = sanitizeObject({
    id: req.body.id || makeId('daily_close'),
    machineId,
    workdayId: req.body.workdayId || latestOpenWorkday(machineId)?.id || '',
    detectedAmount: Number(req.body.detectedAmount || 0),
    confirmedAmount: Number(req.body.confirmedAmount || 0),
    incomeAmount: Number(req.body.incomeAmount || 0),
    pendingReports: Number(req.body.pendingReports || 0),
    observation: req.body.observation || '',
    responsible: req.body.responsible || '',
    status: req.body.status || 'pending',
    createdAt: req.body.createdAt || nowIso(),
    submittedAt: req.body.submitNow ? nowIso() : req.body.submittedAt || null,
  });
  memoryDailyCloses.unshift(close);
  auditBusinessAction('daily-close:create', 'Cierre diario registrado.', machineId, close);
  pushBusinessEvent('daily-close:update', close);
  res.status(201).json(close);
});

app.get('/api/daily-close/today', (req: Request, res: Response) => {
  const date = String(req.query.date || businessDate());
  res.json(memoryDailyCloses.filter((item) => String(item.createdAt || '').startsWith(date)));
});

app.get('/api/daily-close/pending', (_req: Request, res: Response) => {
  res.json(memoryDailyCloses.filter((item) => ['pending', 'observed', 'edited'].includes(String(item.status))).slice(0, 500));
});

app.get('/api/daily-close/history', (_req: Request, res: Response) => {
  res.json(memoryDailyCloses.slice(0, 500));
});

app.post('/api/screen-events/detected', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || '');
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  const event = sanitizeObject({
    id: req.body.id || req.body.eventId || makeId('screen_event'),
    machineId,
    userLocal: req.body.userLocal || '',
    appName: req.body.appName || '',
    windowTitle: req.body.windowTitle || '',
    detectionType: req.body.detectionType || 'amount',
    detectedText: req.body.detectedText || '',
    detectedAmount: Number(req.body.detectedAmount || 0),
    confirmedAmount: req.body.confirmedAmount !== undefined ? Number(req.body.confirmedAmount) : null,
    currency: req.body.currency || 'PEN',
    confidence: Number(req.body.confidence || 0),
    status: req.body.status || 'pending',
    observation: req.body.observation || '',
    createdAt: req.body.createdAt || nowIso(),
    reviewedAt: null,
  });
  if (!memoryScreenEvents.some((item) => item.id === event.id)) memoryScreenEvents.unshift(event);
  auditBusinessAction('screen-event:detected', 'Detección inteligente registrada.', machineId, event);
  pushBusinessEvent('screen-event:new', event);
  res.status(201).json(event);
});

app.get('/api/screen-events/today', (req: Request, res: Response) => {
  const date = String(req.query.date || businessDate());
  res.json(memoryScreenEvents.filter((item) => String(item.createdAt || '').startsWith(date)).slice(0, 1000));
});

app.get('/api/screen-events/pending', (_req: Request, res: Response) => {
  res.json(memoryScreenEvents.filter((item) => item.status === 'pending').slice(0, 500));
});

function reviewScreenEvent(req: Request, res: Response, status: string) {
  const event = memoryScreenEvents.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Screen event not found' });
  Object.assign(event, sanitizeObject({ status, confirmedAmount: req.body.confirmedAmount !== undefined ? Number(req.body.confirmedAmount) : event.confirmedAmount, observation: req.body.observation || event.observation || '', reviewedBy: req.body.reviewedBy || '', reviewedAt: nowIso() }));
  auditBusinessAction(`screen-event:${status}`, `Detección ${status}.`, event.machineId, event);
  pushBusinessEvent('screen-event:update', event);
  return res.json(event);
}

app.post('/api/screen-events/:id/confirm', (req: Request, res: Response) => reviewScreenEvent(req, res, 'confirmed'));
app.post('/api/screen-events/:id/edit', (req: Request, res: Response) => reviewScreenEvent(req, res, 'edited'));
app.post('/api/screen-events/:id/reject', (req: Request, res: Response) => reviewScreenEvent(req, res, 'rejected'));

app.post('/api/reports/detected', (req: Request, res: Response) => {
  const report = sanitizeObject({ id: req.body.id || makeId('smart_report'), machineId: req.body.machineId || '', source: req.body.source || 'agent', detectedAmount: Number(req.body.detectedAmount || 0), confirmedAmount: req.body.confirmedAmount !== undefined ? Number(req.body.confirmedAmount) : null, confidence: Number(req.body.confidence || 0), status: req.body.status || 'pending', observation: req.body.observation || '', createdAt: req.body.createdAt || nowIso(), reviewedAt: null });
  if (!report.machineId) return res.status(400).json({ error: 'machineId is required' });
  memorySmartReports.unshift(report);
  pushBusinessEvent('smart-report:new', report);
  res.status(201).json(report);
});

function reviewReport(req: Request, res: Response, status: string) {
  const report = memorySmartReports.find((item) => item.id === req.body.reportId || item.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  Object.assign(report, sanitizeObject({ status, confirmedAmount: req.body.confirmedAmount !== undefined ? Number(req.body.confirmedAmount) : report.confirmedAmount, observation: req.body.observation || report.observation || '', reviewedAt: nowIso() }));
  memoryReportReviews.unshift(sanitizeObject({ id: makeId('report_review'), reportId: report.id, action: status, detectedAmount: report.detectedAmount, correctedAmount: report.confirmedAmount, observation: req.body.observation || '', reviewedBy: req.body.reviewedBy || '', createdAt: nowIso() }));
  pushBusinessEvent('smart-report:update', report);
  return res.json(report);
}

app.post('/api/reports/confirm', (req: Request, res: Response) => reviewReport(req, res, 'confirmed'));
app.post('/api/reports/edit', (req: Request, res: Response) => reviewReport(req, res, 'edited'));
app.post('/api/reports/reject', (req: Request, res: Response) => reviewReport(req, res, 'rejected'));
app.get('/api/reports/today', (req: Request, res: Response) => { const date = String(req.query.date || businessDate()); res.json(memorySmartReports.filter((item) => String(item.createdAt || '').startsWith(date))); });
app.get('/api/reports/pending', (_req: Request, res: Response) => res.json(memorySmartReports.filter((item) => item.status === 'pending')));
app.get('/api/reports/by-machine/:machineId', (req: Request, res: Response) => res.json(memorySmartReports.filter((item) => item.machineId === req.params.machineId).slice(0, 500)));

app.post('/api/communication/chat/send', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || req.body.deviceId || '');
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  let session = req.body.sessionId ? memoryCommunicationSessions.find((item) => item.id === req.body.sessionId) : null;
  if (!session) {
    session = sanitizeObject({ id: makeId('comm'), machineId, type: 'CHAT', status: 'active', requestedBy: req.body.sender || 'dashboard', createdAt: nowIso() });
    memoryCommunicationSessions.unshift(session);
  }
  const message = sanitizeObject({ id: makeId('chat'), sessionId: session.id, machineId, sender: req.body.sender || 'dashboard', message: req.body.message || '', status: 'sent', createdAt: nowIso() });
  memoryChatMessages.unshift(message);
  const targetSocket = getAgentSocket(machineId);
  if (targetSocket) targetSocket.emit('communication:chat-message', message);
  pushBusinessEvent('communication:chat-message', message);
  res.status(201).json({ session, message });
});

app.get('/api/communication/chat/:sessionId', (req: Request, res: Response) => {
  res.json(memoryChatMessages.filter((item) => item.sessionId === req.params.sessionId).slice(0, 500).reverse());
});

app.post('/api/communication/voice/request', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || req.body.deviceId || '');
  if (!machineId) return res.status(400).json({ error: 'machineId is required' });
  const session = sanitizeObject({ id: makeId('voice_comm'), machineId, type: 'VOICE', status: 'requested', requestedBy: req.body.requestedBy || 'dashboard', createdAt: nowIso() });
  memoryCommunicationSessions.unshift(session);
  memoryVoiceSessions.unshift({ id: makeId('voice'), communicationId: session.id, machineId, status: 'requested', recordingAuthorized: false, createdAt: nowIso() });
  const targetSocket = getAgentSocket(machineId);
  if (targetSocket) targetSocket.emit('voice:request', { ...req.body, sessionId: session.id, machineId, requestedAt: nowIso() });
  pushBusinessEvent('communication:voice-requested', session);
  res.status(201).json(session);
});

app.post('/api/communication/voice/end', (req: Request, res: Response) => {
  const session = memoryCommunicationSessions.find((item) => item.id === req.body.sessionId);
  if (!session) return res.status(404).json({ error: 'Communication session not found' });
  Object.assign(session, { status: 'ended', endedAt: nowIso() });
  const voice = memoryVoiceSessions.find((item) => item.communicationId === session.id);
  if (voice) Object.assign(voice, { status: 'ended', endedAt: nowIso() });
  const targetSocket = getAgentSocket(session.machineId);
  if (targetSocket) targetSocket.emit('voice:end', { sessionId: session.id, machineId: session.machineId });
  pushBusinessEvent('communication:voice-ended', session);
  res.json(session);
});

app.get('/api/dashboard/executive', (_req: Request, res: Response) => {
  const today = businessDate();
  const todayReports = memorySmartReports.filter((item) => String(item.createdAt || '').startsWith(today));
  const todayCloses = memoryDailyCloses.filter((item) => String(item.createdAt || '').startsWith(today));
  const todayScreen = memoryScreenEvents.filter((item) => String(item.createdAt || '').startsWith(today));
  const confirmed = todayReports.reduce((sum, item) => sum + Number(item.confirmedAmount || 0), 0) + todayCloses.reduce((sum, item) => sum + Number(item.confirmedAmount || 0), 0);
  const detected = todayReports.reduce((sum, item) => sum + Number(item.detectedAmount || 0), 0) + todayScreen.reduce((sum, item) => sum + Number(item.detectedAmount || 0), 0);
  res.json({ date: today, totalConfirmed: confirmed, totalDetected: detected, totalIncome: todayCloses.reduce((sum, item) => sum + Number(item.incomeAmount || 0), 0), difference: detected - confirmed, activeMachines: Array.from(connectedDevices.values()).filter((item) => item.status === 'online').length, pendingReports: todayReports.filter((item) => item.status === 'pending').length, pendingCloses: todayCloses.filter((item) => item.status === 'pending').length, sentCloses: todayCloses.filter((item) => item.status === 'sent' || item.status === 'submitted').length, lastSync: new Date().toISOString() });
});

app.get('/api/dashboard/today', (_req: Request, res: Response) => {
  const today = businessDate();
  res.json({ workdays: memoryWorkdays.filter((item) => String(item.startedAt || '').startsWith(today)), closes: memoryDailyCloses.filter((item) => String(item.createdAt || '').startsWith(today)), screenEvents: memoryScreenEvents.filter((item) => String(item.createdAt || '').startsWith(today)), reports: memorySmartReports.filter((item) => String(item.createdAt || '').startsWith(today)) });
});

app.get('/api/dashboard/intelligence', (_req: Request, res: Response) => {
  res.json({ screenEvents: memoryScreenEvents.slice(0, 200), smartReports: memorySmartReports.slice(0, 200), reportReviews: memoryReportReviews.slice(0, 200), communications: memoryCommunicationSessions.slice(0, 200) });
});

app.post('/api/support/sessions', (req: Request, res: Response) => {
  const machineId = sanitizeInput(req.body.machineId || req.body.deviceId || '');
  const machine = connectedDevices.get(machineId);
  if (!machine) return res.status(404).json({ error: 'Machine not found' });
  if (machine.status !== 'online') return res.status(409).json({ error: 'Agent disconnected' });
  if (machine.remoteSupportEnabled === false) return res.status(409).json({ error: 'Remote support disabled on agent' });
  if (!hasAgentSocket(machine)) return res.status(409).json({ error: 'Remote support channel not connected. Restart the agent or verify AGENT_TOKEN.' });
  const created = createSupportSession(machineId, req.body.requestedBy || req.headers['x-admin-user'] || 'dashboard', req.body.quality || 'medium');
  if (!created) return res.status(500).json({ error: 'Could not create support session' });
  res.status(201).json({ ...created.session, sessionToken: created.sessionToken });
});

app.get('/api/support/sessions/:id', (req: Request, res: Response) => {
  const session = memoryRemoteSessions.find((item) => item.id === req.params.id || item.sessionId === req.params.id);
  if (!session) return res.status(404).json({ error: 'Support session not found' });
  res.json(session);
});

app.get('/api/support/sessions/:id/events', (req: Request, res: Response) => {
  res.json(memorySupportEvents.filter((event) => event.sessionId === req.params.id).slice(0, 500));
});

app.post('/api/support/sessions/:id/request-view', (req: Request, res: Response) => {
  const session = updateSupportSession(req.params.id, { status: 'WAITING_PERMISSION', viewPermissionStatus: 'pending', quality: req.body.quality || 'medium' });
  if (!session) return res.status(404).json({ error: 'Support session not found' });
  const targetSocket = getAgentSocket(session.machineId || session.deviceId);
  if (!targetSocket) {
    updateSupportSession(session.id, { status: 'ERROR', errorMessage: 'Agent disconnected' });
    addSupportEvent(session.id, 'view_error', 'Agente desconectado.', session);
    return res.status(409).json({ error: 'Agent disconnected' });
  }
  addSupportEvent(session.id, 'view_requested', 'Solicitud de visualización enviada al agente.', session);
  targetSocket.emit('remote-support:screen-start', { deviceId: session.machineId, machineId: session.machineId, sessionId: session.id, quality: session.quality, sessionTokenHash: session.sessionTokenHash });
  res.json(session);
});

app.post('/api/support/sessions/:id/request-control', (req: Request, res: Response) => {
  const session = updateSupportSession(req.params.id, { status: 'CONTROL_REQUESTED', controlPermissionStatus: 'pending' });
  if (!session) return res.status(404).json({ error: 'Support session not found' });
  const targetSocket = getAgentSocket(session.machineId || session.deviceId);
  if (!targetSocket) return res.status(409).json({ error: 'Agent disconnected' });
  memoryPermissionRequests.unshift({ id: `perm_${Date.now()}`, sessionId: session.id, machineId: session.machineId, type: 'control', status: 'pending', requestedAt: nowIso() });
  addSupportEvent(session.id, 'control_requested', 'Solicitud de control enviada al agente.', session);
  targetSocket.emit('remote-support:request-control', { deviceId: session.machineId, machineId: session.machineId, sessionId: session.id, sessionTokenHash: session.sessionTokenHash });
  res.json(session);
});

app.post('/api/support/sessions/:id/end', (req: Request, res: Response) => {
  const session = updateSupportSession(req.params.id, { status: 'ENDED', endedAt: nowIso(), summary: req.body.summary || 'Sesión finalizada desde el dashboard.' });
  if (!session) return res.status(404).json({ error: 'Support session not found' });
  const targetSocket = getAgentSocket(session.machineId || session.deviceId);
  if (targetSocket) targetSocket.emit('remote-support:end', { deviceId: session.machineId, machineId: session.machineId, sessionId: session.id, summary: session.summary });
  addSupportEvent(session.id, 'session_ended', 'Sesión finalizada correctamente.', session);
  res.json(session);
});

app.post('/api/support/sessions/:id/alert', (req: Request, res: Response) => {
  const session = memoryRemoteSessions.find((item) => item.id === req.params.id || item.sessionId === req.params.id);
  if (!session) return res.status(404).json({ error: 'Support session not found' });
  const alert = {
    alertId: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: session.id,
    machineId: session.machineId,
    title: sanitizeInput(req.body.title || 'Mensaje de soporte'),
    message: sanitizeInput(req.body.message || 'El administrador solicita tu atención.'),
    priority: sanitizeInput(req.body.priority || 'normal'),
    requiresConfirmation: req.body.requiresConfirmation !== false,
    timestamp: nowIso(),
    status: 'sent',
  };
  memorySupportAlerts.unshift(alert);
  const targetSocket = getAgentSocket(session.machineId || session.deviceId);
  if (targetSocket) targetSocket.emit('support-alert:show', alert);
  addSupportEvent(session.id, 'alert_sent', 'Alerta visible enviada al agente.', alert);
  dashboardNs.emit('support-alert:sent', alert);
  res.status(201).json(alert);
});

app.post('/api/remote/session/start', (req: Request, res: Response) => {
  const session = {
    sessionId: req.body.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    machineId: sanitizeInput(req.body.machineId || req.body.deviceId || ''),
    machineName: sanitizeInput(req.body.machineName || ''),
    sessionType: 'remote_support',
    screenViewStarted: Boolean(req.body.screenViewStarted),
    remoteControlRequested: false,
    remoteControlAccepted: false,
    voiceStarted: false,
    startedAt: new Date().toISOString(),
    status: 'requested',
    summary: 'Sesión de soporte remoto solicitada.',
  };
  memoryRemoteSessions.unshift(session);
  dashboardNs.emit('remote-support:session-requested', session);
  res.status(201).json(session);
});

app.post('/api/remote/session/end', (req: Request, res: Response) => {
  const sessionId = req.body.sessionId;
  const session = memoryRemoteSessions.find(s => s.sessionId === sessionId);
  if (session) Object.assign(session, { endedAt: new Date().toISOString(), status: 'closed', summary: req.body.summary || 'Sesión finalizada.' });
  res.json({ success: true, session });
});

app.post('/api/remote/session/request-control', (req: Request, res: Response) => {
  const event = { ...req.body, event: 'request_control', createdAt: new Date().toISOString() };
  memoryRemoteSessions.unshift(event);
  res.json({ success: true, event });
});

app.post('/api/remote/session/accept-control', (req: Request, res: Response) => {
  const event = { ...req.body, event: 'accept_control', createdAt: new Date().toISOString() };
  memoryRemoteSessions.unshift(event);
  dashboardNs.emit('remote-support:control-accepted', event);
  res.json({ success: true, event });
});

app.post('/api/remote/session/reject-control', (req: Request, res: Response) => {
  const event = { ...req.body, event: 'reject_control', createdAt: new Date().toISOString() };
  memoryRemoteSessions.unshift(event);
  dashboardNs.emit('remote-support:control-rejected', event);
  res.json({ success: true, event });
});

app.post('/api/remote/session/log', (req: Request, res: Response) => {
  const event = { ...req.body, createdAt: new Date().toISOString() };
  memoryRemoteSessions.unshift(event);
  res.status(201).json({ success: true, event });
});

app.get('/api/remote/sessions', (_req: Request, res: Response) => {
  res.json(memoryRemoteSessions.slice(0, 300));
});

app.post('/api/alerts/send', (req: Request, res: Response) => {
  const alert = {
    alertId: req.body.alertId || `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    machineId: sanitizeInput(req.body.machineId || req.body.deviceId || ''),
    title: sanitizeInput(req.body.title || 'Alerta empresarial'),
    message: sanitizeInput(req.body.message || ''),
    priority: sanitizeInput(req.body.priority || 'normal'),
    type: sanitizeInput(req.body.type || 'information'),
    requiresConfirmation: Boolean(req.body.requiresConfirmation),
    timestamp: new Date().toISOString(),
    status: 'sent',
  };
  memorySupportAlerts.unshift(alert);
  const targetSocket = getAgentSocket(alert.machineId);
  if (targetSocket) targetSocket.emit('support-alert:show', alert);
  dashboardNs.emit('support-alert:sent', alert);
  res.status(201).json(alert);
});

app.get('/api/alerts', (req: Request, res: Response) => {
  let alerts = [...memorySupportAlerts];
  if (req.query.machineId) alerts = alerts.filter(alert => alert.machineId === req.query.machineId);
  if (req.query.priority) alerts = alerts.filter(alert => alert.priority === req.query.priority);
  res.json(alerts.slice(0, 500));
});

app.post('/api/alerts/confirm', (req: Request, res: Response) => {
  const alert = memorySupportAlerts.find(item => item.alertId === req.body.alertId);
  if (alert) Object.assign(alert, { status: 'confirmed', confirmedAt: new Date().toISOString() });
  dashboardNs.emit('support-alert:confirmed', alert || req.body);
  res.json({ success: true, alert });
});

app.post('/api/voice/request', (req: Request, res: Response) => {
  const targetSocket = getAgentSocket(req.body.machineId || req.body.deviceId);
  if (targetSocket) targetSocket.emit('voice:request', { ...req.body, requestedAt: new Date().toISOString() });
  res.json({ success: true });
});

app.post('/api/voice/accept', (req: Request, res: Response) => {
  dashboardNs.emit('voice:accepted', { ...req.body, acceptedAt: new Date().toISOString() });
  res.json({ success: true });
});

app.post('/api/voice/reject', (req: Request, res: Response) => {
  dashboardNs.emit('voice:rejected', { ...req.body, rejectedAt: new Date().toISOString() });
  res.json({ success: true });
});

app.post('/api/voice/end', (req: Request, res: Response) => {
  dashboardNs.emit('voice:ended', { ...req.body, endedAt: new Date().toISOString() });
  res.json({ success: true });
});

app.delete('/api/devices/:id', (req: Request, res: Response) => {
  const deviceId = req.params.id;
  if (connectedDevices.has(deviceId)) {
    connectedDevices.delete(deviceId);
    broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Device not found' });
  }
});

app.get('/api/devices/:id/activity', (req: Request, res: Response) => {
  const acts = memoryActivities.filter(a => a.deviceId === req.params.id);
  res.json(acts);
});

app.get('/api/devices/:id/incidents', (req: Request, res: Response) => {
  const inc = memoryIncidents.filter(i => i.deviceId === req.params.id);
  res.json(inc);
});

app.get('/api/legacy-reports/summary', (req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayActivities = memoryActivities.filter(a => a.date && a.date.startsWith(today));
  const todaySessions = memoryAppSessions.filter(s => s.startedAt.startsWith(today));
  
  res.json({
    totalIncidents: memoryIncidents.length,
    criticalOpen: memoryIncidents.filter(i => i.severity === 'critical' && i.status === 'abierta').length,
    offlineDevices: Array.from(connectedDevices.values()).filter(d => d.status === 'offline').length,
    sessionsToday: todaySessions.length,
    activitiesToday: todayActivities.length,
    activeDevices: Array.from(connectedDevices.values()).filter(d => d.status === 'online').length,
  });
});

app.get('/api/legacy-reports', (req: Request, res: Response) => {
  // Combine activities and incidents for a general report view
  res.json([...memoryActivities, ...memoryIncidents]);
});

// ─── NEW: Activity Timeline & Reports ───

// Get app sessions for a device (or all) within a date range
app.get('/api/legacy-reports/timeline', (req: Request, res: Response) => {
  const { deviceId, from, to } = req.query;
  const fromDate = from ? new Date(from as string).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const toDate = to ? new Date(to as string).toISOString() : new Date().toISOString();
  
  let sessions = memoryAppSessions.filter(s => s.startedAt >= fromDate && s.startedAt <= toDate);
  if (deviceId) {
    sessions = sessions.filter(s => s.deviceId === deviceId);
  }
  
  res.json(sessions);
});

// Get daily report with hourly breakdown
app.get('/api/legacy-reports/daily', (req: Request, res: Response) => {
  const { deviceId, date } = req.query;
  const targetDate = (date as string) || new Date().toISOString().slice(0, 10);
  
  // Filter sessions for the target date
  let sessions = memoryAppSessions.filter(s => s.startedAt.startsWith(targetDate));
  if (deviceId) {
    sessions = sessions.filter(s => s.deviceId === deviceId);
  }
  
  // Build hourly breakdown
  const hourlyBreakdown: Record<number, { hour: number; apps: Record<string, number>; totalSeconds: number }> = {};
  for (let h = 0; h < 24; h++) {
    hourlyBreakdown[h] = { hour: h, apps: {}, totalSeconds: 0 };
  }
  
  for (const session of sessions) {
    const startHour = new Date(session.startedAt).getHours();
    const duration = session.duration || (session.endedAt 
      ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
      : Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    
    if (!hourlyBreakdown[startHour].apps[session.appName]) {
      hourlyBreakdown[startHour].apps[session.appName] = 0;
    }
    hourlyBreakdown[startHour].apps[session.appName] += duration;
    hourlyBreakdown[startHour].totalSeconds += duration;
  }
  
  // App usage summary (total time per app)
  const appUsage: Record<string, number> = {};
  for (const session of sessions) {
    const duration = session.duration || (session.endedAt 
      ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
      : Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    if (!appUsage[session.appName]) appUsage[session.appName] = 0;
    appUsage[session.appName] += duration;
  }
  
  // Boot session info for the day
  let bootSessions = memoryBootSessions.filter(b => b.bootAt.startsWith(targetDate));
  if (deviceId) {
    bootSessions = bootSessions.filter(b => b.deviceId === deviceId);
  }
  
  // Activities for the day
  let activities = memoryActivities.filter(a => a.date && a.date.startsWith(targetDate));
  if (deviceId) {
    activities = activities.filter(a => a.deviceId === deviceId);
  }
  
  res.json({
    date: targetDate,
    deviceId: deviceId || 'all',
    hourlyBreakdown: Object.values(hourlyBreakdown),
    appUsage: Object.entries(appUsage).map(([app, seconds]) => ({ app, seconds })).sort((a, b) => b.seconds - a.seconds),
    bootSessions,
    sessions,
    activities,
    summary: {
      totalApps: Object.keys(appUsage).length,
      totalActiveSeconds: Object.values(appUsage).reduce((a, b) => a + b, 0),
      totalSessions: sessions.length,
      mostUsedApp: Object.entries(appUsage).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
    }
  });
});

// Get boot sessions
app.get('/api/legacy-reports/boot-sessions', (req: Request, res: Response) => {
  const { deviceId, from, to } = req.query;
  const fromDate = from ? new Date(from as string).toISOString() : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toDate = to ? new Date(to as string).toISOString() : new Date().toISOString();
  
  let sessions = memoryBootSessions.filter(s => s.bootAt >= fromDate && s.bootAt <= toDate);
  if (deviceId) {
    sessions = sessions.filter(s => s.deviceId === deviceId);
  }
  
  // Include active boot sessions
  const activeBoots = Array.from(activeBootSessions.values())
    .filter(s => (!deviceId || s.deviceId === deviceId))
    .map(s => ({ ...s, isActive: true, totalSeconds: Math.round((Date.now() - new Date(s.bootAt).getTime()) / 1000) }));
  
  res.json([...sessions, ...activeBoots]);
});

// Real-time activity feed (last N activities)
app.get('/api/legacy-reports/live-feed', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const recentActivities = memoryActivities.slice(-limit).reverse();
  
  // Add current active sessions info
  const activeSessionsInfo = Array.from(activeAppSessions.entries()).map(([deviceId, session]) => {
    const device = connectedDevices.get(deviceId);
    return {
      deviceId,
      deviceName: device?.name || session.deviceName,
      currentApp: session.appName,
      since: session.startedAt,
      durationSeconds: Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000),
      cpu: device?.cpu || 0,
      ram: device?.ram || 0,
      status: device?.status || 'offline'
    };
  });
  
  res.json({ activities: recentActivities, activeSessions: activeSessionsInfo });
});

app.get('/api/settings', (req: Request, res: Response) => {
  res.json(memorySettings);
});

// ─── Email Reports Config ───
app.get('/api/email-config', (req: Request, res: Response) => {
  const config = getEmailConfig();
  // Don't expose password in response
  res.json({ ...config, pass: config.pass ? '********' : '' });
});

app.post('/api/email-config', (req: Request, res: Response) => {
  const updated = updateEmailConfig(req.body);
  res.json({ ...updated, pass: '********' });
});

app.post('/api/email-config/test', async (req: Request, res: Response) => {
  try {
    const config = getEmailConfig();
    const to = config.recipients[0] || config.user;
    if (!to) return res.status(400).json({ error: 'No hay destinatarios configurados' });
    const result = await sendTestEmail(to);
    if (result.success) {
      res.json({ success: true, message: 'Email de prueba enviado' });
    } else {
      res.status(500).json({ error: result.error || 'Error desconocido' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error al enviar email de prueba' });
  }
});

app.patch('/api/settings', (req: Request, res: Response) => {
  Object.assign(memorySettings, req.body);
  saveData('settings', memorySettings, true);
  dashboardNs.emit('settings:update', memorySettings);
  
  // Also notify all connected agents of the updated settings
  agentNs.emit('settings:update', {
    fps: parseInt(memorySettings.fps) || 15,
    quality: parseInt(memorySettings.quality) || 60,
    heartbeatInterval: parseInt(memorySettings.heartbeatInterval) || 10,
  });
  
  res.json(memorySettings);
});

// ─── Sedes CRUD (Enhanced) ───
app.get('/api/sedes', (req: Request, res: Response) => {
  // Enrich sedes with device stats
  const enriched = memorySedes.map(sede => {
    const sedeDevices = sede.devices.map(id => connectedDevices.get(id)).filter(Boolean);
    const onlineCount = sedeDevices.filter(d => d.status === 'online').length;
    const avgCpu = sedeDevices.length ? Math.round(sedeDevices.reduce((s, d) => s + (d.cpu || 0), 0) / sedeDevices.length) : 0;
    const avgRam = sedeDevices.length ? Math.round(sedeDevices.reduce((s, d) => s + (d.ram || 0), 0) / sedeDevices.length) : 0;
    return {
      ...sede,
      stats: {
        totalDevices: sede.devices.length,
        onlineDevices: onlineCount,
        offlineDevices: sede.devices.length - onlineCount,
        avgCpu,
        avgRam,
      }
    };
  });
  res.json(enriched);
});

app.post('/api/sedes', (req: Request, res: Response) => {
  const { name, location, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const sede: Sede = {
    id: `sede_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    location: location || '',
    devices: [],
    createdAt: new Date().toISOString(),
  };
  (sede as any).color = color || null;
  memorySedes.push(sede);
  saveData('sedes', memorySedes);
  res.status(201).json(sede);
});

app.patch('/api/sedes/:id', (req: Request, res: Response) => {
  const sede = memorySedes.find(s => s.id === req.params.id);
  if (!sede) return res.status(404).json({ error: 'Sede not found' });
  if (req.body.name) sede.name = req.body.name;
  if (req.body.location !== undefined) sede.location = req.body.location;
  if (req.body.color !== undefined) (sede as any).color = req.body.color;
  saveData('sedes', memorySedes);
  res.json(sede);
});

app.delete('/api/sedes/:id', (req: Request, res: Response) => {
  const idx = memorySedes.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sede not found' });
  memorySedes.splice(idx, 1);
  saveData('sedes', memorySedes);
  res.status(204).send();
});

app.post('/api/sedes/:id/devices', (req: Request, res: Response) => {
  const sede = memorySedes.find(s => s.id === req.params.id);
  if (!sede) return res.status(404).json({ error: 'Sede not found' });
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  
  // Remove from any other sede first (enforce uniqueness)
  for (const s of memorySedes) {
    if (s.id !== sede.id) {
      s.devices = s.devices.filter(d => d !== deviceId);
    }
  }
  
  if (!sede.devices.includes(deviceId)) {
    sede.devices.push(deviceId);
  }
  saveData('sedes', memorySedes);
  res.json(sede);
});

app.post('/api/sedes/:id/devices/bulk', (req: Request, res: Response) => {
  const sede = memorySedes.find(s => s.id === req.params.id);
  if (!sede) return res.status(404).json({ error: 'Sede not found' });
  const { deviceIds } = req.body;
  if (!Array.isArray(deviceIds)) return res.status(400).json({ error: 'deviceIds array is required' });
  
  for (const deviceId of deviceIds) {
    // Remove from other sedes
    for (const s of memorySedes) {
      if (s.id !== sede.id) {
        s.devices = s.devices.filter(d => d !== deviceId);
      }
    }
    if (!sede.devices.includes(deviceId)) {
      sede.devices.push(deviceId);
    }
  }
  saveData('sedes', memorySedes);
  res.json(sede);
});

app.delete('/api/sedes/:id/devices/:deviceId', (req: Request, res: Response) => {
  const sede = memorySedes.find(s => s.id === req.params.id);
  if (!sede) return res.status(404).json({ error: 'Sede not found' });
  sede.devices = sede.devices.filter(d => d !== req.params.deviceId);
  res.json(sede);
});

// Get which sede a device belongs to
app.get('/api/devices/:id/sede', (req: Request, res: Response) => {
  const deviceId = req.params.id;
  const sede = memorySedes.find(s => s.devices.includes(deviceId));
  res.json(sede || null);
});

// ─── Alert Rules CRUD ───
app.get('/api/alert-rules', (req: Request, res: Response) => {
  res.json(memoryAlertRules);
});

app.post('/api/alert-rules', (req: Request, res: Response) => {
  const { name, type, condition, action, enabled } = req.body;
  if (!name || !type || !condition) return res.status(400).json({ error: 'name, type, condition required' });
  const rule: AlertRule = {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    type,
    condition,
    action: action || 'notify_and_log',
    enabled: enabled !== false,
    createdAt: new Date().toISOString(),
  };
  memoryAlertRules.push(rule);
  saveData('alertRules', memoryAlertRules);
  res.status(201).json(rule);
});

app.patch('/api/alert-rules/:id', (req: Request, res: Response) => {
  const rule = memoryAlertRules.find(r => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  if (req.body.name !== undefined) rule.name = req.body.name;
  if (req.body.condition !== undefined) rule.condition = req.body.condition;
  if (req.body.action !== undefined) rule.action = req.body.action;
  if (req.body.enabled !== undefined) rule.enabled = req.body.enabled;
  saveData('alertRules', memoryAlertRules);
  res.json(rule);
});

app.delete('/api/alert-rules/:id', (req: Request, res: Response) => {
  const idx = memoryAlertRules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });
  memoryAlertRules.splice(idx, 1);
  saveData('alertRules', memoryAlertRules);
  res.status(204).send();
});

// ─── Blocked Apps CRUD ───
app.get('/api/blocked-apps', (req: Request, res: Response) => {
  res.json(memoryBlockedApps);
});

app.post('/api/blocked-apps', (req: Request, res: Response) => {
  const { name, action } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const blocked: BlockedApp = {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    action: action || 'notify',
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  memoryBlockedApps.push(blocked);
  saveData('blockedApps', memoryBlockedApps);
  
  // Notify all connected agents about the updated blocked apps list
  agentNs.emit('blocked-apps:update', memoryBlockedApps.filter(b => b.enabled));
  
  res.status(201).json(blocked);
});

app.patch('/api/blocked-apps/:id', (req: Request, res: Response) => {
  const app = memoryBlockedApps.find(a => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'Blocked app not found' });
  if (req.body.name !== undefined) app.name = req.body.name;
  if (req.body.action !== undefined) app.action = req.body.action;
  if (req.body.enabled !== undefined) app.enabled = req.body.enabled;
  saveData('blockedApps', memoryBlockedApps);
  
  agentNs.emit('blocked-apps:update', memoryBlockedApps.filter(b => b.enabled));
  res.json(app);
});

app.delete('/api/blocked-apps/:id', (req: Request, res: Response) => {
  const idx = memoryBlockedApps.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Blocked app not found' });
  memoryBlockedApps.splice(idx, 1);
  saveData('blockedApps', memoryBlockedApps);
  
  agentNs.emit('blocked-apps:update', memoryBlockedApps.filter(b => b.enabled));
  res.status(204).send();
});

// ─── Screenshot History ───
app.get('/api/screenshots/history', (req: Request, res: Response) => {
  const { deviceId, limit: limitStr } = req.query;
  const limit = parseInt(limitStr as string) || 50;
  
  let filtered = screenshotHistory;
  if (deviceId) {
    filtered = filtered.filter(s => s.deviceId === deviceId);
  }
  
  // Return most recent first, without image data (just metadata)
  const metadata = filtered.slice(-limit).reverse().map(s => ({
    id: s.id,
    deviceId: s.deviceId,
    deviceName: s.deviceName,
    timestamp: s.timestamp,
    hasImage: true,
  }));
  
  res.json(metadata);
});

app.get('/api/screenshots/history/:id', (req: Request, res: Response) => {
  const record = screenshotHistory.find(s => s.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Screenshot not found' });
  res.json(record);
});

// Get screenshots for a device within a time range
app.get('/api/screenshots/timeline', (req: Request, res: Response) => {
  const { deviceId, from, to } = req.query;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  
  const fromTime = from ? new Date(from as string).getTime() : Date.now() - 24 * 60 * 60 * 1000;
  const toTime = to ? new Date(to as string).getTime() : Date.now();
  
  const filtered = screenshotHistory.filter(s => 
    s.deviceId === deviceId &&
    new Date(s.timestamp).getTime() >= fromTime &&
    new Date(s.timestamp).getTime() <= toTime
  );
  
  // Return with images for timeline view
  res.json(filtered.slice(-100)); // Max 100 for a timeline
});

// ─── Notifications System ───
interface Notification {
  id: string;
  type: 'alert' | 'device_online' | 'device_offline' | 'session' | 'system' | 'blocked_app';
  title: string;
  message: string;
  deviceId?: string;
  deviceName?: string;
  read: boolean;
  createdAt: string;
}

const memoryNotifications: Notification[] = loadData<Notification[]>('notifications', []);

function addNotification(type: Notification['type'], title: string, message: string, deviceId?: string, deviceName?: string) {
  const notif: Notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type, title, message, deviceId, deviceName,
    read: false,
    createdAt: new Date().toISOString(),
  };
  memoryNotifications.unshift(notif);
  // Keep max 500 notifications
  if (memoryNotifications.length > 500) memoryNotifications.pop();
  saveData('notifications', memoryNotifications);
  dashboardNs.emit('notification:new', notif);
  return notif;
}

app.get('/api/notifications', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json(memoryNotifications.slice(0, limit));
});

app.patch('/api/notifications/:id/read', (req: Request, res: Response) => {
  const notif = memoryNotifications.find(n => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });
  notif.read = true;
  saveData('notifications', memoryNotifications);
  res.json(notif);
});

app.post('/api/notifications/mark-all-read', (req: Request, res: Response) => {
  memoryNotifications.forEach(n => n.read = true);
  saveData('notifications', memoryNotifications);
  res.json({ success: true });
});

app.delete('/api/notifications/read', (req: Request, res: Response) => {
  const unread = memoryNotifications.filter(n => !n.read);
  memoryNotifications.length = 0;
  memoryNotifications.push(...unread);
  saveData('notifications', memoryNotifications);
  res.json({ success: true });
});

app.get('/api/notifications/enterprise', async (req: Request, res: Response) => {
  if (!prisma) return res.json([]);
  const tenantId = getDefaultCompanyId();
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const notifications = await prisma.notification.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: limit }).catch(() => []);
  res.json(notifications);
});

app.patch('/api/notifications/enterprise/:id/read', async (req: Request, res: Response) => {
  if (!prisma) return res.status(404).json({ error: 'Notification not found' });
  const tenantId = getDefaultCompanyId();
  const existing = await prisma.notification.findFirst({ where: { id: req.params.id, tenantId } }).catch(() => null);
  if (!existing) return res.status(404).json({ error: 'Notification not found' });
  res.json(await prisma.notification.update({ where: { id: existing.id }, data: { read: true, readAt: new Date() } }));
});

// ─── Users Management (in-memory for MVP) ───
interface MvpUser {
  id: string;
  name: string;
  email: string;
  password: string; // bcrypt-hashed
  roleId: string;
  roleName: string;
  isActive: boolean;
  createdAt: string;
}

const memoryUsers: MvpUser[] = loadData<MvpUser[]>('users', []);

// Ensure default admin user exists (hash password on first run)
(async () => {
  if (memoryUsers.length === 0) {
    const hashedPw = await bcrypt.hash('admin123', 10);
    memoryUsers.push({
      id: 'user_admin',
      name: 'Administrador',
      email: 'admin@visioncontrol.app',
      password: hashedPw,
      roleId: 'role_superadmin',
      roleName: 'SuperAdmin',
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    saveData('users', memoryUsers);
    console.log('[Users] Default admin created with hashed password');
  } else {
    // Migrate any plaintext passwords to bcrypt (one-time migration)
    let migrated = false;
    for (const user of memoryUsers) {
      if (user.password && !user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
        user.password = await bcrypt.hash(user.password, 10);
        migrated = true;
      }
    }
    if (migrated) {
      saveData('users', memoryUsers);
      console.log('[Users] Migrated plaintext passwords to bcrypt');
    }
  }
})();

const memoryRoles = [
  { id: 'role_superadmin', name: 'SuperAdmin', description: 'Acceso total al sistema' },
  { id: 'role_admin', name: 'Admin', description: 'Administracion de equipos y usuarios' },
  { id: 'role_operator', name: 'Operator', description: 'Monitoreo y control remoto' },
  { id: 'role_viewer', name: 'Viewer', description: 'Solo lectura de reportes' },
];

app.get('/api/users', (req: Request, res: Response) => {
  // Return users without passwords
  res.json(memoryUsers.map(u => ({ ...u, password: undefined })));
});

app.get('/api/roles', (req: Request, res: Response) => {
  res.json(memoryRoles);
});

app.post('/api/users', async (req: Request, res: Response) => {
  const { name, email, password, roleId } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (memoryUsers.find(u => u.email === email)) return res.status(409).json({ error: 'Email already exists' });
  
  const role = memoryRoles.find(r => r.id === roleId) || memoryRoles[3]; // default Viewer
  const hashedPassword = await bcrypt.hash(password, 10);
  const user: MvpUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name, email, password: hashedPassword,
    roleId: role.id,
    roleName: role.name,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  memoryUsers.push(user);
  saveData('users', memoryUsers);
  addNotification('system', 'Nuevo usuario creado', `${name} (${role.name}) fue agregado al sistema`);
  res.status(201).json({ ...user, password: undefined });
});

app.patch('/api/users/:id', (req: Request, res: Response) => {
  const user = memoryUsers.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.roleId !== undefined) {
    const role = memoryRoles.find(r => r.id === req.body.roleId);
    if (role) { user.roleId = role.id; user.roleName = role.name; }
  }
  if (req.body.isActive !== undefined) user.isActive = req.body.isActive;
  saveData('users', memoryUsers);
  res.json({ ...user, password: undefined });
});

app.delete('/api/users/:id', (req: Request, res: Response) => {
  const idx = memoryUsers.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  memoryUsers.splice(idx, 1);
  saveData('users', memoryUsers);
  res.status(204).send();
});

// ==========================================
// DB-backed routes (require auth via apiRoutes middleware)
// Mounted AFTER in-memory routes so specific handlers match first
// ==========================================
const enterpriseRoutes = createEnterpriseRoutes(prisma, (event, payload) => {
  dashboardNs.emit(event, payload);
  io.emit(event, payload);
});
app.use('/api', enterpriseRoutes);
app.use('/api', apiRoutes);



// ─── Google Drive Screenshot Archive Endpoints ───

// Get Drive status (is it configured, authenticated, etc.)
app.get('/api/drive/status', (req: Request, res: Response) => {
  res.json(getDriveStatus());
});

// Start OAuth2 flow - redirects to Google login
app.get('/api/drive/auth', (req: Request, res: Response) => {
  const url = getAuthUrl();
  if (!url) {
    return res.status(500).json({ error: 'Google Drive not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
  }
  res.redirect(url);
});

// OAuth2 callback - Google redirects here after login
app.get('/api/drive/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  const success = await handleAuthCallback(code);
  if (success) {
    res.send(`
      <html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#fff;flex-direction:column;gap:16px">
        <h1 style="color:#4ade80">Google Drive Conectado</h1>
        <p>Las capturas se guardaran automaticamente cada 2 minutos.</p>
        <p>Puedes cerrar esta ventana.</p>
      </body></html>
    `);
  } else {
    res.status(500).send(`
      <html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#fff;flex-direction:column;gap:16px">
        <h1 style="color:#ef4444">Error de Autorizacion</h1>
        <p>No se pudo conectar con Google Drive. Intenta de nuevo.</p>
      </body></html>
    `);
  }
});

// ─── Drive Screenshot Browsing (filtro por dispositivo y dia) ───

// List all devices that have screenshots in Drive
app.get('/api/drive/devices', async (req: Request, res: Response) => {
  const folders = await listDeviceFolders();
  res.json(folders);
});

// List available dates for a device
app.get('/api/drive/dates/:deviceFolderId', async (req: Request, res: Response) => {
  const dates = await listDateFolders(req.params.deviceFolderId);
  res.json(dates);
});

// List screenshots for a specific date folder
app.get('/api/drive/files/:dateFolderId', async (req: Request, res: Response) => {
  const files = await listScreenshots(req.params.dateFolderId);
  res.json(files);
});

// Get screenshots by device name + date (combined query for frontend)
// Usage: GET /api/drive/screenshots?device=PC-cristian&date=2026-06-06
app.get('/api/drive/screenshots', async (req: Request, res: Response) => {
  const { device, date } = req.query;
  if (!device || !date) {
    return res.status(400).json({ error: 'Query params required: device, date (YYYY-MM-DD)' });
  }
  const screenshots = await getScreenshotsByDeviceAndDate(device as string, date as string);
  res.json(screenshots);
});

// Proxy a screenshot image from Drive (so frontend doesn't need Drive auth)
app.get('/api/drive/image/:fileId', async (req: Request, res: Response) => {
  const result = await getScreenshotStream(req.params.fileId);
  if (!result) {
    return res.status(404).json({ error: 'Screenshot not found or Drive not connected' });
  }
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h (screenshots don't change)
  result.stream.pipe(res);
});

// Get direct Google Drive folder URL for a device + date (opens in browser)
app.get('/api/drive/folder-url', async (req: Request, res: Response) => {
  const { device, date } = req.query;
  if (!device) return res.status(400).json({ error: 'device query param required' });
  const url = await getDriveFolderUrl(device as string, (date as string) || new Date().toISOString().split('T')[0]);
  if (!url) return res.json({ url: null, message: 'Folder not found or Drive not connected' });
  res.json({ url });
});

// ==========================================
// 404 & Error Handlers (must be last)
// ==========================================
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err: any, req: Request, res: Response, _next: any) => {
  console.error('[Unhandled Error]', err);
  const status = Number(err?.statusCode || err?.status || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: status === 500 ? 'Internal server error' : err.message || 'Bad request' });
});

// ─── Start Server ───

const PORT = process.env.PORT || 3001;
const server = httpServer.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  await syncPrismaSchemaOnBoot();
  await setupDb();
  if (prisma && (enterpriseRoutes as any).startEnterpriseSync) {
    (enterpriseRoutes as any).startEnterpriseSync(getDefaultCompanyId());
  }
  if (prisma) {
    try {
      const rules = await prisma.alertRule.findMany({ where: { enabled: true } });
      memoryAlertRules = rules.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type as any,
        condition: { metric: r.metric || undefined, operator: r.operator as any, value: r.value, duration: r.duration },
        action: r.action as any,
        enabled: r.enabled,
        createdAt: r.createdAt.toISOString()
      }));
      
      const apps = await prisma.blockedApp.findMany({ where: { enabled: true } });
      memoryBlockedApps = apps.map(a => ({
        id: a.id,
        name: a.name,
        action: a.action as any,
        enabled: a.enabled,
        createdAt: a.createdAt.toISOString()
      }));
      console.log(`[DB] Loaded ${rules.length} alert rules and ${apps.length} blocked apps`);
    } catch (e) {
      console.error('[DB] Failed to load rules on startup', e);
    }
  }
});

async function syncPrismaSchemaOnBoot() {
  if (!process.env.DATABASE_URL || process.env.SKIP_PRISMA_DB_PUSH === 'true') {
    lastPrismaDbPush = { ok: false, message: 'Skipped: DATABASE_URL missing or SKIP_PRISMA_DB_PUSH=true', at: new Date().toISOString() };
    return lastPrismaDbPush;
  }
  const cwd = process.cwd();
  const serverCwd = fs.existsSync(path.join(cwd, 'server', 'prisma.config.ts')) ? path.join(cwd, 'server') : cwd;
  const prismaBin = process.platform === 'win32' ? 'node_modules/.bin/prisma.cmd' : 'node_modules/.bin/prisma';
  const candidates = [
    { command: path.join(serverCwd, prismaBin), args: ['db', 'push', '--accept-data-loss', '--schema=prisma/schema.prisma'], cwd: serverCwd },
    { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['exec', 'prisma', 'db', 'push', '--accept-data-loss', '--schema=prisma/schema.prisma'], cwd: serverCwd },
    { command: path.join(cwd, prismaBin), args: ['db', 'push', '--accept-data-loss', '--schema=server/prisma/schema.prisma'] },
    { command: path.join(cwd, prismaBin), args: ['db', 'push', '--accept-data-loss', '--schema=prisma/schema.prisma'] },
    { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['--filter', 'server', 'exec', 'prisma', 'db', 'push', '--accept-data-loss', '--schema=prisma/schema.prisma'] },
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    if (candidate.command.includes('node_modules') && !fs.existsSync(candidate.command)) continue;
    try {
      const { stdout, stderr } = await execFileAsync(candidate.command, candidate.args, { cwd: candidate.cwd || cwd, timeout: 120000, maxBuffer: 1024 * 1024 });
      if (stdout.trim()) console.log('[PrismaDbPush]', stdout.trim());
      if (stderr.trim()) console.warn('[PrismaDbPush]', stderr.trim());
      lastPrismaDbPush = { ok: true, message: [stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || 'db push completed', at: new Date().toISOString() };
      return lastPrismaDbPush;
    } catch (error) {
      const lockedTable = schemaLockedTable(error);
      if (lockedTable && await unlockCockroachTable(lockedTable)) {
        try {
          const { stdout, stderr } = await execFileAsync(candidate.command, candidate.args, { cwd: candidate.cwd || cwd, timeout: 120000, maxBuffer: 1024 * 1024 });
          if (stdout.trim()) console.log('[PrismaDbPush]', stdout.trim());
          if (stderr.trim()) console.warn('[PrismaDbPush]', stderr.trim());
          lastPrismaDbPush = { ok: true, message: [stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || 'db push completed after unlocking schema', at: new Date().toISOString() };
          return lastPrismaDbPush;
        } catch (retryError) {
          lastError = retryError;
          continue;
        }
      }
      lastError = error;
    }
  }
  lastPrismaDbPush = { ok: false, message: lastError instanceof Error ? lastError.message : String(lastError), at: new Date().toISOString() };
  console.error('[PrismaDbPush] failed:', lastPrismaDbPush.message);
  return lastPrismaDbPush;
}

function schemaLockedTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/table \"([^\"]+)\" is locked/i)?.[1] || '';
}

async function unlockCockroachTable(tableName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) return false;
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) return false;
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  try {
    await pool.query(`ALTER TABLE ${tableName} SET (schema_locked = false)`);
    console.warn(`[PrismaDbPush] unlocked CockroachDB schema lock on ${tableName}`);
    return true;
  } catch (error) {
    console.error(`[PrismaDbPush] failed to unlock ${tableName}:`, error instanceof Error ? error.message : error);
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

// Graceful Shutdown para Produccion
const gracefulShutdown = async () => {
  console.log('Received shutdown signal. Closing HTTP server and DB connections...');
  server.close(() => {
    console.log('HTTP server closed.');
  });
  if (prisma) {
    await prisma.$disconnect();
    console.log('Prisma disconnected.');
  }
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
