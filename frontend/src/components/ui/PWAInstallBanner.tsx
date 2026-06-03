import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, X, Smartphone, Share, Plus, Monitor, Zap, Bell, Shield, CheckCircle2, Globe, Compass } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';
import { haptic } from '../../services/haptics';

// ─── Constants ───────────────────────────────────────────────
const SESSION_DISMISS_KEY = 'vc-pwa-dismissed-session';
const INTERACTIONS_KEY = 'vc-pwa-interactions';
const VISIT_COUNT_KEY = 'vc-pwa-visits';
const ANALYTICS_KEY = 'vc-pwa-analytics';
const MIN_INTERACTIONS = 2; // Show after 2 user interactions
const VISITS_FOR_POPUP = 2; // Show full popup after 2 visits with mini-banner

// ─── Types ───────────────────────────────────────────────────
type BannerStage = 'hidden' | 'mini' | 'full';
type BrowserType = 'chrome' | 'safari' | 'edge' | 'firefox' | 'samsung' | 'opera' | 'other';

// ─── Analytics tracker ───────────────────────────────────────
function trackEvent(event: 'banner_view' | 'banner_mini_view' | 'install_click' | 'install_success' | 'dismiss') {
  try {
    const analytics = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '{}');
    analytics[event] = (analytics[event] || 0) + 1;
    analytics.lastEvent = { type: event, at: Date.now() };
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
  } catch { /* silent */ }
}

// ─── Browser detection ───────────────────────────────────────
function detectBrowser(): BrowserType {
  const ua = navigator.userAgent || '';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/OPR|Opera/i.test(ua)) return 'opera';
  if (/Edg/i.test(ua)) return 'edge';
  if (/Firefox/i.test(ua)) return 'firefox';
  if (/CriOS|Chrome/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'other';
}

function getBrowserName(browser: BrowserType): string {
  const names: Record<BrowserType, string> = {
    chrome: 'Chrome',
    safari: 'Safari',
    edge: 'Edge',
    firefox: 'Firefox',
    samsung: 'Samsung Internet',
    opera: 'Opera',
    other: 'tu navegador',
  };
  return names[browser];
}

