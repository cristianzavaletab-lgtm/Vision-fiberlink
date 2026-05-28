import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { DispositivosView } from './components/DispositivosView';
import { MonitoreoView } from './components/MonitoreoView';
import { SedesView } from './components/SedesView';
import { ReportesView } from './components/ReportesView';
import { LoginView } from './components/LoginView';

interface Device {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  lastSeen: number;
}

import { useAuth } from './context/AuthContext';

export interface Report {
  id: string;
  date: string;
  device: string;
  type: string;
  description: string;
  status: string;
}

const SERVER_URL = "https://visioncontrol-server.onrender.com";

function App() {
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState('monitoreo'); // Default to Monitoreo as requested
  const [, setSocket] = useState<ReturnType<typeof io> | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, any>>({});
  const [globalReports, setGlobalReports] = useState<Report[]>([]);

  const handleLogin = (accessToken: string, refreshToken: string, userData: any) => {
    login(accessToken, refreshToken, userData);
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
    // Conectar al namespace de administradores (Dashboard)
    const newSocket = io(`${SERVER_URL}/dashboard`);
    setSocket(newSocket);

    // Recibir actualizaciones globales emitidas a los dashboards
    newSocket.on('devices-update', (updatedDevices: Device[]) => {
      setDevices(updatedDevices);
    });

    newSocket.on('screenshot-update', (data: { deviceId: string, image: string, timestamp: number, metadata?: any }) => {
      setScreenshots(prev => ({
        ...prev,
        [data.deviceId]: data
      }));
    });

    newSocket.on('activity-log', (data: { deviceId: string, type: string, description: string, status: string }) => {
      setGlobalReports(prev => [{
        id: `LOG-${Math.floor(Math.random() * 10000)}`,
        date: new Date().toLocaleString(),
        device: data.deviceId,
        type: data.type,
        description: data.description,
        status: data.status
      }, ...prev]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (isLoading) {
    return <div className="min-h-screen w-full bg-[#060810] flex items-center justify-center text-white font-bold tracking-widest text-sm animate-pulse">CARGANDO...</div>;
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        setMobileOpen={setMobileSidebarOpen}
      />
      
      <div className="flex-1 flex flex-col md:pl-64 w-full">
        <TopBar userName={user?.name || ''} onMenuClick={() => setMobileSidebarOpen(true)} />
        
        <main className="flex-1 overflow-y-auto relative">
          {/* Ambient Background Glow for all views */}
          <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-primary/5 blur-[120px] pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-brand-secondary/5 blur-[100px] pointer-events-none" />

          {currentView === 'dashboard' && <DashboardView devices={devices} onNavigate={setCurrentView} />}
          {currentView === 'sedes' && <SedesView />}
          {currentView === 'dispositivos' && <DispositivosView devices={devices} onNavigate={setCurrentView} />}
          {currentView === 'monitoreo' && <MonitoreoView devices={devices} screenshots={screenshots} globalReports={globalReports} addReport={addReport} />}
          {currentView === 'reportes' && <ReportesView reports={globalReports} />}
          {/* Fallback for other non-implemented views */}
          {!['dashboard', 'sedes', 'dispositivos', 'monitoreo', 'reportes'].includes(currentView) && (
             <div className="p-8 flex items-center justify-center h-full text-text-tertiary">
               Módulo en construcción
             </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
