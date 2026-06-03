import { LayoutDashboard, MonitorSmartphone, Activity, FileText, Settings } from 'lucide-react';

interface MobileNavBarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { id: 'dispositivos', icon: MonitorSmartphone, label: 'Equipos' },
  { id: 'monitoreo', icon: Activity, label: 'War Room' },
  { id: 'reportes', icon: FileText, label: 'Reportes' },
  { id: 'configuracion', icon: Settings, label: 'Ajustes' },
];

export function MobileNavBar({ currentView, setCurrentView }: MobileNavBarProps) {
  return (
    <nav className="mobile-nav-bar fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-surface-base/90 backdrop-blur-2xl border-t border-surface-border" />
      
      {/* Navigation items */}
      <div className="relative flex items-center justify-around px-2 h-16 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id);
                // Haptic feedback on supported devices
                if (navigator.vibrate) navigator.vibrate(10);
              }}
              className={`relative flex flex-col items-center justify-center gap-0.5 w-full py-2 rounded-xl transition-all duration-200 active:scale-90 ${
                isActive
                  ? 'text-brand'
                  : 'text-text-tertiary active:text-text-secondary'
              }`}
            >
              {/* Active indicator dot */}
              {isActive && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
              )}
              
              <Icon className={`w-5 h-5 transition-all duration-200 ${
                isActive ? 'scale-110' : ''
              }`} />
              <span className={`text-[10px] font-medium leading-tight transition-all duration-200 ${
                isActive ? 'text-brand font-semibold' : ''
              }`}>
                {item.label}
              </span>

              {/* Live badge for War Room */}
              {item.id === 'monitoreo' && (
                <div className="absolute top-1.5 right-1/2 translate-x-3 w-1.5 h-1.5 rounded-full bg-status-success shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
