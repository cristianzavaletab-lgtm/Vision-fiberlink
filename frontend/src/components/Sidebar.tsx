import { LayoutDashboard, Building2, Activity, FileText, Settings, LogOut, Zap, MonitorSmartphone, Users, TrendingUp, Bell, Shield } from 'lucide-react';
import { StatusDot } from './ui/StatusDot';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout?: () => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  socketConnected?: boolean;
  notificationCount?: number;
}

const navSections = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'monitoreo', icon: Activity, label: 'War Room', badge: 'live' as const },
      { id: 'productividad', icon: TrendingUp, label: 'Productividad' },
    ]
  },
  {
    title: 'Infraestructura',
    items: [
      { id: 'dispositivos', icon: MonitorSmartphone, label: 'Dispositivos' },
      { id: 'sedes', icon: Building2, label: 'Sedes' },
    ]
  },
  {
    title: 'Gestion',
    items: [
      { id: 'reportes', icon: FileText, label: 'Reportes' },
      { id: 'notificaciones', icon: Bell, label: 'Notificaciones', badge: 'count' as const },
      { id: 'usuarios', icon: Users, label: 'Usuarios' },
    ]
  },
  {
    title: 'Sistema',
    items: [
      { id: 'configuracion', icon: Settings, label: 'Configuracion' },
    ]
  }
];

export function Sidebar({ currentView, setCurrentView, onLogout, mobileOpen, setMobileOpen, socketConnected, notificationCount = 0 }: SidebarProps) {
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
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 shrink-0 relative border-b border-surface-border/50">
          <div className="flex items-center w-full">
            <span className="text-lg font-bold tracking-tight text-text-primary flex items-center gap-2.5">
              <img src="/logo.png" alt="VisionControl" className="w-8 h-8 object-contain drop-shadow-[0_0_12px_rgba(255,107,53,0.3)] hover:scale-105 transition-transform" />
              VisionControl
            </span>
            <span className="ml-auto text-[9px] font-mono text-text-tertiary bg-surface-elevated px-1.5 py-0.5 rounded border border-surface-border">v2.1</span>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-1 custom-scrollbar">
          {navSections.map((section) => (
            <div key={section.title} className="mb-2">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-[0.15em] px-3 mb-1.5">{section.title}</p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = currentView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setCurrentView(item.id); setMobileOpen?.(false); }}
                      className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 relative ${
                        isActive 
                          ? 'text-text-primary bg-surface-elevated shadow-sm' 
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50 active:scale-[0.98]'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand rounded-r-full shadow-[0_0_10px_rgba(255,107,53,0.5)]" />
                      )}
                      <Icon className={`w-[18px] h-[18px] transition-all duration-200 ${
                        isActive ? 'text-brand' : 'text-text-tertiary group-hover:text-text-secondary'
                      }`} />
                      <span className="tracking-tight">{item.label}</span>
                      {item.badge === 'live' && (
                        <div className="ml-auto flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-status-success uppercase tracking-wider">Live</span>
                          <StatusDot status="online" />
                        </div>
                      )}
                      {item.badge === 'count' && notificationCount > 0 && (
                        <div className="ml-auto flex items-center">
                          <span className="text-[9px] font-bold text-white bg-status-error px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {notificationCount > 99 ? '99+' : notificationCount}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="p-3 shrink-0 space-y-2 border-t border-surface-border/50">
          {/* Connection Status Chip */}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${socketConnected ? 'bg-status-success/5 border-status-success/20' : 'bg-status-error/5 border-status-error/20'}`}>
            <Zap className={`w-3.5 h-3.5 ${socketConnected ? 'text-status-success' : 'text-status-error'}`} />
            <span className={`text-[11px] font-semibold ${socketConnected ? 'text-status-success' : 'text-status-error'}`}>
              {socketConnected ? 'Servidor Activo' : 'Sin Conexión'}
            </span>
            <div className="ml-auto">
              <StatusDot status={socketConnected ? 'online' : 'offline'} animate={socketConnected} />
            </div>
          </div>

          {/* Security Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated/30">
            <Shield className="w-3.5 h-3.5 text-status-success" />
            <span className="text-[10px] font-medium text-status-success/70">Conexión Cifrada · JWT</span>
          </div>
          
          {/* Logout Button - Premium destructive style */}
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold text-text-secondary border border-transparent hover:text-white hover:bg-gradient-to-r hover:from-red-600/80 hover:to-red-500/60 hover:border-red-500/30 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] transition-all duration-200 group active:scale-[0.97]"
          >
            <LogOut className="w-4 h-4 group-hover:rotate-12 transition-transform duration-200" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  );
}
