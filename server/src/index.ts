import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { supabase } from './supabase';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';
import { sendPushNotificationToCompany } from './services/webpush';

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

// Routes (authenticated)
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

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

// In-memory storage for MVP
const connectedDevices = new Map<string, any>();
const socketToDevice = new Map<string, string>(); // Maps socket.id -> deviceId
const latestScreenshots = new Map<string, string>();
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
  devices: string[]; // device IDs assigned to this sede
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

const memoryAppSessions: AppSessionEntry[] = [];
const activeAppSessions = new Map<string, AppSessionEntry>(); // deviceId -> current session
const memoryBootSessions: BootSessionEntry[] = [];
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
    // Validar tamaño máximo (ej. evitar spam de 10MB+)
    if (data.image && data.image.length > 5 * 1024 * 1024) {
      console.warn(`[NS: /agent] Screenshot ignorado por ser muy pesado: ${socket.id}`);
      return;
    }

    const deviceId = socketToDevice.get(socket.id);
    if (!deviceId) return;

    const device = connectedDevices.get(deviceId);
    if (device) device.lastSeen = Date.now();
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

app.patch('/api/settings', (req: Request, res: Response) => {
  Object.assign(memorySettings, req.body);
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
  res.status(201).json(sede);
});

app.patch('/api/sedes/:id', (req: Request, res: Response) => {
  const sede = memorySedes.find(s => s.id === req.params.id);
  if (!sede) return res.status(404).json({ error: 'Sede not found' });
  if (req.body.name) sede.name = req.body.name;
  if (req.body.location !== undefined) sede.location = req.body.location;
  if (req.body.color !== undefined) (sede as any).color = req.body.color;
  res.json(sede);
});

app.delete('/api/sedes/:id', (req: Request, res: Response) => {
  const idx = memorySedes.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sede not found' });
  memorySedes.splice(idx, 1);
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
