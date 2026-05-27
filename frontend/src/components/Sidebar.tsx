// Sidebar — Premium Glassmorphism
import { LayoutDashboard, Building2, Monitor, Radio, Activity, AlertTriangle, FileText, Settings, LogOut, Zap } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout?: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sedes', label: 'Sedes', icon: Building2 },
  { id: 'dispositivos', label: 'Dispositivos', icon: Monitor },
  { id: 'monitoreo', label: 'Monitoreo en vivo', icon: Radio, badge: true },
  { id: 'actividad', label: 'Actividad', icon: Activity },
  { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle },
  { id: 'reportes', label: 'Reportes', icon: FileText },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
];

export function Sidebar({ currentView, setCurrentView, onLogout }: SidebarProps) {
  return (
    <aside className="w-64 h-screen flex flex-col fixed left-0 top-0 z-20 bg-bg-surface/80 backdrop-blur-xl border-r border-glass-border">
      {/* ─── Logo Area ─── */}
      <div className="h-[72px] flex items-center justify-center px-5 border-b border-glass-border shrink-0 relative">
        <div className="flex items-center justify-center w-full max-w-[180px]">
          <img src="/logo.png" alt="Fiberlink Logo" className="smart-logo w-full h-auto max-h-12 object-contain" />
        </div>
        {/* Subtle gradient line */}
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent" />
      </div>
      
      {/* ─── Navigation ─── */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-0.5">
        {navItems.map((item, index) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-300 relative overflow-hidden animate-float-up stagger-${Math.min(index + 1, 6)} ${
                isActive 
                  ? 'text-white' 
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-highlight/50'
              }`}
            >
              {/* Active state background — animated gradient */}
              {isActive && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary opacity-90 animate-gradient" />
              )}
              
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
              )}

              <Icon className={`w-[18px] h-[18px] relative z-10 transition-all duration-300 ${
                isActive 
                  ? 'text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]' 
                  : 'group-hover:text-brand-primary group-hover:scale-110'
              }`} />
              <span className="relative z-10 tracking-tight">{item.label}</span>
              
              {/* Live badge for Monitoreo */}
              {item.badge && (
                <div className="relative z-10 ml-auto flex items-center gap-1">
                  <div className="relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-status-online" />
                    <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-status-online animate-pulse-ring" />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* ─── Bottom Section ─── */}
      <div className="p-3 border-t border-glass-border shrink-0 space-y-2">
        {/* System Status Chip */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-status-online/5 border border-status-online/10">
          <Zap className="w-3.5 h-3.5 text-status-online" />
          <span className="text-[11px] font-medium text-status-online tracking-wide">Sistema Operativo</span>
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-status-online animate-breathe" />
        </div>
        
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-text-tertiary hover:text-red-400 hover:bg-red-500/5 transition-all duration-300 border border-transparent hover:border-red-500/10 group"
        >
          <LogOut className="w-[18px] h-[18px] group-hover:scale-110 transition-transform" />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
