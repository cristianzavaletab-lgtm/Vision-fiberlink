import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, AlertTriangle, Info, X, WifiOff } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <ToastNotification key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastNotification({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const icons = {
    success: <CheckCircle className="w-4 h-4 text-status-success" />,
    error: <WifiOff className="w-4 h-4 text-status-error" />,
    warning: <AlertTriangle className="w-4 h-4 text-status-warning" />,
    info: <Info className="w-4 h-4 text-brand" />,
  };

  const borderColors = {
    success: 'border-l-status-success',
    error: 'border-l-status-error',
    warning: 'border-l-status-warning',
    info: 'border-l-brand',
  };

  return (
    <div
      className={`
        pointer-events-auto bg-surface-elevated/95 backdrop-blur-xl border border-surface-border rounded-xl p-3.5 shadow-2xl shadow-black/30
        border-l-[3px] ${borderColors[toast.type]}
        transition-all duration-300 ease-out
        ${isVisible && !isExiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-primary leading-tight">{toast.title}</p>
          {toast.message && (
            <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{toast.message}</p>
          )}
        </div>
        <button
          onClick={() => { setIsExiting(true); setTimeout(() => onDismiss(toast.id), 300); }}
          className="shrink-0 p-1 text-text-tertiary hover:text-text-primary rounded-md hover:bg-surface-highlight transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
