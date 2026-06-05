import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  BellOff,
  AlertTriangle,
  Wifi,
  WifiOff,
  Monitor,
  Server,
  ShieldAlert,
  CheckCheck,
  Trash2,
  Eye,
  Circle,
} from 'lucide-react';
import { api } from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType =
  | 'alert'
  | 'device_online'
  | 'device_offline'
  | 'session'
  | 'system'
  | 'blocked_app';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  deviceId?: string;
  deviceName?: string;
  read: boolean;
  createdAt: string;
}

type FilterTab = 'all' | 'alerts' | 'system' | 'sessions' | 'devices';

interface NotificationsViewProps {
  socket: any;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'alerts', label: 'Alertas' },
  { key: 'system', label: 'Sistema' },
  { key: 'sessions', label: 'Sesiones' },
  { key: 'devices', label: 'Dispositivos' },
];

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: typeof Bell; colorClass: string; bgClass: string; label: string }
> = {
  alert: {
    icon: AlertTriangle,
    colorClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    label: 'Alerta',
  },
  device_online: {
    icon: Wifi,
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    label: 'Dispositivo conectado',
  },
  device_offline: {
    icon: WifiOff,
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    label: 'Dispositivo desconectado',
  },
  session: {
    icon: Monitor,
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    label: 'Sesion remota',
  },
  system: {
    icon: Server,
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    label: 'Sistema',
  },
  blocked_app: {
    icon: ShieldAlert,
    colorClass: 'text-yellow-400',
    bgClass: 'bg-yellow-500/10',
    label: 'App bloqueada',
  },
};

