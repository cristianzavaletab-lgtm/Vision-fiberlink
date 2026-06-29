import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Bell, Sun, Moon, Command, ChevronDown, Menu, Download, Building2, Monitor, Settings, FileText, BarChart3, Users, LayoutDashboard, X } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';
import { useSimpleMode } from '../context/SimpleModeContext';

interface SedeOption {
  id: string;
  name: string;
  color?: string;
}

interface TopBarProps {
  userName?: string;
  onMenuClick?: () => void;
  sedes?: SedeOption[];
  selectedSedeId?: string;
  onSedeChange?: (sedeId: string) => void;
  onNavigate?: (view: string) => void;
  devices?: Array<{ id: string; name: string; status: string; os?: string }>;
}

const VIEWS = [
  { key: 'dashboard',      label: 'Dashboard',       icon: LayoutDashboard, keywords: ['dashboard', 'inicio', 'home', 'centro'] },
  { key: 'monitoreo',      label: 'Monitoreo',        icon: Monitor,         keywords: ['monitoreo', 'remoto', 'control', 'pantalla'] },
  { key: 'dispositivos',   label: 'Dispositivos',     icon: Monitor,         keywords: ['dispositivos', 'equipos', 'computadoras'] },
  { key: 'reportes',       label: 'Reportes',         icon: FileText,        keywords: ['reportes', 'actividad', 'logs', 'historial'] },
  { key: 'productividad',  label: 'Productividad',    icon: BarChart3,       keywords: ['productividad', 'apps', 'uso', 'tiempo'] },
  { key: 'usuarios',       label: 'Usuarios',         icon: Users,           keywords: ['usuarios', 'user', 'roles', 'permisos'] },
  { key: 'configuracion',  label: 'Configuración',    icon: Settings,        keywords: ['configuracion', 'settings', 'ajustes', 'fps'] },
];

