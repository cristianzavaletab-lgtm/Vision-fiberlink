import { useState, useEffect } from 'react';
import { Search, Bell, Sun, Moon, Command, ChevronDown, Sparkles, Menu } from 'lucide-react';

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
    <header className="h-16 bg-bg-base/60 backdrop-blur-2xl border-b border-glass-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10">
      {/* ─── Search Bar & Menu ─── */}
      <div className="flex-1 flex items-center gap-3 max-w-2xl">
        <button 
          onClick={onMenuClick}
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl hover:bg-bg-surface/60 text-text-secondary transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="relative w-full max-w-md group hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary group-focus-within:text-brand-primary transition-colors duration-300" />
          <input 
            type="text" 
            placeholder="Buscar dispositivos, usuarios, eventos..." 
            className="w-full bg-bg-surface/50 border border-bg-elevated/50 rounded-xl pl-10 pr-14 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-brand-primary/40 focus:bg-bg-surface focus:shadow-[0_0_0_3px_rgba(255,107,53,0.08)] transition-all duration-300"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-bg-elevated/60 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] text-text-tertiary font-mono font-medium border border-glass-border">
            <Command className="w-3 h-3" />K
          </div>
        </div>
      </div>

      {/* ─── Right Actions ─── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Sede Selector */}
        <button className="flex items-center gap-2 bg-bg-surface/40 backdrop-blur-sm border border-glass-border rounded-xl px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-surface hover:border-brand-primary/20 transition-all duration-300 group">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-brand-primary" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-brand-primary animate-pulse-ring" />
          </div>
          <span className="hidden sm:inline">Sede: Lima HQ</span>
          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary group-hover:text-brand-primary transition-colors" />
        </button>

        <div className="h-5 w-px bg-bg-elevated/50 mx-1 hidden sm:block" />

        {/* Notification Bell */}
        <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-bg-surface/60 text-text-secondary hover:text-text-primary transition-all duration-300 relative group">
          <Bell className="w-[18px] h-[18px] group-hover:rotate-12 transition-transform duration-300" />
          <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-brand-primary rounded-full border-2 border-bg-base shadow-[0_0_6px_rgba(255,107,53,0.5)]" />
        </button>

        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-bg-surface/60 text-text-secondary hover:text-text-primary transition-all duration-300 group"
        >
          {isDark ? (
            <Sun className="w-[18px] h-[18px] group-hover:rotate-180 group-hover:text-amber-400 transition-all duration-500" />
          ) : (
            <Moon className="w-[18px] h-[18px] group-hover:-rotate-12 group-hover:text-indigo-400 transition-all duration-300" />
          )}
        </button>

        <div className="h-5 w-px bg-bg-elevated/50 mx-1 hidden sm:block" />

        {/* User Avatar */}
        <button className="flex items-center gap-3 hover:bg-bg-surface/40 p-1.5 pr-3 rounded-xl transition-all duration-300 border border-transparent hover:border-glass-border group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary p-[1.5px] shadow-sm group-hover:shadow-[0_0_12px_rgba(255,107,53,0.3)] transition-shadow duration-300">
            <div className="w-full h-full rounded-[9px] bg-bg-surface flex items-center justify-center text-sm font-bold text-brand-primary">
              {getInitials(userName)}
            </div>
          </div>
          <div className="flex-col text-left hidden sm:flex">
            <span className="text-sm font-semibold text-text-primary leading-tight flex items-center gap-1.5">
              {userName}
              <Sparkles className="w-3 h-3 text-brand-primary" />
            </span>
            <span className="text-[10px] text-text-tertiary font-medium">Administrador</span>
          </div>
        </button>
      </div>
    </header>
  );
}
