import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { supabase } from './supabase';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';
import { sendPushNotificationToCompany } from './services/webpush';
import { initEmailService, getEmailConfig, updateEmailConfig, sendScheduledReport, sendTestEmail, setReportDataGetter } from './services/emailReports';
import { loadData, saveData, flushAll } from './services/dataStore';
import { startDriveUploadJob, getAuthUrl, handleAuthCallback, getDriveStatus, listDeviceFolders, listDateFolders, listScreenshots, getScreenshotStream, getScreenshotsByDeviceAndDate } from './services/driveUploader';

const app = express();
app.use(cors());
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

// NOTE: app.use('/api', apiRoutes) is mounted AFTER in-memory routes
// so that sedes/reports/settings endpoints are handled first without
// going through apiRoutes' strict authRequired middleware.

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 
});

export const agentNs = io.of('/agent');
export const dashboardNs = io.of('/dashboard');

// In-memory storage for MVP (loaded from disk on startup, persisted on changes)
const connectedDevices = new Map<string, any>();
const socketToDevice = new Map<string, string>(); // Maps socket.id -> deviceId
const latestScreenshots = new Map<string, string>();
const memoryActivities: any[] = loadData('activities', []);
const memoryIncidents: any[] = loadData('incidents', []);
const memorySettings: Record<string, any> = loadData('settings', {
  fps: 15,
  quality: 60,
  heartbeatInterval: 10,
  requireConfirmation: true
});

interface Sede {
  id: string;
  name: string;
  location: string;
  devices: string[]; // device IDs assigned to this sede
  createdAt: string;
}
const memorySedes: Sede[] = loadData<Sede[]>('sedes', []);

// ─── Activity Tracking: App Sessions & Boot Sessions (in-memory + DB) ───
interface AppSessionEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  appName: string;
  startedAt: string;
  endedAt?: string;
  duration?: number; // seconds
}

interface BootSessionEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  bootAt: string;
  shutdownAt?: string;
  totalSeconds?: number;
}

const memoryAppSessions: AppSessionEntry[] = loadData<AppSessionEntry[]>('appSessions', []);
const activeAppSessions = new Map<string, AppSessionEntry>(); // deviceId -> current session
const memoryBootSessions: BootSessionEntry[] = loadData<BootSessionEntry[]>('bootSessions', []);
const activeBootSessions = new Map<string, BootSessionEntry>(); // deviceId -> current boot session

// Keep last 7 days of data in memory (cleanup old entries)
const MAX_MEMORY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cleanOldMemoryData() {
  const cutoff = new Date(Date.now() - MAX_MEMORY_AGE_MS).toISOString();
  // Clean old app sessions
  while (memoryAppSessions.length > 0 && memoryAppSessions[0].startedAt < cutoff) {
    memoryAppSessions.shift();
  }
  // Clean old activities (keep last 5000)
  while (memoryActivities.length > 5000) {
    memoryActivities.shift();
  }
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
  memoryAppSessions.push(session);
  activeAppSessions.set(deviceId, session);
  saveData('appSessions', memoryAppSessions);
  return session;
}

