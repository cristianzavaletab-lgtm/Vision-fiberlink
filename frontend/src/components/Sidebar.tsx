import React from 'react';
import { LayoutDashboard, Building2, Monitor, Radio, Activity, AlertTriangle, FileText, Settings, LogOut } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout?: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sedes', label: 'Sedes', icon: Building2 },
  { id: 'dispositivos', label: 'Dispositivos', icon: Monitor },
  { id: 'monitoreo', label: 'Monitoreo en vivo', icon: Radio },
  { id: 'actividad', label: 'Actividad', icon: Activity },
  { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle },
  { id: 'reportes', label: 'Reportes', icon: FileText },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

export function Sidebar({ currentView, setCurrentView, onLogout }: SidebarProps) {
  return (
    <aside className="w-64 bg-bg-surface border-r border-bg-elevated h-screen flex flex-col fixed left-0 top-0">
      <div className="h-[72px] flex items-center justify-center px-4 border-b border-bg-elevated shrink-0">
        <div className="flex items-center justify-center w-full max-w-[180px]">
          <img src="/logo.png" alt="Fiberlink Logo" className="smart-logo w-full h-auto max-h-12 object-contain" />
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive 
                  ? 'bg-brand-primary/10 text-text-primary border border-brand-primary/20 relative' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-highlight border border-transparent'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-brand-primary rounded-r-full" />
              )}
              <Icon className={`w-5 h-5 ${isActive ? 'text-brand-primary' : ''}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-bg-elevated shrink-0">
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-500 transition-colors border border-transparent hover:border-red-500/20"
        >
          <LogOut className="w-5 h-5" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
