import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, WifiOff } from 'lucide-react';
import { formatRelative } from '../../services/enterpriseApi';

export function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[#E2E8F0] bg-white shadow-sm ${className}`}>{children}</section>;
}

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#E2E8F0] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2563EB]">VisionControl</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">{description}</p>
        <p className="mt-2 text-xs font-medium text-[#64748B]">{new Date().toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
  empty,
  emptyLabel = 'Sin datos',
  emptyValue = 'Aún no hay movimientos',
}: {
  title: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'teal' | 'green' | 'red' | 'amber' | 'slate';
  empty?: boolean;
  emptyLabel?: string;
  emptyValue?: string;
}) {
  const tones = {
    blue: 'bg-[#EFF6FF] text-[#2563EB]',
    teal: 'bg-[#ECFDF5] text-[#0F766E]',
    green: 'bg-[#F0FDF4] text-[#16A34A]',
    red: 'bg-[#FEF2F2] text-[#DC2626]',
    amber: 'bg-[#FFFBEB] text-[#F59E0B]',
    slate: 'bg-[#F1F5F9] text-[#475569]',
  };
  return (
    <SectionCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        {empty && <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">{emptyLabel}</span>}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">{title}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${empty ? 'text-[#94A3B8]' : 'text-[#0F172A]'}`}>{empty ? emptyValue : value}</p>
      {helper && <p className="mt-2 text-sm leading-5 text-[#64748B]">{helper}</p>}
    </SectionCard>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = (status || 'pendiente').toLowerCase();
  const styles = normalized.includes('error')
    ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
    : normalized.includes('cambio') || normalized.includes('warning') || normalized.includes('pendiente')
      ? 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]'
      : normalized.includes('sin acceso') || normalized.includes('no disponible')
        ? 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
        : normalized.includes('actualizado') || normalized.includes('ok') || normalized.includes('conectado')
          ? 'bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]'
          : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]';
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>{status || 'Pendiente'}</span>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#2563EB] shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[#0F172A]">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-[#64748B]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Cargando información empresarial...' }: { label?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="h-32 animate-pulse rounded-2xl border border-[#E2E8F0] bg-white p-4">
          <div className="h-8 w-8 rounded-xl bg-[#E2E8F0]" />
          <div className="mt-5 h-3 w-28 rounded bg-[#E2E8F0]" />
          <div className="mt-3 h-7 w-36 rounded bg-[#E2E8F0]" />
        </div>
      ))}
      <p className="sr-only">{label}</p>
    </div>
  );
}

export function ErrorState({ title = 'No fue posible obtener los datos', description = 'Revisa la conexión del servidor e intenta nuevamente.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-[#7F1D1D]">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#991B1B]">{description}</p>
        </div>
        {onRetry && <button onClick={onRetry} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#991B1B] shadow-sm">Reintentar</button>}
      </div>
    </div>
  );
}

export function ToolbarButton({ children, onClick, disabled = false, tone = 'primary' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'primary' | 'secondary' | 'danger' }) {
  const styles = tone === 'primary' ? 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]' : tone === 'danger' ? 'bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2]' : 'bg-white text-[#0F172A] border border-[#E2E8F0] hover:bg-[#F8FAFC]';
  return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}>{children}</button>;
}

export function SyncStatus({ status, onSync, syncing }: { status?: { lastSyncAt?: string | null; running?: boolean; errors?: number; filesFound?: number; documents?: unknown[] }; onSync?: () => void; syncing?: boolean }) {
  const hasError = Number(status?.errors || 0) > 0;
  const hasConfiguredDrive = Number(status?.filesFound || 0) > 0 || Boolean(status?.documents?.length);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={hasError ? 'Revisar' : status?.lastSyncAt ? 'Drive conectado' : hasConfiguredDrive ? 'Drive configurado' : 'Pendiente'} />
      <span className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#64748B]">Última sincronización: {formatRelative(status?.lastSyncAt)}</span>
      <ToolbarButton onClick={onSync} disabled={!onSync || syncing || status?.running}>
        {syncing || status?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {syncing || status?.running ? 'Sincronizando' : 'Sincronizar ahora'}
      </ToolbarButton>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <SectionCard className="p-3"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div></SectionCard>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-[#E2E8F0] bg-white py-2.5 pl-9 pr-3 text-sm text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10" />
    </label>
  );
}

export function SelectInput({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold text-[#64748B]">{label}</span>}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm font-medium text-[#0F172A] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function DataTable({ columns, rows, empty }: { columns: string[]; rows: ReactNode[]; empty: ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <SectionCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-[0.08em] text-[#64748B]">
            <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-semibold">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] bg-white">{rows}</tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function InlineAlert({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div><p className="font-semibold">{title}</p><p className="mt-1 leading-6">{description}</p></div>
      </div>
    </div>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return <div className="inline-flex items-center gap-2 rounded-xl bg-[#F0FDF4] px-3 py-2 text-sm font-semibold text-[#166534]"><CheckCircle2 className="h-4 w-4" />{children}</div>;
}
