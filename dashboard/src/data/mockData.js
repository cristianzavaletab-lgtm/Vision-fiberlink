// ============================================================
// SENTINELDESK — MOCK DATA
// ============================================================

export const CURRENT_USER = {
  name: 'Andrea R.',
  role: 'SOC Analyst',
  initials: 'AR',
  email: 'andrea.r@sentineldesk.io',
};

export const SEDES = [
  { id: 1, name: 'Lima HQ',     city: 'Lima',      country: 'PE', devices: 284, online: 271, alerts: 3,  status: 'operational' },
  { id: 2, name: 'Arequipa',    city: 'Arequipa',  country: 'PE', devices: 98,  online: 91,  alerts: 1,  status: 'operational' },
  { id: 3, name: 'Cusco',       city: 'Cusco',     country: 'PE', devices: 67,  online: 62,  alerts: 0,  status: 'operational' },
  { id: 4, name: 'Trujillo',    city: 'Trujillo',  country: 'PE', devices: 112, online: 108, alerts: 2,  status: 'operational' },
  { id: 5, name: 'Piura',       city: 'Piura',     country: 'PE', devices: 88,  online: 79,  alerts: 1,  status: 'degraded'    },
  { id: 6, name: 'Chiclayo',    city: 'Chiclayo',  country: 'PE', devices: 54,  online: 52,  alerts: 0,  status: 'operational' },
  { id: 7, name: 'Iquitos',     city: 'Iquitos',   country: 'PE', devices: 41,  online: 38,  alerts: 0,  status: 'operational' },
  { id: 8, name: 'Tacna',       city: 'Tacna',     country: 'PE', devices: 29,  online: 27,  alerts: 1,  status: 'operational' },
  { id: 9, name: 'Huancayo',    city: 'Huancayo',  country: 'PE', devices: 73,  online: 68,  alerts: 0,  status: 'operational' },
  { id: 10, name: 'Ica',        city: 'Ica',       country: 'PE', devices: 36,  online: 31,  alerts: 1,  status: 'degraded'    },
  { id: 11, name: 'Puno',       city: 'Puno',      country: 'PE', devices: 22,  online: 20,  alerts: 0,  status: 'operational' },
  { id: 12, name: 'Cajamarca',  city: 'Cajamarca', country: 'PE', devices: 48,  online: 44,  alerts: 0,  status: 'operational' },
];

