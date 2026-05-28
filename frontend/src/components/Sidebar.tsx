// Sidebar — Premium Minimalist (Linear/Vercel Style)
import { LayoutDashboard, Building2, Monitor, Radio, Activity, AlertTriangle, FileText, Settings, LogOut, Zap } from 'lucide-react';
import { StatusDot } from './ui/StatusDot';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout?: () => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
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

export function Sidebar({ currentView, setCurrentView, onLogout, mobileOpen, setMobileOpen }: SidebarProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-30 md:hidden animate-fade-in"
          onClick={() => setMobileOpen?.(false)}
        />
      )}
      
      <aside className={`w-64 h-screen flex flex-col fixed left-0 top-0 z-40 bg-surface-base md:bg-surface-base/95 backdrop-blur-2xl border-r border-surface-border transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* ─── Logo Area ─── */}
        <div className="h-16 flex items-center px-6 shrink-0 relative">
          <div className="flex items-center w-full">
            <span className="text-lg font-bold tracking-tight text-text-primary flex items-center gap-2">
              <div className="w-5 h-5 rounded-[4px] bg-brand flex items-center justify-center shadow-[0_0_12px_rgba(255,107,53,0.3)]">
                <span className="text-white text-[10px] font-black">V</span>
              </div>
              VisionControl
            </span>
          </div>
        </div>
        
        {/* ─── Navigation ─── */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors relative ${
                  isActive 
                    ? 'text-text-primary bg-surface-elevated' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand rounded-r-full shadow-[0_0_8px_rgba(255,107,53,0.4)]" />
                )}

                <Icon className={`w-4 h-4 transition-colors ${
                  isActive ? 'text-text-primary' : 'text-text-tertiary group-hover:text-text-secondary'
                }`} />
                <span className="tracking-tight">{item.label}</span>
                
                {/* Live badge for Monitoreo */}
                {item.badge && (
                  <div className="ml-auto flex items-center">
                    <StatusDot status="online" />
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* ─── Bottom Section ─── */}
        <div className="p-3 shrink-0 space-y-1">
          {/* System Status Chip */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated/50 border border-surface-border">
            <Zap className="w-3.5 h-3.5 text-status-success" />
            <span className="text-[11px] font-medium text-text-secondary">Sistemas OK</span>
            <div className="ml-auto">
              <StatusDot status="online" animate={false} />
            </div>
          </div>
          
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-elevated/50 transition-colors group"
          >
            <LogOut className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}
