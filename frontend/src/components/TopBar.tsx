import { useState, useEffect } from 'react';
import { Search, Bell, Sun, Moon, Command, ChevronDown, Menu } from 'lucide-react';
import { StatusDot } from './ui/StatusDot';

interface TopBarProps {
  userName?: string;
  onMenuClick?: () => void;
}

export function TopBar({ userName = 'Usuario', onMenuClick }: TopBarProps) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  return (
    <header className="h-16 bg-surface-base/80 backdrop-blur-xl border-b border-surface-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10 transition-colors">
      {/* ─── Search Bar & Menu ─── */}
      <div className="flex-1 flex items-center gap-3 max-w-2xl">
        <button 
          onClick={onMenuClick}
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-surface-elevated text-text-secondary transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="relative w-full max-w-md group hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary group-focus-within:text-brand transition-colors duration-300" />
          <input 
            type="text" 
            placeholder="Buscar dispositivos, usuarios, eventos..." 
            className="w-full bg-surface-elevated/50 border border-surface-border rounded-lg pl-10 pr-14 py-2 text-[13px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-brand/40 focus:bg-surface-elevated focus:ring-1 focus:ring-brand/40 transition-all duration-300"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-surface-base px-1.5 py-0.5 rounded text-[10px] text-text-tertiary font-mono font-medium border border-surface-border">
            <Command className="w-3 h-3" />K
          </div>
        </div>
      </div>

      {/* ─── Right Actions ─── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Sede Selector */}
        <button className="flex items-center gap-2 bg-surface-elevated/30 border border-surface-border rounded-lg px-3 py-1.5 text-[13px] font-medium text-text-primary hover:bg-surface-elevated hover:border-surface-border transition-all duration-200 group">
          <StatusDot status="online" />
          <span className="hidden sm:inline">Sede: Lima HQ</span>
          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary group-hover:text-text-primary transition-colors" />
        </button>

        <div className="h-4 w-px bg-surface-border mx-1 hidden sm:block" />

        {/* Notification Bell */}
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-all duration-200 relative group">
          <Bell className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full border border-surface-base" />
        </button>

        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-all duration-200 group"
        >
          {isDark ? (
            <Sun className="w-4 h-4 group-hover:text-amber-400 transition-colors duration-300" />
          ) : (
            <Moon className="w-4 h-4 group-hover:text-indigo-400 transition-colors duration-300" />
          )}
        </button>

        <div className="h-4 w-px bg-surface-border mx-1 hidden sm:block" />

        {/* User Avatar */}
        <button className="flex items-center gap-2 hover:bg-surface-elevated/50 p-1 pr-2 rounded-lg transition-all duration-200 group">
          <div className="w-8 h-8 rounded-md bg-surface-elevated border border-surface-border flex items-center justify-center text-[13px] font-bold text-text-primary group-hover:border-brand/40 transition-colors">
            {getInitials(userName)}
          </div>
          <div className="flex-col text-left hidden sm:flex">
            <span className="text-[13px] font-medium text-text-primary leading-tight flex items-center gap-1">
              {userName}
            </span>
            <span className="text-[10px] text-text-tertiary font-medium">Administrador</span>
          </div>
        </button>
      </div>
    </header>
  );
}