export const DEVICES = [
  { id: 'LIM-1000', model: 'LATITUDE-5400', user: '@j.morales',  sede: 'Lima HQ',   status: 'online',  cpu: 15, ram: 30, uptime: '99.8%', os: 'Windows 11 Pro', ip: '10.0.1.45',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1001', model: 'LATITUDE-5401', user: '@m.flores',   sede: 'Arequipa',  status: 'online',  cpu: 22, ram: 41, uptime: '98.9%', os: 'Windows 11 Pro', ip: '10.1.2.12',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1002', model: 'LATITUDE-5402', user: '@r.tapia',    sede: 'Cusco',     status: 'online',  cpu: 29, ram: 52, uptime: '99.1%', os: 'Windows 10 Pro', ip: '10.2.3.88',   agent: 'v2.0.8', lastSeen: 'Ahora' },
  { id: 'LIM-1003', model: 'LATITUDE-5403', user: '@a.lopez',    sede: 'Trujillo',  status: 'idle',    cpu: 36, ram: 63, uptime: '97.5%', os: 'Windows 11 Pro', ip: '10.3.4.22',   agent: 'v2.1.0', lastSeen: 'hace 2min' },
  { id: 'LIM-1004', model: 'LATITUDE-5404', user: '@c.vega',     sede: 'Piura',     status: 'offline', cpu: 0,  ram: 0,  uptime: '94.2%', os: 'Windows 11 Pro', ip: '10.4.5.67',   agent: 'v2.0.5', lastSeen: 'hace 18min' },
  { id: 'LIM-1005', model: 'LATITUDE-5405', user: '@d.rios',     sede: 'Lima HQ',   status: 'online',  cpu: 8,  ram: 24, uptime: '99.9%', os: 'Windows 10 Pro', ip: '10.0.1.91',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1006', model: 'LATITUDE-5406', user: '@j.morales',  sede: 'Arequipa',  status: 'online',  cpu: 45, ram: 67, uptime: '98.3%', os: 'Windows 11 Pro', ip: '10.1.2.55',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1007', model: 'LATITUDE-5407', user: '@m.flores',   sede: 'Cusco',     status: 'online',  cpu: 12, ram: 38, uptime: '99.4%', os: 'Windows 11 Pro', ip: '10.2.3.14',   agent: 'v2.0.9', lastSeen: 'Ahora' },
  { id: 'LIM-1008', model: 'ELITEBOOK-840',  user: '@p.salas',   sede: 'Iquitos',   status: 'online',  cpu: 33, ram: 55, uptime: '99.0%', os: 'Windows 11 Pro', ip: '10.7.8.31',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1009', model: 'ELITEBOOK-850',  user: '@n.huaman',  sede: 'Tacna',     status: 'idle',    cpu: 5,  ram: 18, uptime: '96.8%', os: 'Windows 10 Pro', ip: '10.8.9.77',   agent: 'v2.0.7', lastSeen: 'hace 5min' },
  { id: 'LIM-1010', model: 'THINKPAD-T14',   user: '@k.zegarra', sede: 'Lima HQ',   status: 'online',  cpu: 71, ram: 82, uptime: '98.7%', os: 'Ubuntu 22.04',   ip: '10.0.1.103',  agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1011', model: 'THINKPAD-X1',    user: '@l.quispe',  sede: 'Chiclayo',  status: 'online',  cpu: 19, ram: 44, uptime: '99.2%', os: 'Windows 11 Pro', ip: '10.6.7.19',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1012', model: 'MACBOOK-PRO',    user: '@f.vargas',  sede: 'Lima HQ',   status: 'online',  cpu: 28, ram: 60, uptime: '99.6%', os: 'macOS Sonoma',   ip: '10.0.1.200',  agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1013', model: 'LATITUDE-5408',  user: '@e.torres',  sede: 'Huancayo',  status: 'offline', cpu: 0,  ram: 0,  uptime: '91.0%', os: 'Windows 10 Pro', ip: '10.9.0.44',   agent: 'v2.0.4', lastSeen: 'hace 1h' },
  { id: 'LIM-1014', model: 'ELITEBOOK-860',  user: '@g.ramos',   sede: 'Trujillo',  status: 'online',  cpu: 54, ram: 71, uptime: '98.1%', os: 'Windows 11 Pro', ip: '10.3.4.88',   agent: 'v2.1.0', lastSeen: 'Ahora' },
  { id: 'LIM-1015', model: 'LATITUDE-5409',  user: '@s.medina',  sede: 'Lima HQ',   status: 'online',  cpu: 7,  ram: 21, uptime: '99.9%', os: 'Windows 11 Pro', ip: '10.0.1.155',  agent: 'v2.1.0', lastSeen: 'Ahora' },
];

export const LIVE_STREAMS = [
  { id: 'LIM-1000', user: '@j.morales', sede: 'Lima HQ',  status: 'alert',   activity: 'lock' },
  { id: 'LIM-1001', user: '@m.flores',  sede: 'Arequipa', status: 'live',    activity: 'idle' },
  { id: 'LIM-1002', user: '@r.tapia',   sede: 'Cusco',    status: 'live',    activity: null   },
  { id: 'LIM-1003', user: '@a.lopez',   sede: 'Trujillo', status: 'live',    activity: null   },
  { id: 'LIM-1004', user: '@c.vega',    sede: 'Piura',    status: 'live',    activity: 'idle' },
  { id: 'LIM-1005', user: '@d.rios',    sede: 'Chiclayo', status: 'live',    activity: 'lo'   },
  { id: 'LIM-1007', user: '@p.salas',   sede: 'Iquitos',  status: 'live',    activity: null   },
  { id: 'LIM-1008', user: '@n.huaman',  sede: 'Tacna',    status: 'alert',   activity: 'perfil' },
  { id: 'LIM-1009', user: '@k.zegarra', sede: 'Lima HQ',  status: 'live',    activity: 'force' },
];

export const ACTIVITY_LOGS = [
  { id: 1001, type: 'connection',    device: 'LIM-1000', user: '@j.morales',  msg: 'Dispositivo conectado al sistema',             sede: 'Lima HQ',   time: 'hace 2 min',   severity: 'info'    },
  { id: 1002, type: 'alert',         device: 'LIM-1010', user: '@k.zegarra',  msg: 'CPU al 71% — uso inusual detectado',           sede: 'Lima HQ',   time: 'hace 4 min',   severity: 'warning' },
  { id: 1003, type: 'security',      device: 'ALL',      user: 'SISTEMA',     msg: 'Política de seguridad actualizada en 12 nodos', sede: 'Global',    time: 'hace 8 min',   severity: 'info'    },
  { id: 1004, type: 'disconnection', device: 'LIM-1004', user: '@c.vega',     msg: 'Dispositivo desconectado (timeout)',            sede: 'Piura',     time: 'hace 18 min',  severity: 'warning' },
  { id: 1005, type: 'alert',         device: 'LIM-1008', user: '@n.huaman',   msg: 'Intento de acceso no autorizado bloqueado',     sede: 'Tacna',     time: 'hace 22 min',  severity: 'critical'},
  { id: 1006, type: 'connection',    device: 'LIM-1012', user: '@f.vargas',   msg: 'Nueva sesión iniciada',                        sede: 'Lima HQ',   time: 'hace 31 min',  severity: 'info'    },
  { id: 1007, type: 'update',        device: 'LIM-1006', user: '@j.morales',  msg: 'Agente actualizado a v2.1.0',                  sede: 'Arequipa',  time: 'hace 45 min',  severity: 'info'    },
  { id: 1008, type: 'report',        device: 'ALL',      user: 'SISTEMA',     msg: 'Reporte diario generado y enviado por email',   sede: 'Global',    time: 'hace 1 h',     severity: 'info'    },
  { id: 1009, type: 'alert',         device: 'LIM-1014', user: '@g.ramos',    msg: 'RAM al 71% — se recomienda revisar procesos',   sede: 'Trujillo',  time: 'hace 1.5 h',   severity: 'warning' },
  { id: 1010, type: 'disconnection', device: 'LIM-1013', user: '@e.torres',   msg: 'Dispositivo offline — posible fallo de red',    sede: 'Huancayo',  time: 'hace 2 h',     severity: 'critical'},
  { id: 1011, type: 'connection',    device: 'LIM-1011', user: '@l.quispe',   msg: 'Dispositivo reconectado tras corte',            sede: 'Chiclayo',  time: 'hace 2.5 h',   severity: 'info'    },
  { id: 1012, type: 'security',      device: 'LIM-1000', user: 'SISTEMA',     msg: 'Escaneo de vulnerabilidades completado: 0',     sede: 'Lima HQ',   time: 'hace 3 h',     severity: 'info'    },
];

export const INCIDENTS = [
  { id: 'INC-0091', severity: 'critical', device: 'LIM-1008', user: '@n.huaman', title: 'Acceso no autorizado bloqueado',    sede: 'Tacna',    status: 'open',       time: 'hace 22 min',  assignee: 'Andrea R.' },
  { id: 'INC-0090', severity: 'critical', device: 'LIM-1013', user: '@e.torres', title: 'Dispositivo offline sin respuesta', sede: 'Huancayo', status: 'open',       time: 'hace 2 h',     assignee: 'Miguel S.' },
  { id: 'INC-0089', severity: 'warning',  device: 'LIM-1010', user: '@k.zegarra',title: 'CPU uso elevado sostenido >70%',    sede: 'Lima HQ',  status: 'in_review',  time: 'hace 4 min',   assignee: 'Andrea R.' },
  { id: 'INC-0088', severity: 'warning',  device: 'LIM-1014', user: '@g.ramos',  title: 'RAM al 71% — procesos en revisión', sede: 'Trujillo', status: 'in_review',  time: 'hace 1.5 h',   assignee: 'Carlos V.' },
  { id: 'INC-0087', severity: 'warning',  device: 'LIM-1004', user: '@c.vega',   title: 'Timeout de conexión repetido',       sede: 'Piura',    status: 'resolved',   time: 'hace 18 min',  assignee: 'Sandra L.' },
  { id: 'INC-0086', severity: 'info',     device: 'ALL',      user: 'SISTEMA',   title: 'Actualización masiva de agentes',    sede: 'Global',   status: 'resolved',   time: 'hace 3 h',     assignee: 'Sistema'   },
];

// Puntos de la línea del chart (24h, cada punto = 1h)
export const CHART_LINE_DATA = [
  980, 1020, 1050, 1030, 1000, 970, 950, 940, 1010, 1080,
  1120, 1150, 1160, 1140, 1100, 1090, 1060, 1030, 1010, 1000,
  990, 1020, 1060, 1080,
];

// Datos del bar chart (por sede)
export const CHART_BAR_DATA = [
  { label: 'LIM', value: 320 },
  { label: 'AQP', value: 198 },
  { label: 'TRU', value: 170 },
  { label: 'PIU', value: 145 },
  { label: 'CUS', value: 130 },
  { label: 'CHI', value: 110 },
  { label: 'HYO', value: 95  },
  { label: 'IQT', value: 80  },
];

// Stats para el header del dashboard
export const DASHBOARD_STATS = [
  { key: 'sedes',      icon: 'building',  label: 'Sedes activas',       value: '12',   trend: '+2',  trendUp: true  },
  { key: 'online',     icon: 'monitor',   label: 'Dispositivos online',  value: '1,284',trend: '+38', trendUp: true  },
  { key: 'offline',    icon: 'wifi-off',  label: 'Dispositivos offline', value: '47',   trend: '-6',  trendUp: false },
  { key: 'alerts',     icon: 'alert',     label: 'Alertas activas',      value: '9',    trend: '+3',  trendUp: false },
  { key: 'users',      icon: 'users',     label: 'Usuarios activos',     value: '1,103',trend: '+12', trendUp: true  },
];