const FILTER_MAP: Record<FilterTab, NotificationType[]> = {
  all: [],
  alerts: ['alert', 'blocked_app'],
  system: ['system'],
  sessions: ['session'],
  devices: ['device_online', 'device_offline'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.round((now - then) / 1000);

  if (diffSec < 10) return 'ahora';
  if (diffSec < 60) return `hace ${diffSec}s`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin}m`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays}d`;

  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsView({ socket }: NotificationsViewProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Fetch existing notifications from API
  // -------------------------------------------------------------------------

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch {
      // Silently fail - component remains usable with socket-only data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // -------------------------------------------------------------------------
  // Socket: listen for real-time notifications
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (data: Notification) => {
      setNotifications((prev) => {
        // Avoid duplicates
        if (prev.some((n) => n.id === data.id)) return prev;
        return [data, ...prev];
      });
    };

    socket.on('notification', handleNewNotification);
    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification', handleNewNotification);
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const markAsRead = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // Optimistic fallback
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } finally {
      setActionLoading(null);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setActionLoading('mark-all');
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } finally {
      setActionLoading(null);
    }
  }, []);

  const clearAllRead = useCallback(async () => {
    setActionLoading('clear-read');
    try {
      await api.delete('/notifications/read');
      setNotifications((prev) => prev.filter((n) => !n.read));
    } catch {
      setNotifications((prev) => prev.filter((n) => !n.read));
    } finally {
      setActionLoading(null);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    const types = FILTER_MAP[activeFilter];
    return notifications.filter((n) => types.includes(n.type));
  }, [notifications, activeFilter]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const readCount = useMemo(
    () => notifications.filter((n) => n.read).length,
    [notifications]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-5xl mx-auto animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 stagger-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">
              Notificaciones
            </h3>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
            Centro de Notificaciones
          </h1>
          <p className="text-sm md:text-base text-text-secondary mt-1 flex items-center gap-2">
            <Bell className="w-4 h-4 text-text-tertiary" />
            Historial de alertas y eventos del sistema
          </p>
        </div>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <div className="flex items-center gap-2 bg-brand/10 border border-brand/20 rounded-xl px-4 py-2">
            <Circle className="w-2.5 h-2.5 text-brand fill-brand animate-pulse" />
            <span className="text-sm font-semibold text-brand">
              {unreadCount} sin leer
            </span>
          </div>
        )}
      </div>

      {/* Filter tabs + Batch actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 stagger-2">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-surface-elevated/50 border border-surface-border rounded-xl p-1 overflow-x-auto">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`relative whitespace-nowrap px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                activeFilter === tab.key
                  ? 'bg-brand text-white shadow-lg shadow-brand/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              {tab.label}
              {tab.key === 'all' && unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-red-500 text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Batch actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || actionLoading === 'mark-all'}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-elevated/50 border border-surface-border hover:border-brand/30 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Marcar todas leidas</span>
          </button>
          <button
            onClick={clearAllRead}
            disabled={readCount === 0 || actionLoading === 'clear-read'}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-red-400 bg-surface-elevated/50 border border-surface-border hover:border-red-500/30 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Limpiar leidas</span>
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="space-y-3 stagger-3">
        {loading ? (
          // Loading skeleton
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="glass-subtle border border-surface-border rounded-2xl p-5 animate-pulse"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-elevated" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-surface-elevated rounded" />
                    <div className="h-3 w-72 bg-surface-elevated/60 rounded" />
                  </div>
                  <div className="h-3 w-16 bg-surface-elevated rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          // Empty state
          <div className="text-center py-20 bg-surface-elevated/30 rounded-2xl border border-dashed border-surface-border">
            <BellOff className="w-14 h-14 mx-auto mb-4 text-text-tertiary opacity-40" />
            <p className="text-base font-semibold text-text-primary mb-1">
              Sin notificaciones
            </p>
            <p className="text-sm text-text-tertiary max-w-sm mx-auto">
              {activeFilter === 'all'
                ? 'No hay notificaciones registradas. Las alertas y eventos del sistema apareceran aqui automaticamente.'
                : 'No hay notificaciones en esta categoria. Prueba seleccionando otro filtro.'}
            </p>
          </div>
        ) : (
          // Notification cards
          filtered.map((notification) => {
            const config = TYPE_CONFIG[notification.type];
            const Icon = config.icon;

            return (
              <div
                key={notification.id}
                className={`group relative glass-subtle border rounded-2xl p-5 transition-all duration-300 hover-card ${
                  notification.read
                    ? 'border-surface-border opacity-75 hover:opacity-100'
                    : 'border-surface-border hover:border-brand/30 shadow-lg shadow-black/5'
                }`}
              >
                {/* Unread indicator */}
                {!notification.read && (
                  <div className="absolute top-5 right-5 w-2.5 h-2.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.5)] animate-pulse" />
                )}

                <div className="flex items-start gap-4">
                  {/* Type icon */}
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${config.bgClass}`}
                  >
                    <Icon className={`w-5 h-5 ${config.colorClass}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4
                          className={`text-sm font-bold truncate ${
                            notification.read
                              ? 'text-text-secondary'
                              : 'text-text-primary'
                          }`}
                        >
                          {notification.title}
                        </h4>
                        <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>

                      {/* Timestamp */}
                      <span className="flex-shrink-0 text-[10px] font-medium text-text-tertiary whitespace-nowrap mt-0.5">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </div>

                    {/* Footer: device + actions */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-3">
                        {notification.deviceName && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary bg-surface-elevated/80 border border-surface-border px-2.5 py-1 rounded-lg">
                            <Monitor className="w-3 h-3" />
                            {notification.deviceName}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${config.bgClass} ${config.colorClass}`}
                        >
                          {config.label}
                        </span>
                      </div>

                      {/* Mark as read action */}
                      {!notification.read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          disabled={actionLoading === notification.id}
                          className="flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary hover:text-brand transition-colors duration-200 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Marcar leida
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary footer */}
      {!loading && notifications.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-2 stagger-4">
          <span className="text-[11px] text-text-tertiary font-medium">
            {notifications.length} notificaciones totales
          </span>
          <span className="w-1 h-1 rounded-full bg-surface-border" />
          <span className="text-[11px] text-text-tertiary font-medium">
            {unreadCount} sin leer
          </span>
          <span className="w-1 h-1 rounded-full bg-surface-border" />
          <span className="text-[11px] text-text-tertiary font-medium">
            {readCount} leidas
          </span>
        </div>
      )}
    </div>
  );
}
