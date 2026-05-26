const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 5e6 // 5MB for screenshots
});

app.use(cors());
app.use(express.json());

// Track agents by their device ID
const agents = new Map(); // deviceId -> socketId

io.on('connection', (socket) => {
  console.log('🔌 Nuevo cliente conectado:', socket.id);

  // Identify client type
  socket.on('identify', (data) => {
    socket.data.type = data.type;
    socket.data.name = data.name;
    console.log(`👤 Identificado: ${data.type} (${data.name || socket.id})`);
  });

  // ─── Agent Events ───
  socket.on('register-agent', (data) => {
    socket.data.type = 'agent';
    socket.data.deviceId = data.id || socket.id;
    socket.data.name = data.name;
    agents.set(socket.data.deviceId, socket.id);
    console.log(`🖥️  Agente registrado: ${data.name} (${socket.data.deviceId})`);
    // Notify all dashboards
    io.emit('agent-registered', { id: socket.data.deviceId, name: data.name, os: data.os });
  });

  socket.on('screenshot', (data) => {
    // Broadcast screenshot to all dashboard clients
    socket.broadcast.emit('screenshot', {
      deviceId: socket.data.deviceId || socket.id,
      image: data.image,
      metrics: data.metrics
    });
  });

  // ─── Remote Control Events (Dashboard → Server → Agent) ───
  socket.on('remote-mouse', (data) => {
    // data: { deviceId, x, y, type: 'move'|'click'|'dblclick'|'rightclick', button }
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('remote-mouse', {
        x: data.x,
        y: data.y,
        type: data.type,
        button: data.button
      });
    }
  });

  socket.on('remote-keyboard', (data) => {
    // data: { deviceId, key, type: 'keydown'|'keyup', modifiers }
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('remote-keyboard', {
        key: data.key,
        type: data.type,
        modifiers: data.modifiers
      });
    }
  });

  socket.on('remote-scroll', (data) => {
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('remote-scroll', {
        deltaX: data.deltaX,
        deltaY: data.deltaY
      });
    }
  });

  socket.on('remote-ctrl-alt-del', (data) => {
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('remote-ctrl-alt-del');
    }
  });

  socket.on('remote-power', (data) => {
    // data: { deviceId, action: 'shutdown'|'restart' }
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('remote-power', { action: data.action });
    }
  });

  // ─── Remote Session Start/Stop ───
  socket.on('start-remote', (data) => {
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('start-remote');
      console.log(`🎮 Sesión remota iniciada en ${data.deviceId}`);
    }
  });

  socket.on('stop-remote', (data) => {
    const agentSocketId = agents.get(data.deviceId);
    if (agentSocketId) {
      io.to(agentSocketId).emit('stop-remote');
      console.log(`🛑 Sesión remota finalizada en ${data.deviceId}`);
    }
  });

  // ─── Disconnect ───
  socket.on('disconnect', () => {
    if (socket.data.type === 'agent' && socket.data.deviceId) {
      agents.delete(socket.data.deviceId);
      io.emit('agent-disconnected', { id: socket.data.deviceId });
      console.log(`👋 Agente desconectado: ${socket.data.deviceId}`);
    } else {
      console.log('👋 Cliente desconectado:', socket.id);
    }
  });
});

app.get('/', (req, res) => {
  res.send('FiberlinkDesk API is running...');
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