// ─── Main Component ──────────────────────────────────────────
export function PWAInstallBanner() {
  const { isInstallable, isInstalled, isIOSSafari, platform, installApp } = usePWA();
  const [stage, setStage] = useState<BannerStage>('hidden');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const browser = useRef(detectBrowser()).current;

  // ─── Smart timing: track interactions ─────────────────────
  useEffect(() => {
    if (isInstalled) return;

    // Clean up old localStorage key from previous versions
    localStorage.removeItem('vc-pwa-banner-dismissed');

    // Check if dismissed this session
    if (sessionStorage.getItem(SESSION_DISMISS_KEY)) return;

    // Track visit count
    const visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_COUNT_KEY, visits.toString());

    // Listen for user interactions to determine engagement
    let interactions = parseInt(sessionStorage.getItem(INTERACTIONS_KEY) || '0', 10);

    const handleInteraction = () => {
      interactions++;
      sessionStorage.setItem(INTERACTIONS_KEY, interactions.toString());

      if (interactions >= MIN_INTERACTIONS && stage === 'hidden') {
        // Decide: mini-banner or full popup based on visit count
        if (visits >= VISITS_FOR_POPUP) {
          showFullPopup();
        } else {
          showMiniBanner();
        }
        // Remove listeners once triggered
        cleanup();
      }
    };

    // If already has enough interactions (e.g., navigated back)
    if (interactions >= MIN_INTERACTIONS) {
      const timer = setTimeout(() => {
        if (visits >= VISITS_FOR_POPUP) {
          showFullPopup();
        } else {
          showMiniBanner();
        }
      }, 600);
      return () => clearTimeout(timer);
    }

    const events = ['click', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, handleInteraction, { passive: true }));

    const cleanup = () => {
      events.forEach(e => document.removeEventListener(e, handleInteraction));
    };

    // Fallback: show mini-banner after 3s even without interaction
    const fallbackTimer = setTimeout(() => {
      if (stage === 'hidden') {
        if (visits >= VISITS_FOR_POPUP) {
          showFullPopup();
        } else {
          showMiniBanner();
        }
        cleanup();
      }
    }, 3000);

    return () => {
      cleanup();
      clearTimeout(fallbackTimer);
    };
  }, [isInstalled]);

  // ─── Stage transitions ────────────────────────────────────
  const showMiniBanner = useCallback(() => {
    setStage('mini');
    trackEvent('banner_mini_view');
    haptic('light');
  }, []);

  const showFullPopup = useCallback(() => {
    setStage('full');
    setBackdropOpacity(0);
    trackEvent('banner_view');
    haptic('medium');
    // Animate backdrop
    requestAnimationFrame(() => {
      setTimeout(() => setBackdropOpacity(1), 50);
    });
  }, []);

  // ─── Accessibility: ESC to close + focus trap ─────────────
  useEffect(() => {
    if (stage !== 'full' && !showGuide) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
        return;
      }
      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto-focus first button
    setTimeout(() => firstFocusRef.current?.focus(), 100);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [stage, showGuide]);

  // ─── Handlers ─────────────────────────────────────────────
  const handleDismiss = useCallback(() => {
    haptic('light');
    trackEvent('dismiss');
    setBackdropOpacity(0);
    setTimeout(() => {
      setStage('hidden');
      setShowGuide(false);
      sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
    }, 200);
  }, []);

  const handleMiniBannerClick = useCallback(() => {
    haptic('medium');
    showFullPopup();
  }, [showFullPopup]);

  const handleInstall = useCallback(async () => {
    haptic('medium');
    trackEvent('install_click');

    if (isInstallable) {
      setInstalling(true);
      const success = await installApp();
      setInstalling(false);
      if (success) {
        haptic('success');
        trackEvent('install_success');
        setInstalled(true);
        // Show success state for 2s then dismiss
        setTimeout(() => {
          setStage('hidden');
          sessionStorage.setItem(SESSION_DISMISS_KEY, 'true');
        }, 2500);
      }
    } else {
      setShowGuide(true);
    }
  }, [isInstallable, installApp]);

  // ─── Don't render if installed ────────────────────────────
  if (isInstalled || stage === 'hidden') return null;

  // ─── Success state (confetti/check) ───────────────────────
  if (installed) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div className="relative flex flex-col items-center gap-4 animate-scale-in">
          {/* Confetti particles */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-confetti"
                style={{
                  left: '50%',
                  top: '50%',
                  backgroundColor: ['#FF6B35', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'][i % 6],
                  animationDelay: `${i * 0.05}s`,
                  // @ts-ignore
                  '--confetti-angle': `${(i * 30)}deg`,
                  '--confetti-distance': `${60 + Math.random() * 40}px`,
                } as React.CSSProperties}
              />
            ))}
          </div>
          {/* Success icon */}
          <div className="w-20 h-20 rounded-full bg-status-success/20 border-2 border-status-success flex items-center justify-center animate-bounce-in">
            <CheckCircle2 size={40} className="text-status-success" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary">Instalado correctamente</p>
            <p className="text-sm text-text-secondary mt-1">Accede desde tu pantalla de inicio</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Mini Banner (subtle top/bottom bar) ──────────────────
  if (stage === 'mini' && !showGuide) {
    return (
      <div
        role="banner"
        aria-label="Instalar aplicacion"
        className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-[9999] animate-slide-from-bottom"
      >
        <button
          onClick={handleMiniBannerClick}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl
                     bg-surface-elevated/95 backdrop-blur-xl
                     border border-surface-border hover:border-brand/30
                     shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]
                     transition-all duration-300 group
                     active:scale-[0.97]"
        >
          {/* App icon */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shrink-0 shadow-lg shadow-brand/20 group-hover:shadow-brand/40 transition-shadow">
            <Download size={18} className="text-white" />
          </div>

          {/* Text */}
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">Instalar VisionControl</p>
            <p className="text-xs text-text-tertiary">Acceso rapido sin navegador</p>
          </div>

          {/* CTA */}
          <div className="shrink-0 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/20 text-brand text-xs font-bold group-hover:bg-brand/20 transition-colors">
            Instalar
          </div>
        </button>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="Cerrar"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface-elevated border border-surface-border flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-highlight transition-all shadow-md"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // ─── Manual Install Guide (per browser) ───────────────────
  if (showGuide) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: backdropOpacity }}
          onClick={handleDismiss}
        />
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="relative w-full max-w-sm bg-surface-elevated border border-surface-border rounded-2xl p-6 shadow-2xl animate-slide-from-bottom"
        >
          <button
            ref={firstFocusRef}
            onClick={handleDismiss}
            aria-label="Cerrar guia de instalacion"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-base text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/20">
              {getBrowserIcon(browser)}
            </div>
            <h3 id="pwa-guide-title" className="text-lg font-bold text-text-primary">
              Instalar desde {getBrowserName(browser)}
            </h3>
            <p className="text-sm text-text-secondary mt-1">Sigue estos pasos</p>
          </div>

          <div className="space-y-4">
            {getInstallSteps(browser, isIOSSafari, platform)}
          </div>

          <button
            onClick={handleDismiss}
            className="w-full mt-6 py-3 rounded-xl bg-brand text-white text-sm font-bold active:scale-[0.97] transition-transform"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  // ─── Full Popup Modal ─────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      {/* Backdrop with progressive blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-500"
        style={{ opacity: backdropOpacity }}
        onClick={handleDismiss}
      />

      {/* Popup Card */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-desc"
        className="relative w-full max-w-sm bg-surface-elevated border border-surface-border rounded-2xl shadow-2xl overflow-hidden animate-pwa-spring"
      >
        {/* Close button */}
        <button
          ref={firstFocusRef}
          onClick={handleDismiss}
          aria-label="Cerrar popup de instalacion"
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white/70 hover:text-white hover:bg-black/40 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Header gradient with app branding */}
        <div className="bg-gradient-to-br from-brand to-brand-dark px-6 pt-8 pb-10 text-center relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.1),transparent_70%)]" />
          <div className="absolute top-4 left-4 w-24 h-24 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute bottom-2 right-6 w-16 h-16 rounded-full bg-black/10 blur-xl" />

          <div className="relative">
            {/* App Logo */}
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mx-auto mb-4 shadow-xl">
              {platform === 'ios' || platform === 'android'
                ? <Smartphone size={28} className="text-white" />
                : <Monitor size={28} className="text-white" />
              }
            </div>
            <h2 id="pwa-install-title" className="text-xl font-bold text-white">
              Descarga VisionControl
            </h2>
            <p id="pwa-install-desc" className="text-white/70 text-sm mt-1">
              Instala la app en tu {platform === 'desktop' ? 'computadora' : 'dispositivo'}
            </p>
          </div>
        </div>

        {/* Benefits section */}
        <div className="px-6 py-5 space-y-3">
          <BenefitRow
            icon={<Zap size={16} className="text-brand" />}
            text="Acceso instantaneo sin abrir el navegador"
            delay={0}
          />
          <BenefitRow
            icon={<Bell size={16} className="text-brand" />}
            text="Notificaciones de alertas en tiempo real"
            delay={1}
          />
          <BenefitRow
            icon={<Shield size={16} className="text-brand" />}
            text="Funciona offline con datos guardados"
            delay={2}
          />

          {/* Trust indicator - app size */}
          <div className="flex items-center gap-3 pt-2 border-t border-surface-border mt-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-text-tertiary mb-1">
                <span>App ligera</span>
                <span className="font-mono">~2 MB</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-highlight overflow-hidden">
                <div className="h-full w-[8%] rounded-full bg-gradient-to-r from-brand to-status-success animate-pulse-soft" />
              </div>
            </div>
          </div>
        </div>

        {/* Install Button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-4 rounded-xl text-base font-bold
                       bg-gradient-to-r from-brand to-brand-dark text-white
                       hover:from-brand-light hover:to-brand
                       active:scale-[0.97] transition-all duration-200
                       shadow-lg shadow-brand/30 hover:shadow-brand/50
                       disabled:opacity-60
                       flex items-center justify-center gap-2
                       focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-surface-elevated"
          >
            <Download size={20} className={installing ? 'animate-bounce' : ''} />
            {installing ? 'Instalando...' : 'Instalar Ahora'}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full mt-3 py-2 text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function BenefitRow({ icon, text, delay }: { icon: React.ReactNode; text: string; delay: number }) {
  return (
    <div
      className="flex items-center gap-3 animate-float-up"
      style={{ animationDelay: `${delay * 0.1 + 0.2}s` }}
    >
      <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <p className="text-sm text-text-secondary">{text}</p>
    </div>
  );
}

function Step({ num, title, desc }: { num: number; title: React.ReactNode; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-brand">{num}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary flex items-center gap-1">{title}</p>
        <p className="text-xs text-text-tertiary mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// ─── Browser-specific install steps ──────────────────────────
function getBrowserIcon(browser: BrowserType) {
  switch (browser) {
    case 'chrome': return <Globe size={24} className="text-white" />;
    case 'safari': return <Compass size={24} className="text-white" />;
    case 'edge': return <Globe size={24} className="text-white" />;
    default: return <Smartphone size={24} className="text-white" />;
  }
}

function getInstallSteps(browser: BrowserType, isIOS: boolean, platform: string) {
  if (isIOS) {
    return (
      <>
        <Step num={1} title={<>Toca <Share size={14} className="inline text-blue-400" /> Compartir</>} desc="En la barra inferior de Safari" />
        <Step num={2} title={<><Plus size={14} className="inline" /> Agregar a inicio</>} desc="Desplazate y busca esta opcion" />
        <Step num={3} title="Toca Agregar" desc="Listo! La app estara en tu pantalla de inicio" />
      </>
    );
  }

  switch (browser) {
    case 'chrome':
      return (
        <>
          <Step num={1} title="Menu de Chrome" desc="Los 3 puntos verticales arriba a la derecha" />
          <Step num={2} title={<><Download size={14} className="inline" /> Instalar aplicacion</>} desc='Busca "Instalar VisionControl"' />
          <Step num={3} title="Confirmar instalacion" desc="Se agrega a tu escritorio automaticamente" />
        </>
      );
    case 'edge':
      return (
        <>
          <Step num={1} title="Menu de Edge" desc='Los 3 puntos "..." arriba a la derecha' />
          <Step num={2} title="Aplicaciones" desc='Selecciona "Instalar este sitio como aplicacion"' />
          <Step num={3} title="Instalar" desc="Confirma y listo, se abre como app nativa" />
        </>
      );
    case 'samsung':
      return (
        <>
          <Step num={1} title="Menu del navegador" desc="El icono de 3 lineas abajo" />
          <Step num={2} title={<><Plus size={14} className="inline" /> Agregar a pantalla de inicio</>} desc="En el menu principal" />
          <Step num={3} title="Aceptar" desc="Se creara un acceso directo en tu inicio" />
        </>
      );
    case 'firefox':
      return (
        <>
          <Step num={1} title="Menu de Firefox" desc="Los 3 puntos en la barra de direcciones" />
          <Step num={2} title="Instalar" desc='Busca "Instalar" o "Agregar a inicio"' />
          <Step num={3} title="Confirmar" desc="La app se instalara en tu dispositivo" />
        </>
      );
    default:
      return (
        <>
          <Step num={1} title="Menu del navegador" desc={platform === 'desktop' ? 'Busca opciones o ajustes' : 'Los 3 puntos del menu'} />
          <Step num={2} title={<><Download size={14} className="inline" /> Instalar aplicacion</>} desc='O "Agregar a pantalla de inicio"' />
          <Step num={3} title="Confirmar" desc="La app se instalara automaticamente" />
        </>
      );
  }
}

// ─── Inline install button (for TopBar/Sidebar) ─────────────
export function PWAInstallButton({ className = '' }: { className?: string }) {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [installing, setInstalling] = useState(false);

  if (!isInstallable || isInstalled) return null;

  const handleInstall = async () => {
    haptic('medium');
    setInstalling(true);
    await installApp();
    setInstalling(false);
  };

  return (
    <button
      onClick={handleInstall}
      disabled={installing}
      title="Instalar VisionControl"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                  bg-gradient-to-r from-orange-500/20 to-orange-600/10
                  border border-orange-500/30 text-orange-400
                  hover:from-orange-500/30 hover:border-orange-500/50 hover:text-orange-300
                  transition-all duration-200 ${className}`}
    >
      <Download size={13} />
      {installing ? 'Instalando...' : 'Instalar app'}
    </button>
  );
}
