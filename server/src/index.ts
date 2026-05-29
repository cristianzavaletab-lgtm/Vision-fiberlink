import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { supabase } from './supabase';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';

const app = express();
app.use(cors());
app.use(express.json());

// Routes
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

// In-memory storage for MVP
const connectedDevices = new Map<string, any>();
const latestScreenshots = new Map<string, string>();
const memoryActivities: any[] = [];
const memoryIncidents: any[] = [];
const memorySettings: Record<string, string> = {
  streamingFps: '15',
  streamingQuality: 'medium',
  agentHeartbeat: '5',
  pwaInstallable: 'true'
};

const AGENT_TIMEOUT_MS = 15000; // 15 segundos sin reportarse = offline

// Helper para emitir a ambos (legacy y dashboard)
function broadcastToDashboards(event: string, data: any) {
  io.emit(event, data); // Legacy clients
  io.of('/dashboard').emit(event, data); // New clients
}

// Monitor de estado offline
setInterval(() => {
  const now = Date.now();
  let statusChanged = false;
  
  for (const [id, device] of connectedDevices.entries()) {
    if (device.status === 'online' && (now - device.lastSeen) > AGENT_TIMEOUT_MS) {
      console.log(`[Heartbeat] Dispositivo ${device.name} pasó a OFFLINE (timeout)`);
      device.status = 'offline';
      statusChanged = true;
      
      if (supabase) {
        supabase.from('devices').update({ status: 'offline' }).eq('id', id).then();
      }
    }
  }
  
  if (statusChanged) {
    broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
  }
}, 5000);

// ==========================================
// 1. NAMESPACE: /agent (Nuevos Agentes)
// ==========================================
const agentNs = io.of('/agent');

agentNs.on('connection', (socket) => {
  console.log(`[NS: /agent] Agente conectado: ${socket.id}`);

  socket.on('agent:register', async (data) => {
    console.log(`[NS: /agent] agent:register -> ${data.name}`);
    connectedDevices.set(socket.id, {
      id: socket.id,
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
    
    if (supabase) {
      supabase.from('devices').upsert({ id: socket.id, name: data.name, os: data.os, status: 'online', last_seen: new Date().toISOString() }).then();
    }
  });

  socket.on('agent:heartbeat', async (data) => {
    // data: { cpu: number, ram: number, activeApp: string }
    const device = connectedDevices.get(socket.id);
    if (device) {
      device.lastSeen = Date.now();
      device.status = 'online';
      device.cpu = data.cpu;
      device.ram = data.ram;
      
      if (data.activeApp && data.activeApp !== device.activeApp) {
        device.activeApp = data.activeApp;
        const activity = { id: Date.now().toString(), deviceId: socket.id, deviceName: device.name, type: 'Actividad', description: `Cambió a: ${data.activeApp}`, status: 'Automático', severity: 'low', date: new Date().toISOString() };
        memoryActivities.push(activity);
        
        broadcastToDashboards('activity-log', activity);
        dashboardNs.to(`device_${socket.id}`).emit('device:activity', activity);
      }
      
      if (device.cpu > 80 && !device.cpuAlert) {
         device.cpuAlert = true;
         const incident = { id: Date.now().toString(), deviceId: socket.id, deviceName: device.name, type: 'high_cpu', severity: 'high', status: 'abierta', description: `CPU al ${Math.round(device.cpu)}%`, date: new Date().toISOString() };
         memoryIncidents.push(incident);
         broadcastToDashboards('incident-log', incident);
         dashboardNs.to(`device_${socket.id}`).emit('device:incident', incident);
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

  socket.on('agent:screenshot', (data) => {
    // Validar tamaño máximo (ej. evitar spam de 10MB+)
    if (data.image && data.image.length > 5 * 1024 * 1024) {
      console.warn(`[NS: /agent] Screenshot ignorado por ser muy pesado: ${socket.id}`);
      return;
    }

    const device = connectedDevices.get(socket.id);
    if (device) device.lastSeen = Date.now();
    latestScreenshots.set(socket.id, data.image);
    
    const payload = { 
      deviceId: socket.id, 
      image: data.image, 
      timestamp: data.metadata?.timestamp || Date.now(),
      metadata: data.metadata 
    };

    // Emitir a clientes legacy
    io.emit('screenshot-update', payload);
    // Emitir SOLAMENTE a los dashboards suscritos a este equipo
    dashboardNs.to(`device_${socket.id}`).emit('screenshot-update', payload);
  });

  socket.on('disconnect', () => {
    console.log(`[NS: /agent] Agente desconectado: ${socket.id}`);
    const device = connectedDevices.get(socket.id);
    if (device) {
      device.status = 'offline';
      broadcastToDashboards('devices-update', Array.from(connectedDevices.values()));
      if (supabase) {
        supabase.from('devices').update({ status: 'offline' }).eq('id', socket.id).then();
      }
    }
  });
});

// ==========================================
// 2. NAMESPACE: /dashboard (Nuevos Clientes UI)
// ==========================================
const dashboardNs = io.of('/dashboard');

dashboardNs.on('connection', (socket) => {
  console.log(`[NS: /dashboard] Admin conectado: ${socket.id}`);
  
  // Enviar estado actual de inmediato
  socket.emit('devices-update', Array.from(connectedDevices.values()));

  socket.on('dashboard:subscribe', (data) => {
    console.log(`[NS: /dashboard] Admin ${socket.id} se suscribió al equipo ${data.deviceId}`);
    socket.join(`device_${data.deviceId}`);
  });

  socket.on('remote:mouse', (data) => {
    // Redirigir al agente (busca en legacy o en agentNs)
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:mouse', data);
  });

  socket.on('remote:keyboard', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:keyboard', data);
  });

  socket.on('remote:command', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote:command', data);
  });

  socket.on('remote:disconnect', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.disconnect(true);
  });

  socket.on('remote:scroll', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-scroll', data);
  });

  socket.on('start-remote', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('start-remote', data);
  });

  socket.on('stop-remote', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('stop-remote', data);
  });

  socket.on('remote-power', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-power', data);
  });

  socket.on('remote-ctrl-alt-del', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-ctrl-alt-del', data);
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
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
    if (targetSocket) targetSocket.emit('remote-mouse', data);
  });

  socket.on('remote-keyboard', (data) => {
    const targetSocket = io.sockets.sockets.get(data.deviceId) || agentNs.sockets.get(data.deviceId);
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
  res.json(Array.from(connectedDevices.values()));
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
  res.json({
    totalIncidents: memoryIncidents.length,
    criticalOpen: memoryIncidents.filter(i => i.severity === 'critical' && i.status === 'abierta').length,
    offlineDevices: Array.from(connectedDevices.values()).filter(d => d.status === 'offline').length,
    sessionsToday: 0
  });
});

app.get('/api/reports', (req: Request, res: Response) => {
  // Combine activities and incidents for a general report view
  res.json([...memoryActivities, ...memoryIncidents]);
});

app.get('/api/settings', (req: Request, res: Response) => {
  res.json(memorySettings);
});

app.patch('/api/settings', (req: Request, res: Response) => {
  Object.assign(memorySettings, req.body);
  dashboardNs.emit('settings:update', memorySettings);
  res.json(memorySettings);
});

// ==========================================
// ENDPOINTS DE HEALTHCHECK Y VERSIÓN (QA / PROD)
// ==========================================

const BUILD_TIME = new Date().toISOString();

app.get(['/health', '/api/health'], async (req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  
  // Try to check Prisma if configured
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
    activeAgents: io.of('/agent').sockets.size + io.sockets.sockets.size,
    activeDashboards: io.of('/dashboard').sockets.size,
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