export function TopBar({ userName = 'Usuario', onMenuClick, sedes = [], selectedSedeId = '', onSedeChange, onNavigate, devices = [] }: TopBarProps) {
  const [isDark, setIsDark] = useState(true);
  const { isInstallable, installApp } = usePWA();
  const { isSimpleMode, zoomIn, zoomOut, resetZoom, highContrast, toggleHighContrast } = useSimpleMode();
  const [sedeDropdownOpen, setSedeDropdownOpen] = useState(false);
  const [accDropdownOpen, setAccDropdownOpen] = useState(false);

  // ── Global Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchResults = useCallback(() => {
    if (!searchQuery.trim()) return { views: [], devices: [] };
    const q = searchQuery.toLowerCase();

    const matchedViews = VIEWS.filter(v =>
      v.label.toLowerCase().includes(q) ||
      v.keywords.some(k => k.includes(q))
    );

    const matchedDevices = devices.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.os || '').toLowerCase().includes(q)
    ).slice(0, 4);

    return { views: matchedViews, devices: matchedDevices };
  }, [searchQuery, devices]);

  const results = searchResults();
  const hasResults = results.views.length > 0 || results.devices.length > 0;

  const handleSelect = (view: string) => {
    onNavigate?.(view);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const toggleTheme = () => {
    if (isDark) { document.documentElement.classList.remove('dark'); setIsDark(false); }
    else { document.documentElement.classList.add('dark'); setIsDark(true); }
  };

  return (
    <>
      {/* ── Full-screen search overlay (mobile + desktop) ── */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-bg-base/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
          <div ref={searchRef} className="w-full max-w-xl bg-surface-base border border-surface-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-surface-border">
              <Search className="w-4 h-4 text-brand shrink-0" />
              <input
                ref={inputRef}
                autoFocus
                type="text"
                placeholder="Buscar módulos, dispositivos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary focus:outline-none"
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="text-text-tertiary hover:text-text-primary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="p-2 max-h-80 overflow-y-auto custom-scrollbar">
              {!searchQuery && (
                <div className="px-3 py-8 text-center">
                  <Search className="w-8 h-8 text-surface-border mx-auto mb-2" />
                  <p className="text-xs text-text-tertiary">Escribe para buscar módulos o dispositivos</p>
                </div>
              )}

              {searchQuery && !hasResults && (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs text-text-tertiary">Sin resultados para "<span className="text-text-secondary">{searchQuery}</span>"</p>
                </div>
              )}

              {results.views.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-text-tertiary">Módulos</p>
                  {results.views.map(v => (
                    <button
                      key={v.key}
                      onClick={() => handleSelect(v.key)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-elevated text-left transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center group-hover:bg-brand/20 transition-colors">
                        <v.icon className="w-4 h-4 text-brand" />
                      </div>
                      <span className="text-sm font-medium text-text-primary">{v.label}</span>
                      <span className="ml-auto text-[10px] text-text-tertiary font-mono bg-surface-elevated px-1.5 py-0.5 rounded border border-surface-border">↵</span>
                    </button>
                  ))}
                </div>
              )}

              {results.devices.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-text-tertiary">Dispositivos</p>
                  {results.devices.map(d => (
                    <button
                      key={d.id}
                      onClick={() => handleSelect('monitoreo')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-elevated text-left transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${d.status === 'online' ? 'bg-status-success' : 'bg-surface-border'}`} />
                      <span className="text-sm font-medium text-text-primary">{d.name}</span>
                      {d.os && <span className="ml-auto text-[10px] text-text-tertiary">{d.os}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-surface-border flex items-center gap-3 text-[10px] text-text-tertiary">
              <span><kbd className="bg-surface-elevated border border-surface-border rounded px-1">↵</kbd> Abrir</span>
              <span><kbd className="bg-surface-elevated border border-surface-border rounded px-1">Esc</kbd> Cerrar</span>
            </div>
          </div>
        </div>
      )}

      <header className="h-14 sm:h-16 bg-surface-base/80 backdrop-blur-xl border-b border-surface-border flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10 transition-colors safe-top">
        {/* ─── Search Bar & Menu ─── */}
        <div className="flex-1 flex items-center gap-2 sm:gap-3 max-w-2xl">
          <button 
            onClick={onMenuClick}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-elevated text-text-secondary transition-colors active:scale-90"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          {/* Mobile: App title */}
          <div className="flex items-center gap-2 sm:hidden truncate">
            <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" />
            <h1 className="text-sm font-bold text-text-primary">VisionControl</h1>
          </div>
          
          {/* Desktop: Clickable search trigger */}
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="relative w-full max-w-md hidden sm:flex items-center gap-2 bg-surface-elevated/50 border border-surface-border rounded-lg pl-10 pr-14 py-2 text-[13px] text-text-tertiary hover:bg-surface-elevated hover:border-brand/30 transition-all duration-300 group"
          >
            <Search className="absolute left-3.5 w-4 h-4 text-text-tertiary group-hover:text-brand transition-colors" />
            <span>Buscar dispositivos, módulos...</span>
            <div className="absolute right-3 flex items-center gap-0.5 bg-surface-base px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border border-surface-border">
              <Command className="w-3 h-3" />K
            </div>
          </button>
        </div>

        {/* ─── Right Actions ─── */}
        <div className="flex items-center gap-2 shrink-0">
          {isInstallable && (
            <button 
              onClick={installApp}
              className="hidden sm:flex items-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors border border-brand/20"
            >
              <Download className="w-3.5 h-3.5" /> Instalar App
            </button>
          )}

          {/* Sede Selector */}
          <div className="relative">
            <button 
              onClick={() => setSedeDropdownOpen(!sedeDropdownOpen)}
              className="flex items-center gap-2 bg-surface-elevated/30 border border-surface-border rounded-lg px-3 py-1.5 text-[13px] font-medium text-text-primary hover:bg-surface-elevated hover:border-surface-border transition-all duration-200 group"
            >
              {selectedSedeId ? (
                <>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sedes.find(s => s.id === selectedSedeId)?.color || '#FF6B35' }} />
                  <span className="hidden sm:inline max-w-[100px] truncate">{sedes.find(s => s.id === selectedSedeId)?.name || 'Sede'}</span>
                </>
              ) : (
                <>
                  <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                  <span className="hidden sm:inline">Todas las sedes</span>
                </>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${sedeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {sedeDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setSedeDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-surface-base border border-surface-border rounded-xl shadow-xl z-30 overflow-hidden animate-slide-up">
                  <button
                    onClick={() => { onSedeChange?.(''); setSedeDropdownOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors ${!selectedSedeId ? 'bg-brand/10 text-brand' : 'text-text-primary hover:bg-surface-elevated'}`}
                  >
                    <Building2 className="w-3.5 h-3.5" /> Todas las sedes
                  </button>
                  {sedes.map(sede => (
                    <button
                      key={sede.id}
                      onClick={() => { onSedeChange?.(sede.id); setSedeDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors ${selectedSedeId === sede.id ? 'bg-brand/10 text-brand' : 'text-text-primary hover:bg-surface-elevated'}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sede.color || '#FF6B35' }} />
                      <span className="truncate">{sede.name}</span>
                    </button>
                  ))}
                  {sedes.length === 0 && (
                    <p className="px-3.5 py-3 text-[10px] text-text-tertiary text-center">Sin sedes creadas</p>
                  )}
                </div>
              </>
            )}
          </div>

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
            title="Alternar Tema"
          >
            {isDark ? (
              <Sun className="w-4 h-4 group-hover:text-amber-400 transition-colors duration-300" />
            ) : (
              <Moon className="w-4 h-4 group-hover:text-indigo-400 transition-colors duration-300" />
            )}
          </button>

          {/* Accessibility / Simple Mode Toggle */}
          <div className="relative">
            <button 
              onClick={() => setAccDropdownOpen(!accDropdownOpen)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${isSimpleMode || highContrast ? 'bg-brand/10 text-brand' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'}`}
              title="Accesibilidad y Modo Simple"
            >
              <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[8px] font-bold">A</div>
            </button>

            {accDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setAccDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-surface-base border border-surface-border rounded-xl shadow-xl z-30 overflow-hidden animate-slide-up">
                  <div className="p-3 border-b border-surface-border bg-surface-elevated/30">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Accesibilidad</h3>
                    <p className="text-[10px] text-text-tertiary mt-0.5">Ajusta la interfaz a tu medida</p>
                  </div>
                  
                  <div className="p-2 space-y-1">

                    {/* Alto Contraste */}
                    <button
                      onClick={toggleHighContrast}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-elevated transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-medium text-text-primary">Alto Contraste</span>
                      </div>
                      <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${highContrast ? 'bg-brand' : 'bg-surface-border'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform ${highContrast ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </button>

                    <div className="h-px bg-surface-border my-1" />

                    {/* Zoom Controls */}
                    <div className="px-3 py-2">
                      <span className="text-xs font-medium text-text-secondary block mb-2">Tamaño de letra</span>
                      <div className="flex items-center gap-2">
                        <button onClick={zoomOut} className="flex-1 py-1.5 flex justify-center items-center rounded bg-surface-elevated hover:bg-brand/10 hover:text-brand transition-colors text-xs font-bold border border-surface-border">A-</button>
                        <button onClick={resetZoom} className="flex-1 py-1.5 flex justify-center items-center rounded bg-surface-elevated hover:bg-brand/10 hover:text-brand transition-colors text-xs font-bold border border-surface-border">A</button>
                        <button onClick={zoomIn} className="flex-1 py-1.5 flex justify-center items-center rounded bg-surface-elevated hover:bg-brand/10 hover:text-brand transition-colors text-sm font-bold border border-surface-border">A+</button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-surface-border mx-1 hidden sm:block" />

          {/* User Avatar */}
          <button className="flex items-center gap-2 hover:bg-surface-elevated/50 p-1 pr-2 rounded-lg transition-all duration-200 group">
            <div className="w-8 h-8 rounded-md bg-surface-elevated border border-surface-border flex items-center justify-center text-[13px] font-bold text-text-primary group-hover:border-brand/40 transition-colors">
              {getInitials(userName)}
            </div>
            <div className="flex-col text-left hidden sm:flex">
              <span className="text-[13px] font-medium text-text-primary leading-tight">{userName}</span>
              <span className="text-[10px] text-text-tertiary font-medium">Administrador</span>
            </div>
          </button>
        </div>
      </header>
    </>
  );
}
