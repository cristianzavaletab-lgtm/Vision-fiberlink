import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { supabase } from './supabase';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // For MVP, allow all origins
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8 // Allow large payloads for screenshots (100MB)
});

// In-memory storage for MVP
const connectedDevices = new Map<string, any>();
const latestScreenshots = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Agent registering itself
  socket.on('register-agent', async (data) => {
    console.log(`Agent registered: ${data.name} (${socket.id})`);
    connectedDevices.set(socket.id, {
      id: socket.id,
      name: data.name,
      os: data.os,
      status: 'online',
      lastSeen: Date.now(),
      socketId: socket.id
    });
    
    // Broadcast updated device list to all frontend clients
    io.emit('devices-update', Array.from(connectedDevices.values()));

    if (supabase) {
      try {
        await supabase.from('devices').upsert({
          id: socket.id,
          name: data.name,
          os: data.os,
          status: 'online',
          last_seen: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error saving to Supabase:', err);
      }
    }
  });

  // Agent sending screenshot
  socket.on('screenshot', async (data) => {
    // data: { image: base64, metrics?: { cpu: number, ram: number } }
    if (connectedDevices.has(socket.id)) {
      const device = connectedDevices.get(socket.id);
      device.lastSeen = Date.now();
      
      let metricsUpdated = false;
      if (data.metrics) {
        device.cpu = data.metrics.cpu;
        device.ram = data.metrics.ram;
        metricsUpdated = true;
        // Broadcast updated device list to frontend clients when metrics change
        io.emit('devices-update', Array.from(connectedDevices.values()));
      }
      
      latestScreenshots.set(socket.id, data.image);
      
      // Send screenshot to frontend clients
      io.emit('screenshot-update', {
        deviceId: socket.id,
        image: data.image,
        timestamp: Date.now()
      });

      if (metricsUpdated && supabase) {
        try {
          await supabase.from('devices').update({
            cpu: data.metrics.cpu,
            ram: data.metrics.ram,
            last_seen: new Date().toISOString()
          }).eq('id', socket.id);
        } catch (err) {
          console.error('Error updating metrics in Supabase:', err);
        }
      }
    }
  });

  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (connectedDevices.has(socket.id)) {
      connectedDevices.delete(socket.id);
      latestScreenshots.delete(socket.id);
      // Broadcast updated device list
      io.emit('devices-update', Array.from(connectedDevices.values()));

      if (supabase) {
        try {
          await supabase.from('devices').update({
            status: 'offline',
            last_seen: new Date().toISOString()
          }).eq('id', socket.id);
        } catch (err) {
          console.error('Error updating disconnect status in Supabase:', err);
        }
      }
    }
  });
});

app.get('/api/devices', (req, res) => {
  res.json(Array.from(connectedDevices.values()));
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  if (supabase) {
    console.log('Recuperando dispositivos históricos de Supabase...');
    try {
      const { data, error } = await supabase.from('devices').select('*');
      if (error) throw error;
      if (data) {
        data.forEach(d => {
          connectedDevices.set(d.id, {
            id: d.id,
            name: d.name,
            os: d.os,
            status: d.status,
            lastSeen: d.last_seen ? new Date(d.last_seen).getTime() : Date.now(),
            cpu: d.cpu,
            ram: d.ram,
            socketId: null
          });
        });
        console.log(`✅ ${data.length} dispositivos históricos cargados en memoria.`);
      }
    } catch (err) {
      console.error('Error al cargar desde Supabase:', err);
    }
  }

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
}

startServer();
