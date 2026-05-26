import React, { useState } from 'react';
import { 
  LayoutDashboard, Laptop, Activity, FileText, Settings, LogOut, Search, Bell, User,
  Wifi, WifiOff, AlertCircle, Shield, Globe, Cpu, HardDrive, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- DATOS FAKE EXTENDIDOS ---
const MOCK_LAPTOPS = [
  { id: 'RG-48291', user: 'Carlos Mendoza', os: 'Windows 11 Pro', status: 'online', name: 'Laptop-Carlos-01', ip: '192.168.1.45', agent: 'v1.0.2', cpu: '12%', ram: '4.2GB' },
  { id: 'RG-22019', user: 'Sara Jenkins', os: 'macOS Sonoma', status: 'offline', name: 'MacBook-Sara-04', ip: '192.168.1.12', agent: 'v1.0.1', cpu: '0%', ram: '0GB' },
  { id: 'RG-99382', user: 'Alex Rivera', os: 'Ubuntu 22.04 LTS', status: 'online', name: 'Laptop-Dev-Main', ip: '172.16.0.8', agent: 'v1.0.2', cpu: '45%', ram: '12.8GB' },
  { id: 'RG-11029', user: 'Marta Silva', os: 'Windows 11 Pro', status: 'online', name: 'Laptop-Admin-HQ', ip: '10.0.0.5', agent: 'v1.0.2', cpu: '8%', ram: '3.1GB' },
  { id: 'RG-55402', user: 'Juan Perez', os: 'Windows 10', status: 'offline', name: 'Laptop-Juan-Home', ip: '192.168.1.88', agent: 'v1.0.0', cpu: '0%', ram: '0GB' },
];

const MOCK_LOGS = [
  { id: 1, type: 'connection', msg: 'Device RG-48291 connected', time: 'Justo ahora', icon: <Wifi size={14} color="#4ade80" /> },
  { id: 2, type: 'alert', msg: 'High CPU usage detected on RG-99382', time: 'hace 5 min', icon: <AlertCircle size={14} color="#f87171" /> },
  { id: 3, type: 'security', msg: 'Security Policy Update pushed to all nodes', time: 'hace 12 min', icon: <Shield size={14} color="#3b82f6" /> },
  { id: 4, type: 'disconnection', msg: 'Device RG-22019 disconnected (Timeout)', time: 'hace 22 min', icon: <WifiOff size={14} color="#94a3b8" /> },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState('Dashboard');

  const handleLogout = () => {
    if(confirm('¿Deseas cerrar la sesión de administración?')) navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-dark)', width: '100vw', overflow: 'hidden' }}>
      
      {/* SIDEBAR */}
      <div style={{ width: '260px', background: 'var(--bg-sidebar)', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', padding: '1.5rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2.5rem' }}>
          <div style={{ padding: '8px', background: 'var(--accent-primary)', borderRadius: '8px' }}>
            <Shield size={20} color="#040b14" />
          </div>
          <span style={{ fontWeight: '800', fontSize: '1.25rem', color: 'var(--text-white)' }}>RemoteGuardian</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <SidebarItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeMenu === 'Dashboard'} onClick={() => setActiveMenu('Dashboard')} />
          <SidebarItem icon={<Laptop size={20} />} label="Dispositivos" active={activeMenu === 'Dispositivos'} onClick={() => setActiveMenu('Dispositivos')} />
          <SidebarItem icon={<Activity size={20} />} label="Logs de Actividad" active={activeMenu === 'Logs'} onClick={() => setActiveMenu('Logs')} />
          <SidebarItem icon={<FileText size={20} />} label="Reportes" active={activeMenu === 'Reportes'} onClick={() => setActiveMenu('Reportes')} />
          <div style={{ margin: '1rem 0', borderTop: '1px solid var(--glass-border)' }} />
          <SidebarItem icon={<Settings size={20} />} label="Configuración" active={activeMenu === 'Configuración'} onClick={() => setActiveMenu('Configuración')} />
        </nav>

        <div style={{ marginTop: 'auto', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#040b14' }}>A</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-white)' }}>Admin</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>System Admin</p>
          </div>
          <LogOut size={18} color="var(--text-secondary)" style={{ cursor: 'pointer' }} onClick={handleLogout} />
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header Común */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-white)', marginBottom: '0.5rem' }}>{activeMenu}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>Bienvenido al centro de control empresarial.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="glass-effect" style={{ display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '8px' }}>
              <Search size={18} color="var(--text-secondary)" />
              <input type="text" placeholder="Buscar..." style={{ background: 'none', border: 'none', color: 'white', padding: '10px 0', outline: 'none' }} />
            </div>
          </div>
        </div>

        {/* CONTENIDO DINÁMICO SEGÚN EL MENÚ */}
        <AnimatePresence mode="wait">
          {activeMenu === 'Dashboard' && <ViewDashboard key="dash" />}
          {activeMenu === 'Dispositivos' && <ViewDevices key="dev" />}
          {activeMenu === 'Logs' && <ViewLogs key="logs" />}
          {activeMenu === 'Reportes' && <ViewReports key="rep" />}
          {activeMenu === 'Configuración' && <ViewSettings key="set" />}
        </AnimatePresence>

      </div>
    </div>
  );
};

// --- VISTAS ESPECÍFICAS ---

const ViewDashboard = () => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', gap: '2rem' }}>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard title="Total Laptops" value="1,284" icon={<Laptop color="var(--accent-primary)" />} />
        <StatCard title="Online Ahora" value="942" progress={75} icon={<Wifi color="#22c55e" />} />
        <StatCard title="Alertas Críticas" value="18" color="#ef4444" icon={<AlertCircle color="#ef4444" />} />
      </div>
      <div className="glass-effect" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'white' }}>Laptops Recientes</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {/* ... (Tabla que ya teníamos) ... */}
          <tbody>
            {MOCK_LAPTOPS.slice(0, 3).map(laptop => (
              <tr key={laptop.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '12px 0', color: 'white' }}>{laptop.name}</td>
                <td style={{ padding: '12px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{laptop.user}</td>
                <td style={{ padding: '12px 0', textAlign: 'right' }}>
                  <span style={{ color: laptop.status === 'online' ? '#4ade80' : '#94a3b8', fontSize: '0.75rem', fontWeight: '700' }}>● {laptop.status.toUpperCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    
    <div style={{ width: '320px' }}>
      <div className="glass-effect" style={{ padding: '1.5rem', height: '100%' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="var(--accent-primary)" /> Actividad Sistema
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {MOCK_LOGS.map(log => (
            <div key={log.id} style={{ display: 'flex', gap: '12px' }}>
              <div style={{ marginTop: '4px' }}>{log.icon}</div>
              <div>
                <p style={{ fontSize: '0.85rem', color: 'white', fontWeight: '500' }}>{log.msg}</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{log.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </motion.div>
);

const ViewDevices = () => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-effect" style={{ padding: '1.5rem' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
          <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>ID / Nombre</th>
          <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>IP Address</th>
          <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>CPU / RAM</th>
          <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Agente</th>
          <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Estado</th>
        </tr>
      </thead>
      <tbody>
        {MOCK_LAPTOPS.map(laptop => (
          <tr key={laptop.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
            <td style={{ padding: '16px 12px' }}>
              <p style={{ color: 'white', fontWeight: '600' }}>{laptop.name}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{laptop.id}</p>
            </td>
            <td style={{ padding: '16px 12px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{laptop.ip}</td>
            <td style={{ padding: '16px 12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>CPU: {laptop.cpu}</span>
                <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>RAM: {laptop.ram}</span>
              </div>
            </td>
            <td style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{laptop.agent}</td>
            <td style={{ padding: '16px 12px' }}>
              <span style={{ color: laptop.status === 'online' ? '#4ade80' : '#ef4444', fontWeight: '700', fontSize: '0.75rem' }}>{laptop.status.toUpperCase()}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </motion.div>
);

const ViewLogs = () => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    {MOCK_LOGS.concat(MOCK_LOGS).map((log, idx) => (
      <div key={idx} className="glass-effect" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }}>{log.icon}</div>
          <div>
            <p style={{ color: 'white', fontWeight: '500' }}>{log.msg}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Event ID: #{1000 + idx} • Server Node: RG-HQ-01</p>
          </div>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{log.time}</span>
      </div>
    ))}
  </motion.div>
);

const ViewReports = () => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
    <div className="glass-effect" style={{ padding: '2rem', textAlign: 'center' }}>
      <h3 style={{ marginBottom: '2rem', color: 'white' }}>Uso de Aplicaciones (Semanal)</h3>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', height: '150px', alignItems: 'flex-end' }}>
        <div style={{ width: '30px', height: '80%', background: 'var(--accent-primary)', borderRadius: '4px' }} />
        <div style={{ width: '30px', height: '40%', background: 'var(--accent-primary)', opacity: 0.6, borderRadius: '4px' }} />
        <div style={{ width: '30px', height: '90%', background: 'var(--accent-primary)', borderRadius: '4px' }} />
        <div style={{ width: '30px', height: '60%', background: 'var(--accent-primary)', opacity: 0.8, borderRadius: '4px' }} />
      </div>
      <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Top: Google Chrome (45h)</p>
    </div>
    <div className="glass-effect" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <h3 style={{ marginBottom: '1.5rem', color: 'white' }}>Métricas de Seguridad</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <MetricLine label="Integridad de Datos" value="99.9%" color="#22c55e" />
        <MetricLine label="Alertas Resueltas" value="85%" color="var(--accent-primary)" />
        <MetricLine label="Riesgo de Fuga" value="Bajo" color="#22c55e" />
      </div>
    </div>
  </motion.div>
);

const ViewSettings = () => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-effect" style={{ padding: '2rem', maxWidth: '600px' }}>
    <h3 style={{ marginBottom: '2rem', color: 'white' }}>Configuración de la Cuenta</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <InputGroup label="Nombre del Administrador" value="System Admin" />
      <InputGroup label="Correo Electrónico" value="admin@remoteguardian.com" />
      <InputGroup label="Empresa" value="RemoteGuardian Enterprise Ltd." />
      <div style={{ marginTop: '1rem' }}>
        <button style={{ padding: '10px 20px', background: 'var(--accent-primary)', border: 'none', borderRadius: '8px', color: '#040b14', fontWeight: '700', cursor: 'pointer' }}>
          Guardar Cambios
        </button>
      </div>
    </div>
  </motion.div>
);

// --- COMPONENTES AUXILIARES ---

const SidebarItem = ({ icon, label, active, onClick }) => (
  <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', cursor: 'pointer', background: active ? 'rgba(79, 209, 237, 0.1)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
    {icon} <span style={{ fontSize: '0.9rem', fontWeight: active ? '600' : '400' }}>{label}</span>
  </div>
);

const StatCard = ({ title, value, icon, color, progress }) => (
  <div className="glass-effect" style={{ padding: '1.25rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>{icon}</div>
    </div>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{title}</p>
    <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: color || 'white' }}>{value}</h3>
    {progress && (
      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', marginTop: '1rem' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: '10px' }} />
      </div>
    )}
  </div>
);

const MetricLine = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ color: color, fontWeight: '700' }}>{value}</span>
  </div>
);

const InputGroup = ({ label, value }) => (
  <div>
    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</label>
    <input type="text" defaultValue={value} style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white' }} />
  </div>
);

export default Dashboard;