function startBootSession(deviceId: string, deviceName: string): BootSessionEntry {
  // Close previous boot session if exists
  const existing = activeBootSessions.get(deviceId);
  if (existing) {
    existing.shutdownAt = new Date().toISOString();
    existing.totalSeconds = Math.round((new Date(existing.shutdownAt).getTime() - new Date(existing.bootAt).getTime()) / 1000);
  }
  const session: BootSessionEntry = {
    id: `boot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    deviceName,
    bootAt: new Date().toISOString(),
  };
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

const memoryAlertRules: AlertRule[] = loadData<AlertRule[]>('alertRules', [
  // Default rules
  { id: 'default_cpu', name: 'CPU Alto', type: 'cpu_high', condition: { metric: 'cpu', operator: '>', value: 90, duration: 60 }, action: 'notify_and_log', enabled: true, createdAt: new Date().toISOString() },
  { id: 'default_ram', name: 'RAM Alta', type: 'ram_high', condition: { metric: 'ram', operator: '>', value: 90, duration: 30 }, action: 'notify', enabled: true, createdAt: new Date().toISOString() },
]);

// Track how long a condition has persisted per device
const alertConditionTimers = new Map<string, Map<string, number>>(); // deviceId -> ruleId -> timestamp when condition started

// ─── Blocked Apps System ───
interface BlockedApp {
  id: string;
  name: string; // Pattern to match in window title
  action: 'kill' | 'notify' | 'log';
  enabled: boolean;
  createdAt: string;
}

const memoryBlockedApps: BlockedApp[] = loadData<BlockedApp[]>('blockedApps', []);

// ─── Screenshot History (mini-cache for quick timeline preview, Drive handles long-term storage) ───
interface ScreenshotRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  image: string; // base64 (thumbnail quality)
  timestamp: string;
}

const screenshotHistory: ScreenshotRecord[] = [];
const MAX_SCREENSHOT_HISTORY = 20; // Minimal cache - Drive handles long-term archival
const SCREENSHOT_SAVE_INTERVAL = 120000; // Save to cache every 2 minutes per device (matches Drive interval)
const lastScreenshotSave = new Map<string, number>(); // deviceId -> last save timestamp

function saveScreenshotToHistory(deviceId: string, deviceName: string, image: string) {
  const now = Date.now();
  const lastSave = lastScreenshotSave.get(deviceId) || 0;
  if (now - lastSave < SCREENSHOT_SAVE_INTERVAL) return; // Rate limit
  
  lastScreenshotSave.set(deviceId, now);
  const record: ScreenshotRecord = {
    id: `ss_${now}_${Math.random().toString(36).slice(2, 6)}`,
    deviceId,
    deviceName,
    image, // Store the base64 directly (already compressed JPEG)
    timestamp: new Date().toISOString(),
  };
  screenshotHistory.push(record);
  
  // Trim old records (keep minimal - Drive handles archival)
  while (screenshotHistory.length > MAX_SCREENSHOT_HISTORY) {
    screenshotHistory.shift();
  }
}

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

// Helper: find agent socket by deviceId (looks up socketId from connectedDevices)
function getAgentSocket(deviceId: string) {
  const device = connectedDevices.get(deviceId);
  if (device && device.socketId) {
    return agentNs.sockets.get(device.socketId) || io.sockets.sockets.get(device.socketId);
  }
  // Fallback: try direct lookup (for legacy agents where deviceId === socket.id)
  return io.sockets.sockets.get(deviceId) || agentNs.sockets.get(deviceId);
}

// Helper para emitir a ambos (legacy y dashboard)
function broadcastToDashboards(event: string, data: any) {
  io.emit(event, data); // Legacy clients
  io.of('/dashboard').emit(event, data); // New clients
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
      
      if (supabase) {
        supabase.from('devices').update({ status: 'offline' }).eq('id', id).then();
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

agentNs.on('connection', (socket) => {
  console.log(`[NS: /agent] Agente conectado: ${socket.id}`);

  socket.on('agent:register', async (data) => {
    console.log(`[NS: /agent] agent:register -> ${data.name} (device: ${data.deviceId})`);
    
    const deviceId = data.deviceId || socket.id; // Fallback for old agents
    socketToDevice.set(socket.id, deviceId);

    connectedDevices.set(deviceId, {
      id: deviceId,
      name: data.name,
      os: data.os,
      status: 'online',
      lastSeen: Date.now(),
      socketId: socket.id,
      cpu: 0,
      ram: 0,
      activeApp: ''
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
    
    if (supabase) {
      supabase.from('devices').upsert({ id: deviceId, name: data.name, os: data.os, status: 'online', last_seen: new Date().toISOString() }).then();
    }
  });

  // Handle boot event from agent (tracks system uptime from actual boot time)
  socket.on('agent:boot', (data: { deviceId: string; bootTime: string; uptime: number; hostname: string }) => {
    const deviceId = socketToDevice.get(socket.id) || data.deviceId;
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
      memoryActivities.push(activity);
      broadcastToDashboards('activity-log', activity);
    }
  });

  socket.on('agent:heartbeat', async (data) => {
    // data: { cpu: number, ram: number, activeApp: string }
    const deviceId = socketToDevice.get(socket.id);
    if (!deviceId) return;
    
    const device = connectedDevices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      device.status = 'online';
      device.cpu = data.cpu;
      device.ram = data.ram;
      
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
        memoryActivities.push(activity);
        
        broadcastToDashboards('activity-log', activity);
        dashboardNs.to(`device_${deviceId}`).emit('device:activity', activity);
      }
      
      if (device.cpu > 80 && !device.cpuAlert) {
         device.cpuAlert = true;
         const incident = { id: Date.now().toString(), deviceId: deviceId, deviceName: device.name, type: 'high_cpu', severity: 'high', status: 'abierta', description: `CPU al ${Math.round(device.cpu)}%`, date: new Date().toISOString() };
         memoryIncidents.push(incident);
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
            memoryActivities.push(blockActivity);
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
    const deviceId = socketToDevice.get(socket.id);
    if (!deviceId) return;
    dashboardNs.to(`terminal_${deviceId}`).emit('terminal:output', {
      deviceId: deviceId,
      output: data.output,
      isError: data.isError || false,
    });
  });

  socket.on('agent:screenshot', (data) => {
    // Validar tamano maximo (ej. evitar spam de 10MB+)
    if (data.image && data.image.length > 5 * 1024 * 1024) {
      console.warn(`[NS: /agent] Screenshot ignorado por ser muy pesado: ${socket.id}`);
      return;
    }

    const deviceId = socketToDevice.get(socket.id);
    if (!deviceId) return;

    const device = connectedDevices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      
      // Save to screenshot history (rate limited internally)
      saveScreenshotToHistory(deviceId, device.name, data.image);
    }
    latestScreenshots.set(deviceId, data.image);
    
    const payload = { 
      deviceId: deviceId, 
      image: data.image, 
      timestamp: data.metadata?.timestamp || Date.now(),
      metadata: data.metadata 
    };

    // Emitir a clientes legacy
    io.emit('screenshot-update', payload);
    // Emitir SOLAMENTE a los dashboards suscritos a este equipo
    dashboardNs.to(`device_${deviceId}`).emit('screenshot-update', payload);
  });

  socket.on('disconnect', () => {
    console.log(`[NS: /agent] Agente desconectado: ${socket.id}`);
    const deviceId = socketToDevice.get(socket.id);
    if (deviceId) {
      socketToDevice.delete(socket.id);
      // Close active app session and boot session
      closeAppSession(deviceId);
      closeBootSession(deviceId);
      
      const device = connectedDevices.get(deviceId);
      if (device) {
        device.status = 'offline';
        addNotification('device_offline', 'Dispositivo desconectado', `${device.name} se desconecto`, deviceId, device.name);
        broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
        if (supabase) {
          supabase.from('devices').update({ status: 'offline' }).eq('id', deviceId).then();
        }
      }
    }
  });
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
  console.log(`[NS: /dashboard] Admin conectado: ${socket.id}`);
  
  // Enviar estado actual de inmediato
  socket.emit('devices-update', Array.from(connectedDevices.values()));

  socket.on('dashboard:subscribe', (data) => {
    console.log(`[NS: /dashboard] Admin ${socket.id} se suscribió al equipo ${data.deviceId}`);
    socket.join(`device_${data.deviceId}`);
    
    // Notify the agent to start high-speed streaming
    const targetAgent = getAgentSocket(data.deviceId);
    if (targetAgent) {
      targetAgent.emit('stream:start', {
        fps: parseInt(memorySettings.fps) || 15,
        quality: parseInt(memorySettings.quality) || 60
      });
    }
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

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room.startsWith('device_')) {
        const deviceId = room.replace('device_', '');
        process.nextTick(() => {
          const count = getRoomSubscriberCount(deviceId);
          if (count === 0) {
            const targetAgent = getAgentSocket(deviceId);
            if (targetAgent) {
              targetAgent.emit('stream:stop');
            }
          }
        });
      }
    }
  });

  socket.on('remote:mouse', (data) => {
    // Redirigir al agente (busca en legacy o en agentNs)
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:mouse', data);
  });

  socket.on('remote:keyboard', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:keyboard', data);
  });

  socket.on('remote:command', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:command', data);
  });

  socket.on('remote:disconnect', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.disconnect(true);
  });

  socket.on('remote:scroll', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-scroll', data);
  });

  socket.on('remote:monitor-select', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:monitor-select', { monitorId: data.monitorId });
  });

  // Dynamic quality change (HD toggle from dashboard)
  socket.on('stream:quality', (data: { deviceId: string; quality: number; fps: number }) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) {
      targetSocket.emit('stream:start', { fps: data.fps, quality: data.quality });
      console.log(`[Quality] Device ${data.deviceId} -> quality=${data.quality}, fps=${data.fps}`);
    }
  });

  socket.on('start-remote', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('start-remote', data);
  });

  socket.on('stop-remote', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('stop-remote', data);
  });

  socket.on('remote-power', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-power', data);
  });

  socket.on('remote-ctrl-alt-del', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-ctrl-alt-del', data);
  });

  // ─── Terminal relay ───
  socket.on('terminal:start', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) {
      targetSocket.emit('terminal:start');
      // Store which dashboard socket is connected to which terminal
      socket.join(`terminal_${data.deviceId}`);
    }
  });

  socket.on('terminal:input', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('terminal:input', { command: data.command });
  });

  socket.on('terminal:stop', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('terminal:stop');
    socket.leave(`terminal_${data.deviceId}`);
  });

  // ─── Audio relay (Escucha Activa) ───
  socket.on('audio:start', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('audio:start');
  });

  socket.on('audio:chunk', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('audio:chunk', { chunk: data.chunk, mimeType: data.mimeType });
  });

  socket.on('audio:stream', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('audio:stream', { audio: data.audio });
  });

  socket.on('audio:stop', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('audio:stop');
  });
});

// ==========================================
// 3. NAMESPACE: / (Legacy, Mantiene compatibilidad)
// ==========================================
io.on('connection', (socket) => {
  console.log(`[Legacy] Cliente conectado: ${socket.id}`);
  
  socket.on('register-agent', async (data) => {
    console.log(`[Legacy] register-agent: ${data.name}`);
    connectedDevices.set(socket.id, { id: socket.id, name: data.name, os: data.os, status: 'online', lastSeen: Date.now(), socketId: socket.id });
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
      if (data.image && data.image.length > 5 * 1024 * 1024) return;
      latestScreenshots.set(socket.id, data.image);
      const payload = { deviceId: socket.id, image: data.image, timestamp: Date.now(), metadata: data.metadata };
      io.emit('screenshot-update', payload);
      dashboardNs.to(`device_${socket.id}`).emit('screenshot-update', payload);
    }
  });

  // Proxy de control remoto (Legacy frontend)
  socket.on('remote-mouse', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-mouse', data);
  });

  socket.on('remote-keyboard', (data) => {
    const targetSocket = getAgentSocket(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-keyboard', data);
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

app.get('/api/reports/summary', (req: Request, res: Response) => {
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

app.get('/api/reports', (req: Request, res: Response) => {
  // Combine activities and incidents for a general report view
  res.json([...memoryActivities, ...memoryIncidents]);
});

// ─── NEW: Activity Timeline & Reports ───

// Get app sessions for a device (or all) within a date range
app.get('/api/reports/timeline', (req: Request, res: Response) => {
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
app.get('/api/reports/daily', (req: Request, res: Response) => {
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
app.get('/api/reports/boot-sessions', (req: Request, res: Response) => {
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
app.get('/api/reports/live-feed', (req: Request, res: Response) => {
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
app.use('/api', apiRoutes);

// ==========================================
// 404 & Error Handlers (must be last)
// ==========================================
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err: any, req: Request, res: Response, _next: any) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

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

// ─── Start Server ───

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);

  // Start Google Drive upload background job
  startDriveUploadJob(() => {
    // Return all online devices with their latest screenshots
    const result: Array<{ deviceName: string; image: string }> = [];
    for (const [deviceId, device] of connectedDevices.entries()) {
      const screenshot = latestScreenshots.get(deviceId);
      if (screenshot && device.status === 'online') {
        result.push({ deviceName: device.name || deviceId, image: screenshot });
      }
    }
    return result;
  });
});
