import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Headphones,
  Laptop,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  MousePointer,
  Phone,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  TrendingUp,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from './services/api';
import { getBestServerUrl } from './services/serverResolver';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PWAInstallBanner } from './components/ui/PWAInstallBanner';
import { ToastProvider, useToast } from './components/ui/Toast';

type ViewId = 'dashboard' | 'machines' | 'machine-detail' | 'excel' | 'movements' | 'reports' | 'remote-support' | 'alerts' | 'settings';
type PeriodFilter = 'today' | 'week' | 'month' | 'custom';

interface Device {
  id: string;
  name: string;
  os?: string;
  status: 'online' | 'offline';
  lastSeen: number;
  activeApp?: string;
  companyArea?: string;
  agentVersion?: string;
  remoteSupportEnabled?: boolean;
  remoteSupportActive?: boolean;
}

interface ExcelAuditLog {
  id: string;
  deviceId: string;
  deviceName?: string;
  fileName: string;
  sheetName: string;
  action: string;
  details: string;
  naturalText: string;
  createdAt: string;
}

interface MovementRow extends ExcelAuditLog {
  amount: number;
  category: 'income' | 'collection' | 'expense' | 'change';
}

export interface Report {
  id: string;
  date: string;
  device: string;
  type: string;
  description: string;
  status: string;
}

const navItems = [
  { id: 'dashboard' as const, label: 'Inicio', icon: LayoutDashboard },
  { id: 'machines' as const, label: 'Máquinas', icon: MonitorSmartphone },
  { id: 'excel' as const, label: 'Excel', icon: FileSpreadsheet },
  { id: 'movements' as const, label: 'Movimientos', icon: Activity },
  { id: 'reports' as const, label: 'Reportes', icon: FileText },
  { id: 'remote-support' as const, label: 'Soporte remoto', icon: Headphones },
  { id: 'alerts' as const, label: 'Alertas', icon: Bell },
  { id: 'settings' as const, label: 'Configuración', icon: Settings },
];

const sampleTrend = [
  { time: '08:00', ingresos: 0, cobros: 0 },
  { time: '10:00', ingresos: 0, cobros: 0 },
  { time: '12:00', ingresos: 0, cobros: 0 },
  { time: '14:00', ingresos: 0, cobros: 0 },
  { time: '16:00', ingresos: 0, cobros: 0 },
  { time: '18:00', ingresos: 0, cobros: 0 },
];

function normalizeText(value?: string) {
  return (value || '').toLowerCase();
}

function isToday(date: string) {
  const target = new Date(date);
  const now = new Date();
  return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() && target.getDate() === now.getDate();
}

function isWithinDays(date: string, days: number) {
  return Date.now() - new Date(date).getTime() <= days * 24 * 60 * 60 * 1000;
}

