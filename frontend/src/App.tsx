import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
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

export interface Report {
  id: string;
  date: string;
  device: string;
  type: string;
  description: string;
  status: string;
}

const initialReports: Report[] = [
  { id: 'REP-001', date: new Date().toLocaleString(), device: 'LIM-1008', type: 'Alerta', description: 'Uso de CPU superó el 95% por 10 minutos', status: 'Revisado' },
  { id: 'REP-002', date: new Date().toLocaleString(), device: 'TRU-2041', type: 'Actividad', description: 'Conexión a red no autorizada (Cafetería)', status: 'Pendiente' },
];

const SERVER_URL = `http://${window.location.hostname}:3001`;

function App() {
  const [currentView, setCurrentView] = useState('monitoreo'); // Default to Monitoreo as requested
  const [socket, setSocket] = useState<Socket | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [globalReports, setGlobalReports] = useState<Report[]>(initialReports);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState('');

  const handleLogin = (name: string) => {
    setUserName(name);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserName('');
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
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('devices-update', (updatedDevices: Device[]) => {
      setDevices(updatedDevices);
    });

    newSocket.on('screenshot-update', (data: { deviceId: string, image: string, timestamp: number }) => {
      setScreenshots(prev => ({
        ...prev,
        [data.deviceId]: data.image
      }));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} onLogout={handleLogout} />
      
      <div className="flex-1 flex flex-col pl-64 w-full">
        <TopBar userName={userName} />
        
        <main className="flex-1 overflow-y-auto">
          {currentView === 'dashboard' && <DashboardView devices={devices} />}
          {currentView === 'sedes' && <SedesView />}
          {currentView === 'dispositivos' && <DispositivosView devices={devices} />}
          {currentView === 'monitoreo' && <MonitoreoView devices={devices} screenshots={screenshots} addReport={addReport} globalReports={globalReports} />}
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
