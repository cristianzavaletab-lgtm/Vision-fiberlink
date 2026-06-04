import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MobileNavBar } from './components/MobileNavBar';
import { DashboardView } from './components/DashboardView';
import { DispositivosView } from './components/DispositivosView';
import { MonitoreoView } from './components/MonitoreoView';
import { SedesView } from './components/SedesView';
import { SettingsView } from './components/SettingsView';
import { ReportesView } from './components/ReportesView';
import { LoginView } from './components/LoginView';
import { useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './components/ui/Toast';
import { PageTransition } from './components/ui/PageTransition';
import { PWAInstallBanner } from './components/ui/PWAInstallBanner';
import { usePWA } from './hooks/usePWA';
import { api } from './services/api';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
}


export interface Report {
  id: string;
  date: string;
  device: string;
  type: string;
  description: string;
  status: string;
}
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

function AppContent() {
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();
  const { addToast } = useToast();
  const { sendLoginNotification, requestNotificationPermission } = usePWA();
  const [currentView, setCurrentView] = useState('monitoreo');
  const [, setSocket] = useState<Socket | null>(null);
  const socketInstanceRef = useRef<Socket | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, any>>({});
  const [globalReports, setGlobalReports] = useState<Report[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const prevDeviceCountRef = useRef(0);
  
  // Global sede filter
  const [sedes, setSedes] = useState<Array<{ id: string; name: string; devices: string[]; color?: string }>>([]);
  const [selectedSedeId, setSelectedSedeId] = useState<string>('');

  // Fetch sedes for global filter
  useEffect(() => {
    const fetchSedes = async () => {
      try {
        const { data } = await api.get('/sedes');
        setSedes(data);
      } catch {}
    };
    fetchSedes();
    const interval = setInterval(fetchSedes, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Filter devices by selected sede
  const filteredDevices = selectedSedeId 
    ? devices.filter(d => {
        const sede = sedes.find(s => s.id === selectedSedeId);
        return sede?.devices.includes(d.id);
      })
    : devices;

  const handleLogin = (accessToken: string, refreshToken: string, userData: any) => {
    login(accessToken, refreshToken, userData);
    addToast({ type: 'success', title: 'Sesion iniciada', message: `Bienvenido, ${userData?.name || 'Usuario'}` });
    // Request notification permission then fire login notification
    requestNotificationPermission().then(() => {
      sendLoginNotification(userData?.name || 'Usuario');
    });
  };

  const handleLogout = () => {
    logout();
  };

  const addReport = (device: string, type: string, description: string, status: string = 'Pendiente') => {
    const newReport: Report = {
      id: `REP-${Math.floor(Math.random() * 10000)}`,
      date: new Date().toLocaleString(),
      device,
      type,
      description,
      status
    };
    setGlobalReports(prev => [newReport, ...prev]);
  };

  useEffect(() => {
    const newSocket = io(`${SERVER_URL}/dashboard`, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
    setSocket(newSocket);
    socketInstanceRef.current = newSocket;

    newSocket.on('connect', () => {
      setSocketConnected(true);
      addToast({ type: 'success', title: 'Conectado al servidor', message: 'Recibiendo datos en tiempo real' });
    });

    newSocket.on('disconnect', () => {
      setSocketConnected(false);
      addToast({ type: 'error', title: 'Conexion perdida', message: 'Intentando reconectar...' });
    });

    newSocket.on('devices-update', (updatedDevices: Device[]) => {
      // Notify new devices coming online
      const onlineCount = updatedDevices.filter(d => d.status === 'online').length;
      if (prevDeviceCountRef.current > 0 && onlineCount > prevDeviceCountRef.current) {
        addToast({ type: 'info', title: 'Dispositivo conectado', message: `${onlineCount} dispositivos en linea` });
      } else if (prevDeviceCountRef.current > 0 && onlineCount < prevDeviceCountRef.current) {
        addToast({ type: 'warning', title: 'Dispositivo desconectado', message: `${onlineCount} dispositivos en linea` });
      }
      prevDeviceCountRef.current = onlineCount;
      setDevices(updatedDevices);
    });

    newSocket.on('screenshot-update', (data: { deviceId: string, image: string, timestamp: number, metadata?: any }) => {
      setScreenshots(prev => ({
        ...prev,
        [data.deviceId]: data
      }));
    });

    newSocket.on('activity-log', (data: { deviceId: string, type: string, description: string, status: string }) => {
      setGlobalReports(prev => {
        const updated = [{
          id: `LOG-${Math.floor(Math.random() * 10000)}`,
          date: new Date().toLocaleString(),
          device: data.deviceId,
          type: data.type,
          description: data.description,
          status: data.status
        }, ...prev];
        return updated;
      });

      if (data.type === 'incident') {
        addToast({ type: 'error', title: 'Incidencia detectada', message: data.description, duration: 6000 });
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-bg-base flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-surface-elevated border border-surface-border flex items-center justify-center shadow-[0_0_40px_rgba(255,107,53,0.12)]">
            <span className="text-2xl font-black text-brand animate-pulse">V</span>
          </div>
          <div className="absolute inset-0 rounded-2xl border border-brand/20 animate-ping opacity-30" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0ms]" />
            <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:150ms]" />
            <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:300ms]" />
          </div>
          <p className="text-text-tertiary text-xs font-medium tracking-widest uppercase">Cargando</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginView onLogin={handleLogin} />
        <PWAInstallBanner />
      </>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView devices={filteredDevices} onNavigate={setCurrentView} socket={socketInstanceRef.current} />;
      case 'sedes': return <SedesView />;
      case 'dispositivos': return <DispositivosView devices={filteredDevices} onNavigate={setCurrentView} />;
      case 'monitoreo': return <MonitoreoView devices={filteredDevices} screenshots={screenshots} globalReports={globalReports} addReport={addReport} socket={socketInstanceRef.current} />;
      case 'reportes': return <ReportesView />;
      case 'configuracion': return <SettingsView />;
      default: return (
        <div className="p-8 flex flex-col items-center justify-center h-full gap-3">
          <div className="w-12 h-12 rounded-xl bg-surface-elevated border border-surface-border flex items-center justify-center">
            <span className="text-text-tertiary text-lg">?</span>
          </div>
          <p className="text-text-tertiary text-sm font-medium">Modulo en construccion</p>
        </div>
      );
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
        socketConnected={socketConnected}
      />
      
      <div className="flex-1 flex flex-col md:pl-64 w-full">
        <TopBar userName={user?.name || ''} onMenuClick={() => setMobileSidebarOpen(true)} sedes={sedes} selectedSedeId={selectedSedeId} onSedeChange={setSelectedSedeId} />
        
        <main className="flex-1 overflow-y-auto relative pb-20 md:pb-0">
          {/* Ambient Background Glow */}
          <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-primary/5 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-brand-secondary/5 blur-[100px] pointer-events-none" />

          <PageTransition viewKey={currentView}>
            {renderView()}
          </PageTransition>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNavBar currentView={currentView} setCurrentView={setCurrentView} />

      {/* PWA install / notification banner */}
      <PWAInstallBanner />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