function formatCurrency(value: number) {
  return `S/ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value?: string | number) {
  if (!value) return 'Sin registro';
  return new Date(value).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value?: string | number) {
  if (!value) return '--:--';
  return new Date(value).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function getPanelToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || params.get('panel_token') || localStorage.getItem('panelAccessToken') || '';
  if (token) localStorage.setItem('panelAccessToken', token);
  return token;
}

function extractAmount(log: ExcelAuditLog) {
  const sources = [log.details, log.naturalText, log.action, log.sheetName].filter(Boolean).join(' ');
  let parsedAmount = 0;

  try {
    const parsed = JSON.parse(log.details || '{}');
    const totalCollected = Number(parsed.totalCollected || 0);
    const totalIncome = Number(parsed.totalIncome || 0);
    const detectedAmount = Number(parsed.detectedAmount || 0);
    if (totalCollected > 0) return { amount: totalCollected, category: 'collection' as const };
    if (totalIncome > 0) return { amount: totalIncome, category: 'income' as const };
    if (detectedAmount > 0) parsedAmount = detectedAmount;
    const flatValues = Object.values(parsed).flatMap((value: any) => {
      if (value && typeof value === 'object') return Object.values(value);
      return [value];
    });
    const numericValue = flatValues.find((value) => {
      if (typeof value === 'number') return value > 0;
      if (typeof value !== 'string') return false;
      return /\d+[.,]?\d*/.test(value);
    });
    if (numericValue !== undefined) {
      parsedAmount = Number(String(numericValue).replace(/[^\d.-]/g, '')) || 0;
    }
  } catch {
    const amountMatch = sources.match(/(?:S\/|s\/|monto|total|importe|cobro|ingreso|venta)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (amountMatch) parsedAmount = Number(amountMatch[1].replace(/,/g, '')) || 0;
  }

  const text = normalizeText(sources);
  const category: MovementRow['category'] = text.includes('cobro') || text.includes('pagado')
    ? 'collection'
    : text.includes('gasto') || text.includes('egreso')
      ? 'expense'
      : text.includes('venta') || text.includes('ingreso') || parsedAmount > 0
        ? 'income'
        : 'change';

  return { amount: parsedAmount, category };
}

function buildRows(logs: ExcelAuditLog[]): MovementRow[] {
  return logs.map((log) => ({ ...log, ...extractAmount(log) }));
}

function getDeviceName(devices: Device[], log: ExcelAuditLog) {
  return log.deviceName || devices.find((device) => device.id === log.deviceId)?.name || log.deviceId || 'Máquina no identificada';
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-black/5 bg-white shadow-[0_18px_70px_rgba(15,23,42,0.08)] ${className}`}>{children}</section>;
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function Shell({ currentView, setCurrentView, children, socketConnected, devices }: {
  currentView: ViewId;
  setCurrentView: (view: ViewId) => void;
  children: ReactNode;
  socketConnected: boolean;
  devices: Device[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeDevices = devices.filter((device) => device.status === 'online').length;

  const navigate = (view: ViewId) => {
    setCurrentView(view);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f6f3ef] text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-[-10%] h-96 w-96 rounded-full bg-orange-200/45 blur-3xl" />
        <div className="absolute right-[-12%] top-20 h-[32rem] w-[32rem] rounded-full bg-black/10 blur-3xl" />
      </div>

      {mobileOpen && <button className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/60 bg-[#111111] text-white shadow-2xl transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-white/10 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/25">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">VisionControl</p>
              <p className="text-xs font-medium text-white/55">Excel y soporte autorizado</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const active = currentView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${active ? 'bg-white text-slate-950 shadow-xl shadow-black/20' : 'text-white/65 hover:bg-white/8 hover:text-white'}`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-orange-500' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-white/45">
              <span>Acceso</span>
              <ShieldCheck className="h-4 w-4 text-orange-400" />
            </div>
            <p className="mt-2 text-sm font-bold text-white">Panel sin login tradicional</p>
            <p className="mt-1 text-xs leading-5 text-white/50">Preparado para red privada o enlace con token interno.</p>
          </div>
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${socketConnected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-orange-500/10 text-orange-300'}`}>
            <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-orange-400'} ${socketConnected ? 'animate-pulse' : ''}`} />
            {socketConnected ? 'Datos en tiempo real' : 'Conectando datos'}
          </div>
        </div>
      </aside>

      <div className="relative md:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/70 bg-[#f6f3ef]/85 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm md:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Panel ejecutivo</p>
                <h1 className="text-lg font-black tracking-tight sm:text-2xl">Control de archivos Excel</h1>
              </div>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="rounded-full border border-white bg-white px-4 py-2 text-sm font-bold shadow-sm">
                {activeDevices} máquinas activas
              </div>
              <div className="rounded-full bg-[#111] px-4 py-2 text-sm font-bold text-white shadow-sm">
                {new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-18px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl md:hidden">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const active = currentView === item.id;
              const Icon = item.icon;
              return (
                <button key={item.id} onClick={() => navigate(item.id)} className={`flex min-w-[72px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-bold ${active ? 'bg-orange-50 text-orange-600' : 'text-slate-500'}`}>
                  <Icon className="h-5 w-5" />
                  {item.id === 'movements' ? 'Mov.' : item.id === 'remote-support' ? 'Soporte' : item.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function KpiCard({ label, value, helper, icon: Icon, dark = false }: { label: string; value: string; helper: string; icon: LucideIcon; dark?: boolean }) {
  return (
    <div className={`rounded-3xl p-5 shadow-[0_18px_70px_rgba(15,23,42,0.08)] ${dark ? 'bg-[#111] text-white' : 'border border-black/5 bg-white text-slate-950'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${dark ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600'}`}>
          <Icon className="h-6 w-6" />
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${dark ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-500'}`}>Hoy</span>
      </div>
      <p className={`mt-5 text-sm font-bold ${dark ? 'text-white/55' : 'text-slate-500'}`}>{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{value}</p>
      <p className={`mt-2 text-xs leading-5 ${dark ? 'text-white/45' : 'text-slate-500'}`}>{helper}</p>
    </div>
  );
}

function DashboardView({ rows, devices, setCurrentView }: { rows: MovementRow[]; devices: Device[]; setCurrentView: (view: ViewId) => void }) {
  const todayRows = rows.filter((row) => isToday(row.createdAt));
  const totalIncome = todayRows.filter((row) => row.category === 'income').reduce((sum, row) => sum + row.amount, 0);
  const totalCollections = todayRows.filter((row) => row.category === 'collection').reduce((sum, row) => sum + row.amount, 0);
  const files = new Set(todayRows.map((row) => row.fileName).filter(Boolean));
  const activeDevices = devices.filter((device) => device.status === 'online');
  const last = rows[0];

  const trend = useMemo(() => {
    if (todayRows.length === 0) return sampleTrend;
    const buckets = new Map<string, { time: string; ingresos: number; cobros: number }>();
    for (const row of todayRows) {
      const hour = new Date(row.createdAt).getHours().toString().padStart(2, '0') + ':00';
      const bucket = buckets.get(hour) || { time: hour, ingresos: 0, cobros: 0 };
      if (row.category === 'collection') bucket.cobros += row.amount;
      if (row.category === 'income') bucket.ingresos += row.amount;
      buckets.set(hour, bucket);
    }
    return Array.from(buckets.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [todayRows]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-[#111] text-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]">
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-500/25 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-orange-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-orange-300">Auditoría de Excel</p>
              <h2 className="max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Resumen claro del negocio en menos de 10 segundos.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">Ingresos, cobros, archivos usados, máquinas activas y últimos cambios registrados desde Excel en máquinas autorizadas.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Última actividad</p>
              {last ? (
                <>
                  <p className="mt-3 text-lg font-black">{last.naturalText || last.action}</p>
                  <p className="mt-2 text-sm text-white/55">{last.fileName} · {formatTime(last.createdAt)}</p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-white/55">Esperando cambios enviados por el programa instalado en las máquinas autorizadas.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total cobrado" value={formatCurrency(totalCollections)} helper="Suma de movimientos clasificados como cobro." icon={CheckCircle2} dark />
        <KpiCard label="Total ingresado" value={formatCurrency(totalIncome)} helper="Ventas e ingresos detectados en Excel." icon={TrendingUp} />
        <KpiCard label="Movimientos" value={`${todayRows.length}`} helper="Registros agregados, editados o eliminados." icon={Activity} />
        <KpiCard label="Archivos Excel" value={`${files.size}`} helper="Archivos con actividad registrada hoy." icon={FileSpreadsheet} />
        <KpiCard label="Máquinas activas" value={`${activeDevices.length}`} helper={`De ${devices.length} máquinas registradas.`} icon={Laptop} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">Ingresos y cobros del día</h3>
              <p className="text-sm text-slate-500">Gráfico simple basado en eventos reales recibidos desde Excel.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-orange-500" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="collectionGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#111111" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#111111" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(value) => `S/${value}`} />
                <Tooltip content={<MoneyTooltip />} />
                <Area type="monotone" dataKey="ingresos" stroke="#f97316" strokeWidth={3} fill="url(#incomeGradient)" name="Ingresos" />
                <Area type="monotone" dataKey="cobros" stroke="#111111" strokeWidth={3} fill="url(#collectionGradient)" name="Cobros" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black">Máquinas</h3>
              <p className="text-sm text-slate-500">Estado operativo actual.</p>
            </div>
            <button onClick={() => setCurrentView('machines')} className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-600">Ver todas</button>
          </div>
          <div className="space-y-3">
            {devices.slice(0, 5).map((device) => (
              <div key={device.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{device.name}</p>
                  <p className="text-xs text-slate-500">{device.activeApp?.includes('Excel') ? 'Usando Excel' : device.os || 'Equipo registrado'}</p>
                </div>
                <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${device.status === 'online' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {device.status === 'online' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {device.status === 'online' ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            ))}
            {devices.length === 0 && <EmptyState icon={Laptop} title="Sin máquinas registradas" description="Las laptops aparecerán automáticamente cuando el programa instalado se conecte al servidor." />}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-xl">
      <p className="mb-2 text-xs font-black text-slate-500">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-sm font-bold" style={{ color: entry.color }}>{entry.name}: {formatCurrency(Number(entry.value || 0))}</p>
      ))}
    </div>
  );
}

function MachinesView({ devices, rows, onDetail }: { devices: Device[]; rows: MovementRow[]; onDetail: (deviceId: string) => void }) {
  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Resumen por máquina" title="Laptops y computadoras autorizadas" description="Actividad empresarial registrada por cada equipo conectado al sistema." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => {
          const deviceRows = rows.filter((row) => row.deviceId === device.id);
          const amount = deviceRows.reduce((sum, row) => sum + row.amount, 0);
          return (
            <Card key={device.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Laptop className="h-6 w-6" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black">{device.name}</h3>
                    <p className="text-sm text-slate-500">{device.os || 'Sistema no especificado'}</p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${device.status === 'online' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{device.status === 'online' ? 'Activa' : 'Inactiva'}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">Acciones</p><p className="text-2xl font-black">{deviceRows.length}</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">Procesado</p><p className="text-xl font-black">{formatCurrency(amount)}</p></div>
              </div>
              <p className="mt-4 text-sm text-slate-500">Última conexión: {formatDateTime(device.lastSeen)}</p>
              <button onClick={() => onDetail(device.id)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111] px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600">
                Ver detalle <ChevronRight className="h-4 w-4" />
              </button>
            </Card>
          );
        })}
      </div>
      {devices.length === 0 && <EmptyState icon={Laptop} title="Aún no hay máquinas" description="Instala o inicia el ejecutable autorizado para que cada equipo aparezca aquí." />}
    </div>
  );
}

function MachineDetailView({ device, rows, setCurrentView }: { device?: Device; rows: MovementRow[]; setCurrentView: (view: ViewId) => void }) {
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const filtered = rows.filter((row) => {
    if (device && row.deviceId !== device.id) return false;
    if (period === 'today') return isToday(row.createdAt);
    if (period === 'week') return isWithinDays(row.createdAt, 7);
    if (period === 'month') return isWithinDays(row.createdAt, 30);
    return true;
  });

  return (
    <div className="space-y-6">
      <button onClick={() => setCurrentView('machines')} className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm">← Volver a máquinas</button>
      <PageTitle eyebrow="Detalle de máquina" title={device?.name || 'Máquina no seleccionada'} description="Historial de archivos Excel usados, montos detectados y acciones registradas." />
      <FiltersBar period={period} setPeriod={setPeriod} />
      <MovementsTable rows={filtered} devices={device ? [device] : []} compact />
    </div>
  );
}

function ExcelFilesView({ rows, devices }: { rows: MovementRow[]; devices: Device[] }) {
  const files = useMemo(() => {
    const map = new Map<string, { name: string; devices: Set<string>; last: string; income: number; collections: number; changes: number; status: string }>();
    for (const row of rows) {
      const file = map.get(row.fileName) || { name: row.fileName || 'Archivo sin nombre', devices: new Set<string>(), last: row.createdAt, income: 0, collections: 0, changes: 0, status: 'Normal' };
      file.devices.add(getDeviceName(devices, row));
      file.last = new Date(row.createdAt) > new Date(file.last) ? row.createdAt : file.last;
      if (row.category === 'income') file.income += row.amount;
      if (row.category === 'collection') file.collections += row.amount;
      file.changes += 1;
      if (normalizeText(row.action).includes('elimin') || normalizeText(row.action).includes('error')) file.status = 'Revisar';
      map.set(row.fileName, file);
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());
  }, [rows, devices]);

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Monitoreo de Excel" title="Archivos detectados" description="Lista clara de archivos Excel usados, máquinas relacionadas, montos y cambios importantes." />
      <div className="grid gap-4 lg:grid-cols-2">
        {files.map((file) => (
          <Card key={file.name} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black">{file.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{Array.from(file.devices).slice(0, 2).join(', ') || 'Máquina no identificada'}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${file.status === 'Normal' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>{file.status}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Ingresos" value={formatCurrency(file.income)} />
              <MiniStat label="Cobros" value={formatCurrency(file.collections)} />
              <MiniStat label="Cambios" value={`${file.changes}`} />
              <MiniStat label="Último uso" value={formatTime(file.last)} />
            </div>
          </Card>
        ))}
      </div>
      {files.length === 0 && <EmptyState icon={FileSpreadsheet} title="Sin archivos Excel detectados" description="Cuando se abran o modifiquen archivos monitoreados, aparecerán aquí con montos y cambios." />}
    </div>
  );
}

function MovementsView({ rows, devices }: { rows: MovementRow[]; devices: Device[] }) {
  const [search, setSearch] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [fileName, setFileName] = useState('');
  const [date, setDate] = useState('');
  const files = Array.from(new Set(rows.map((row) => row.fileName).filter(Boolean)));
  const filtered = rows.filter((row) => {
    const q = normalizeText(search);
    const matchesSearch = !q || normalizeText(`${row.fileName} ${row.sheetName} ${row.action} ${row.naturalText} ${row.details}`).includes(q);
    const matchesDevice = !deviceId || row.deviceId === deviceId;
    const matchesFile = !fileName || row.fileName === fileName;
    const matchesDate = !date || row.createdAt.startsWith(date);
    return matchesSearch && matchesDevice && matchesFile && matchesDate;
  });

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Historial de movimientos" title="Todos los eventos registrados" description="Busca por máquina, fecha, archivo, acción o monto. Los importes se muestran con dos decimales exactos." />
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_200px_170px]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar archivo, acción, monto o palabra clave" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-orange-400 focus:bg-white" />
          </div>
          <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
            <option value="">Todas las máquinas</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <select value={fileName} onChange={(event) => setFileName(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
            <option value="">Todos los archivos</option>
            {files.map((file) => <option key={file} value={file}>{file}</option>)}
          </select>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400" />
        </div>
      </Card>
      <MovementsTable rows={filtered} devices={devices} />
    </div>
  );
}

function MovementsTable({ rows, devices, compact = false }: { rows: MovementRow[]; devices: Device[]; compact?: boolean }) {
  if (rows.length === 0) return <EmptyState icon={Activity} title="Sin movimientos para mostrar" description="Ajusta los filtros o espera nuevos cambios capturados desde Excel." />;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#111] text-white">
            <tr>
              <th className="px-5 py-4 font-black">Fecha y hora</th>
              <th className="px-5 py-4 font-black">Máquina</th>
              <th className="px-5 py-4 font-black">Archivo Excel</th>
              <th className="px-5 py-4 font-black">Acción</th>
              <th className="px-5 py-4 text-right font-black">Monto</th>
              {!compact && <th className="px-5 py-4 font-black">Detalle</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-orange-50/40">
                <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-600">{formatDateTime(row.createdAt)}</td>
                <td className="px-5 py-4 font-black">{getDeviceName(devices, row)}</td>
                <td className="max-w-[220px] truncate px-5 py-4 font-semibold text-slate-700">{row.fileName}</td>
                <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{row.action}</span></td>
                <td className="px-5 py-4 text-right font-black tabular-nums text-slate-950">{formatCurrency(row.amount)}</td>
                {!compact && <td className="max-w-[320px] truncate px-5 py-4 text-slate-500">{row.naturalText || row.sheetName}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReportsView({ rows, devices }: { rows: MovementRow[]; devices: Device[] }) {
  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const filtered = rows.filter((row) => range === 'daily' ? isToday(row.createdAt) : range === 'weekly' ? isWithinDays(row.createdAt, 7) : isWithinDays(row.createdAt, 30));
  const income = filtered.filter((row) => row.category === 'income').reduce((sum, row) => sum + row.amount, 0);
  const collections = filtered.filter((row) => row.category === 'collection').reduce((sum, row) => sum + row.amount, 0);
  const byMachine = devices.map((device) => ({ name: device.name, total: filtered.filter((row) => row.deviceId === device.id).reduce((sum, row) => sum + row.amount, 0) })).filter((item) => item.total > 0);

  const exportCsv = () => {
    const csv = ['Fecha,Maquina,Archivo,Accion,Monto', ...filtered.map((row) => `"${formatDateTime(row.createdAt)}","${getDeviceName(devices, row)}","${row.fileName}","${row.action}","${row.amount.toFixed(2)}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reporte-excel-${range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Reportes" title="Resumen empresarial" description="Reportes diarios, semanales y mensuales por máquina y archivo Excel." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-2xl bg-white p-1 shadow-sm">
          {[{ id: 'daily', label: 'Diario' }, { id: 'weekly', label: 'Semanal' }, { id: 'monthly', label: 'Mensual' }].map((item) => (
            <button key={item.id} onClick={() => setRange(item.id as any)} className={`rounded-xl px-4 py-2 text-sm font-black ${range === item.id ? 'bg-[#111] text-white' : 'text-slate-500'}`}>{item.label}</button>
          ))}
        </div>
        <button onClick={exportCsv} className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-orange-500/20"><Download className="h-4 w-4" /> Exportar Excel/CSV</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total ingresado" value={formatCurrency(income)} helper="Ventas e ingresos del periodo." icon={TrendingUp} />
        <KpiCard label="Total cobrado" value={formatCurrency(collections)} helper="Cobros detectados del periodo." icon={CheckCircle2} dark />
        <KpiCard label="Movimientos" value={`${filtered.length}`} helper="Eventos reales del periodo." icon={Activity} />
        <KpiCard label="Variación" value={formatCurrency(income - collections)} helper="Ingresos menos cobros clasificados." icon={BarChart3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h3 className="mb-5 text-lg font-black">Resumen por máquina</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMachine.length ? byMachine : [{ name: 'Sin datos', total: 0 }]}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip content={<MoneyTooltip />} />
                <Bar dataKey="total" fill="#f97316" radius={[10, 10, 0, 0]} name="Total" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <MovementsTable rows={filtered.slice(0, 8)} devices={devices} compact />
      </div>
    </div>
  );
}

function RemoteSupportView({ devices, socket }: { devices: Device[]; socket: Socket | null }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices.find((device) => device.status === 'online')?.id || '');
  const [sessionId, setSessionId] = useState('');
  const [frame, setFrame] = useState('');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [sessionLog, setSessionLog] = useState<string[]>([]);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);

  useEffect(() => {
    if (selectedDeviceId && devices.some((device) => device.id === selectedDeviceId)) return;
    setSelectedDeviceId(devices.find((device) => device.status === 'online')?.id || devices[0]?.id || '');
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    if (!socket) return;
    const onFrame = (data: any) => {
      if (!selectedDeviceId || data.deviceId === selectedDeviceId || data.machineId === selectedDeviceId) setFrame(data.image);
    };
    const addLog = (message: string) => setSessionLog((prev) => [message, ...prev].slice(0, 20));
    const onStarted = (data: any) => addLog(`Sesión iniciada: ${data.machineName || data.deviceId || ''}`);
    const onEnded = () => addLog('Sesión finalizada y registrada.');
    const onAccepted = () => addLog('Control remoto autorizado.');
    const onRejected = () => addLog('Control remoto rechazado o desactivado.');
    const onError = (data: any) => addLog(data.message || 'Evento de soporte no disponible.');
    socket.on('remote-support:frame', onFrame);
    socket.on('remote-support:session-started', onStarted);
    socket.on('remote-support:session-ended', onEnded);
    socket.on('remote-support:control-accepted', onAccepted);
    socket.on('remote-support:control-rejected', onRejected);
    socket.on('remote-support:session-error', onError);
    return () => {
      socket.off('remote-support:frame', onFrame);
      socket.off('remote-support:session-started', onStarted);
      socket.off('remote-support:session-ended', onEnded);
      socket.off('remote-support:control-accepted', onAccepted);
      socket.off('remote-support:control-rejected', onRejected);
      socket.off('remote-support:session-error', onError);
    };
  }, [socket, selectedDeviceId]);

  const startScreen = () => {
    if (!socket || !selectedDeviceId) return;
    const nextSessionId = `session_${Date.now()}`;
    setSessionId(nextSessionId);
    setSessionLog((prev) => ['Solicitud de visualización enviada.', ...prev]);
    socket.emit('remote-support:screen-start', { deviceId: selectedDeviceId, sessionId: nextSessionId, quality });
  };

  const requestControl = () => {
    if (!socket || !selectedDeviceId) return;
    socket.emit('remote-support:request-control', { deviceId: selectedDeviceId, sessionId, quality });
    setSessionLog((prev) => ['Solicitud de control enviada a la laptop.', ...prev]);
  };

  const endSession = () => {
    if (!socket || !selectedDeviceId) return;
    socket.emit('remote-support:end', { deviceId: selectedDeviceId, sessionId, summary: 'Sesión finalizada desde el dashboard.' });
    setFrame('');
    setSessionLog((prev) => ['Sesión finalizada.', ...prev]);
  };

  const sendMouse = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!socket || !selectedDeviceId || !frame) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    socket.emit('remote-support:mouse', { deviceId: selectedDeviceId, sessionId, type: 'click', x, y });
  };

  const sendQuickAlert = () => {
    if (!selectedDeviceId) return;
    api.post('/alerts/send', {
      machineId: selectedDeviceId,
      title: 'Mensaje de soporte',
      message: 'El administrador está disponible para brindar soporte remoto autorizado.',
      priority: 'normal',
      requiresConfirmation: true,
    }).then(() => setSessionLog((prev) => ['Alerta rápida enviada.', ...prev])).catch(() => setSessionLog((prev) => ['No se pudo enviar alerta.', ...prev]));
  };

  const requestVoice = () => {
    if (!socket || !selectedDeviceId) return;
    socket.emit('voice:request', { deviceId: selectedDeviceId, sessionId });
    setSessionLog((prev) => ['Solicitud de comunicación enviada.', ...prev]);
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Soporte remoto" title="Soporte autorizado para máquinas empresariales" description="Ver pantalla, solicitar control con permiso, enviar alertas y registrar cada sesión de soporte." />
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card className="p-5">
          <label className="mb-2 block text-sm font-black text-slate-700">Máquina autorizada</label>
          <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
            <option value="">Seleccionar máquina</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          {selectedDevice && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-black text-slate-950">{selectedDevice.name}</p>
              <p>Área: {selectedDevice.companyArea || 'No definida'}</p>
              <p>Agente: {selectedDevice.agentVersion || 'Sin versión'}</p>
              <p>Soporte: {selectedDevice.remoteSupportEnabled === false ? 'Desactivado' : 'Disponible'}</p>
            </div>
          )}
          <label className="mb-2 mt-4 block text-sm font-black text-slate-700">Calidad</label>
          <select value={quality} onChange={(event) => setQuality(event.target.value as any)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
          <div className="mt-5 grid gap-3">
            <button onClick={startScreen} className="flex items-center justify-center gap-2 rounded-2xl bg-[#111] px-4 py-3 text-sm font-black text-white"><Eye className="h-4 w-4" /> Ver pantalla</button>
            <button onClick={requestControl} className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white"><MousePointer className="h-4 w-4" /> Solicitar control</button>
            <button onClick={sendQuickAlert} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-sm"><Send className="h-4 w-4" /> Enviar alerta</button>
            <button onClick={requestVoice} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-sm"><Phone className="h-4 w-4" /> Hablar</button>
            <button onClick={endSession} className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"><Square className="h-4 w-4" /> Finalizar sesión</button>
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden bg-[#111] p-4">
            <div className="mb-3 flex items-center justify-between text-white">
              <p className="text-sm font-black">Pantalla en vivo</p>
              <p className="text-xs text-white/50">Sesión registrada · aviso visible en laptop</p>
            </div>
            <div onClick={sendMouse} className="flex aspect-video cursor-crosshair items-center justify-center overflow-hidden rounded-2xl bg-black">
              {frame ? <img src={frame} alt="Pantalla remota autorizada" className="h-full w-full object-contain" /> : <p className="text-sm font-bold text-white/45">Presiona “Ver pantalla” para iniciar soporte autorizado.</p>}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 text-lg font-black">Historial de sesión</h3>
            <div className="space-y-2">
              {sessionLog.length === 0 ? <p className="text-sm text-slate-500">Sin eventos de soporte todavía.</p> : sessionLog.map((log, index) => <p key={index} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">{log}</p>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AlertsView({ devices }: { devices: Device[] }) {
  const [machineId, setMachineId] = useState('');
  const [title, setTitle] = useState('Revisar cobros');
  const [message, setMessage] = useState('Se detectó una diferencia en el archivo de ventas. Verificar antes del cierre.');
  const [priority, setPriority] = useState('high');
  const [requiresConfirmation, setRequiresConfirmation] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);

  const loadAlerts = () => api.get('/alerts').then((res) => setAlerts(res.data || [])).catch(() => undefined);
  useEffect(() => { loadAlerts(); }, []);

  const sendAlert = () => {
    if (!machineId) return;
    api.post('/alerts/send', { machineId, title, message, priority, requiresConfirmation })
      .then(() => { loadAlerts(); })
      .catch(() => undefined);
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Alertas" title="Mensajes empresariales a máquinas" description="Envía alertas visibles, solicita confirmación y revisa el estado de cada mensaje." />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="space-y-4 p-5">
          <select value={machineId} onChange={(event) => setMachineId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
            <option value="">Máquina destino</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
          </select>
          <FormField label="Título" value={title} onChange={setTitle} placeholder="Ej. Revisar cobros" />
          <div>
            <label className="mb-2 block text-sm font-black text-slate-700">Mensaje</label>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400" />
          </div>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
            <option value="normal">Información</option>
            <option value="warning">Advertencia</option>
            <option value="high">Urgente</option>
          </select>
          <label className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 text-sm font-black text-slate-700">
            Requiere confirmación
            <input type="checkbox" checked={requiresConfirmation} onChange={(event) => setRequiresConfirmation(event.target.checked)} className="h-5 w-5 accent-orange-500" />
          </label>
          <button onClick={sendAlert} className="w-full rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white">Enviar alerta</button>
        </Card>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#111] text-white"><tr><th className="px-5 py-4">Fecha</th><th>Máquina</th><th>Título</th><th>Prioridad</th><th>Estado</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {alerts.map((alert) => <tr key={alert.alertId}><td className="px-5 py-4">{formatDateTime(alert.timestamp)}</td><td>{devices.find((d) => d.id === alert.machineId)?.name || alert.machineId}</td><td>{alert.title}</td><td>{alert.priority}</td><td><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{alert.status}</span></td></tr>)}
                {alerts.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Sin alertas enviadas.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingsView() {
  const [machineName, setMachineName] = useState(localStorage.getItem('defaultMachineName') || '');
  const [folders, setFolders] = useState(localStorage.getItem('allowedExcelFolders') || '');
  const [monitoring, setMonitoring] = useState(localStorage.getItem('excelMonitoringEnabled') !== 'false');
  const [decimals, setDecimals] = useState(localStorage.getItem('currencyDecimals') || '2');
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem('defaultMachineName', machineName);
    localStorage.setItem('allowedExcelFolders', folders);
    localStorage.setItem('excelMonitoringEnabled', String(monitoring));
    localStorage.setItem('currencyDecimals', decimals);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Configuración simple" title="Ajustes de monitoreo Excel" description="Opciones claras para registrar máquinas, carpetas permitidas, moneda y estado del monitoreo." />
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card className="space-y-5 p-5 sm:p-6">
          <FormField label="Nombre visible de máquina" value={machineName} onChange={setMachineName} placeholder="Ej. Laptop Caja 01" />
          <div>
            <label className="mb-2 block text-sm font-black text-slate-700">Carpetas permitidas para archivos Excel</label>
            <textarea value={folders} onChange={(event) => setFolders(event.target.value)} placeholder={`C:\\Empresa\\Ventas\nD:\\Reportes\\Cobros`} className="min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400 focus:bg-white" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="font-black text-slate-700">Monitoreo activo</span>
              <input type="checkbox" checked={monitoring} onChange={(event) => setMonitoring(event.target.checked)} className="h-5 w-5 accent-orange-500" />
            </label>
            <div>
              <label className="mb-2 block text-sm font-black text-slate-700">Decimales de moneda</label>
              <select value={decimals} onChange={(event) => setDecimals(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400">
                <option value="2">2 decimales</option>
                <option value="3">3 decimales</option>
                <option value="4">4 decimales</option>
              </select>
            </div>
          </div>
          <button onClick={save} className="w-full rounded-2xl bg-[#111] px-5 py-4 text-sm font-black text-white transition hover:bg-orange-600">Guardar configuración</button>
          {saved && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">Configuración guardada localmente.</p>}
        </Card>
        <Card className="p-5 sm:p-6">
          <h3 className="text-lg font-black">Acceso simple y seguro recomendado</h3>
          <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
            <p><strong className="text-slate-950">Sin usuario y contraseña:</strong> usa un enlace interno con token, VPN o red privada de la empresa.</p>
            <p><strong className="text-slate-950">Token interno:</strong> configura `DASHBOARD_ACCESS_TOKEN` en el servidor y abre el panel con `?token=...`.</p>
            <p><strong className="text-slate-950">Máquinas autorizadas:</strong> el ejecutable debe conservar `AGENT_SECRET` y lista de carpetas Excel permitidas.</p>
            <p><strong className="text-slate-950">Auditoría, no vigilancia:</strong> muestra archivos, montos, acciones y fechas; evita controles invasivos en la interfaz del dueño.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-orange-600"><span className="h-2 w-2 rounded-full bg-orange-500" />{eyebrow}</p>
      <h2 className="text-2xl font-black tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">{description}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p></div>;
}

function FiltersBar({ period, setPeriod }: { period: PeriodFilter; setPeriod: (period: PeriodFilter) => void }) {
  return (
    <Card className="p-3">
      <div className="flex flex-wrap gap-2">
        {[{ id: 'today', label: 'Hoy' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }, { id: 'custom', label: 'Todo' }].map((item) => (
          <button key={item.id} onClick={() => setPeriod(item.id as PeriodFilter)} className={`rounded-2xl px-4 py-2 text-sm font-black ${period === item.id ? 'bg-[#111] text-white' : 'bg-slate-50 text-slate-500'}`}>{item.label}</button>
        ))}
      </div>
    </Card>
  );
}

function FormField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-slate-700">{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400 focus:bg-white" />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#111] text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
        <p className="text-lg font-black">Conectando panel empresarial</p>
        <p className="mt-2 text-sm text-white/50">Buscando servidor y datos de Excel...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { addToast } = useToast();
  const [currentView, setCurrentView] = useState<ViewId>('dashboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<ExcelAuditLog[]>([]);
  const [dashboardSocket, setDashboardSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [isResolving, setIsResolving] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const notifiedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const loadInitialData = async () => {
      try {
        const [devicesRes, logsRes] = await Promise.all([
          api.get('/devices').catch(() => ({ data: [] })),
          api.get('/excel-logs?limit=500').catch(() => ({ data: [] })),
        ]);
        if (!active) return;
        setDevices(devicesRes.data || []);
        setLogs(logsRes.data || []);
      } finally {
        if (active) setIsResolving(false);
      }
    };
    loadInitialData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    let active = true;
    const connect = async () => {
      try {
        const serverUrl = await getBestServerUrl();
        if (!active) return;
        const panelToken = getPanelToken();
        socket = io(`${serverUrl}/dashboard`, {
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          transports: ['websocket', 'polling'],
          auth: { token: panelToken || localStorage.getItem('accessToken') || '' },
          query: panelToken ? { token: panelToken } : undefined,
        });
        setDashboardSocket(socket);
        socket.on('connect', () => {
          setSocketConnected(true);
          if (!notifiedRef.current) {
            addToast({ type: 'success', title: 'Panel conectado', message: 'Recibiendo actividad de Excel en tiempo real' });
            notifiedRef.current = true;
          }
        });
        socket.on('disconnect', () => setSocketConnected(false));
        socket.on('devices-update', (updatedDevices: Device[]) => setDevices(updatedDevices || []));
        socket.on('excel-audit-log', (log: ExcelAuditLog) => setLogs((prev) => [log, ...prev.filter((item) => item.id !== log.id)].slice(0, 1000)));
      } catch {
        setSocketConnected(false);
      }
    };
    connect();
    return () => {
      active = false;
      socket?.close();
      setDashboardSocket(null);
    };
  }, [addToast]);

  const rows = useMemo(() => buildRows(logs).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [logs]);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);

  const openDetail = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setCurrentView('machine-detail');
  };

  if (isResolving) return <LoadingScreen />;

  const view = (() => {
    if (currentView === 'dashboard') return <DashboardView rows={rows} devices={devices} setCurrentView={setCurrentView} />;
    if (currentView === 'machines') return <MachinesView rows={rows} devices={devices} onDetail={openDetail} />;
    if (currentView === 'machine-detail') return <MachineDetailView device={selectedDevice} rows={rows} setCurrentView={setCurrentView} />;
    if (currentView === 'excel') return <ExcelFilesView rows={rows} devices={devices} />;
    if (currentView === 'movements') return <MovementsView rows={rows} devices={devices} />;
    if (currentView === 'reports') return <ReportsView rows={rows} devices={devices} />;
    if (currentView === 'remote-support') return <RemoteSupportView devices={devices} socket={dashboardSocket} />;
    if (currentView === 'alerts') return <AlertsView devices={devices} />;
    return <SettingsView />;
  })();

  return (
    <Shell currentView={currentView} setCurrentView={setCurrentView} socketConnected={socketConnected} devices={devices}>
      {view}
      <PWAInstallBanner />
    </Shell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
