import React, { useState, useEffect } from 'react';
import { Search, Bell, Sun, Moon, Command, ChevronDown } from 'lucide-react';

interface TopBarProps {
  userName?: string;
}

export function TopBar({ userName = 'Usuario' }: TopBarProps) {
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
    <header className="h-16 bg-bg-base border-b border-bg-elevated flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex-1 flex items-center max-w-2xl">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input 
            type="text" 
            placeholder="Buscar dispositivos, usuarios, eventos..." 
            className="w-full bg-bg-surface border border-bg-elevated rounded-lg pl-10 pr-12 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-brand-primary/50 transition-colors"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-bg-elevated px-1.5 py-0.5 rounded text-[10px] text-text-secondary font-medium">
            <Command className="w-3 h-3" />K
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <button className="flex items-center gap-2 bg-bg-surface border border-bg-elevated rounded-full px-4 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-highlight transition-colors">
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
          Sede: Lima HQ
          <ChevronDown className="w-4 h-4 text-text-secondary ml-1" />
        </button>

        <div className="h-6 w-px bg-bg-elevated mx-1" />

        <button className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-bg-surface text-text-secondary hover:text-text-primary transition-colors relative">
          <Bell className="w-5 h-5" />
          <div className="absolute top-2 right-2 w-2 h-2 bg-brand-primary rounded-full border-2 border-bg-base" />
        </button>
        <button 
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-bg-surface text-text-secondary hover:text-text-primary transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="h-6 w-px bg-bg-elevated mx-1" />

        <button className="flex items-center gap-3 hover:bg-bg-surface p-1.5 pr-3 rounded-full transition-colors border border-transparent hover:border-bg-elevated">
          <div className="w-8 h-8 rounded-full bg-bg-highlight border border-bg-elevated flex items-center justify-center text-sm font-bold text-text-secondary">
            {getInitials(userName)}
          </div>
          <div className="flex flex-col text-left hidden sm:flex">
            <span className="text-sm font-semibold text-text-primary leading-tight">{userName}</span>
            <span className="text-[10px] text-text-secondary">Administrador</span>
          </div>
        </button>
      </div>
    </header>
  );
}
