import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Banknote, Bell, Database, FileSpreadsheet, Laptop, Server, ShoppingCart, TrendingDown, TrendingUp } from 'lucide-react';
import { CategoryChart, DocumentsStatusChart, IncomeExpenseChart, MonthlyResultChart } from '../../components/enterprise/EnterpriseCharts';
import { EmptyState, LoadingState, MetricCard, PageHeader, SelectInput, StatusBadge, SyncStatus, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { RecentActivity } from '../../components/enterprise/RecentActivity';
import { enterpriseApi, formatMoney, numberValue } from '../../services/enterpriseApi';
import type { DriveChange, DriveDocument, DriveStatus, EnterpriseNotification, FinancialRecord, FinanceGroup, FinanceSummary, HealthStatus, PeriodKey } from '../../services/enterpriseApi';
import type { TrendPoint } from '../../components/enterprise/EnterpriseCharts';

interface DashboardState {
  health: HealthStatus | null;
  summary: FinanceSummary | null;
  status: DriveStatus | null;
  incomes: FinancialRecord[];
  expenses: FinancialRecord[];
  purchases: FinancialRecord[];
  categories: FinanceGroup[];
  documents: DriveDocument[];
  changes: DriveChange[];
  notifications: EnterpriseNotification[];
}

interface DashboardDevice {
  id: string;
  name: string;
  os?: string;
  status: 'online' | 'offline';
  lastSeen: number;
  activeApp?: string;
}

interface DashboardAgentEvent {
  id: string;
  deviceId: string;
  deviceName?: string;
  fileName?: string;
  sheetName?: string;
  action?: string;
  naturalText?: string;
  createdAt: string;
}

function groupByDay(incomes: FinancialRecord[], expenses: FinancialRecord[]): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  const add = (record: FinancialRecord, key: 'income' | 'expense') => {
    const date = record.date ? new Date(record.date) : null;
    if (!date || Number.isNaN(date.getTime())) return;
    const label = date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    const current = map.get(label) || { label, income: 0, expense: 0, balance: 0 };
    current[key] = Number(current[key] || 0) + numberValue(record.amount);
    current.balance = Number(current.income || 0) - Number(current.expense || 0);
    map.set(label, current);
  };
  incomes.forEach((record) => add(record, 'income'));
  expenses.forEach((record) => add(record, 'expense'));
  return Array.from(map.values()).slice(-30);
}

function documentsStatus(documents: DriveDocument[]) {
  return [
    { name: 'Actualizados', value: documents.filter((document) => /ACTUALIZADO|CON_CAMBIOS/i.test(document.status || '')).length },
    { name: 'Sin cambios', value: documents.filter((document) => /SIN_CAMBIOS/i.test(document.status || '')).length },
    { name: 'Errores', value: documents.filter((document) => /ERROR|SIN_ACCESO|NO_DISPONIBLE/i.test(document.status || '')).length },
    { name: 'Pendientes', value: documents.filter((document) => /PENDIENTE|SINCRONIZANDO/i.test(document.status || '')).length },
  ];
}

export function DashboardPage({ onNavigate, devices = [], agentEvents = [] }: { onNavigate: (view: string) => void; devices?: DashboardDevice[]; agentEvents?: DashboardAgentEvent[] }) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [state, setState] = useState<DashboardState>({ health: null, summary: null, status: null, incomes: [], expenses: [], purchases: [], categories: [], documents: [], changes: [], notifications: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return Promise.allSettled([
      enterpriseApi.getHealth(signal),
      enterpriseApi.getFinanceSummary(signal),
      enterpriseApi.getDriveStatus(signal),
      enterpriseApi.getFinanceRecords('incomes', { pageSize: 200 }, signal),
      enterpriseApi.getFinanceRecords('expenses', { pageSize: 200 }, signal),
      enterpriseApi.getFinanceRecords('purchases', { pageSize: 100 }, signal),
      enterpriseApi.getCategories(signal),
      enterpriseApi.getDriveDocuments({ pageSize: 100 }, signal),
      enterpriseApi.getDriveChanges({ pageSize: 30 }, signal),
      enterpriseApi.getNotifications(signal),
    ]).then((results) => {
      if (results.some((result) => result.status === 'rejected' && (result.reason?.name === 'CanceledError' || result.reason?.code === 'ERR_CANCELED'))) return;
      const [health, summary, status, incomes, expenses, purchases, categories, documents, changes, notifications] = results;
      setState({
        health: health.status === 'fulfilled' ? health.value : null,
        summary: summary.status === 'fulfilled' ? summary.value : null,
        status: status.status === 'fulfilled' ? status.value : null,
        incomes: incomes.status === 'fulfilled' ? incomes.value.rows : [],
        expenses: expenses.status === 'fulfilled' ? expenses.value.rows : [],
        purchases: purchases.status === 'fulfilled' ? purchases.value.rows : [],
        categories: categories.status === 'fulfilled' ? categories.value : [],
        documents: documents.status === 'fulfilled' ? documents.value.rows : [],
        changes: changes.status === 'fulfilled' ? changes.value.rows : [],
        notifications: notifications.status === 'fulfilled' ? notifications.value : [],
      });
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const id = window.setInterval(() => load(controller.signal), 120000);
    return () => { controller.abort(); window.clearInterval(id); };
  }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await enterpriseApi.syncDrive();
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const chartData = useMemo(() => groupByDay(state.incomes, state.expenses), [state.incomes, state.expenses]);
  const hasTodayData = Number(state.summary?.today?.incomeCount || 0) + Number(state.summary?.today?.expenseCount || 0) > 0;
  const importantAlerts = state.notifications.filter((item) => /high|critical|error|importante|critica/i.test(`${item.priority} ${item.type}`));
  const onlineDevices = devices.filter((device) => device.status === 'online');
  const recentAgentEvents = [...agentEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);
  const dbConnected = state.health?.db === 'connected';
  const driveReady = Boolean(state.status?.lastSyncAt || state.documents.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Resumen ejecutivo" description="Visión general de la actividad financiera y documental de la empresa.">
        <SelectInput value={period} onChange={(value) => setPeriod(value as PeriodKey)} options={[{ value: 'today', label: 'Hoy' }, { value: 'week', label: '7 días' }, { value: 'month', label: 'Este mes' }, { value: 'year', label: 'Este año' }]} />
        <SyncStatus status={state.status || undefined} onSync={syncNow} syncing={syncing} />
      </PageHeader>

      {loading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard title="Ingresos de hoy" value={formatMoney(state.summary?.today?.income)} helper={`${state.summary?.today?.incomeCount || 0} operaciones registradas`} icon={TrendingUp} tone="green" empty={!hasTodayData && numberValue(state.summary?.today?.income) === 0} />
            <MetricCard title="Egresos de hoy" value={formatMoney(state.summary?.today?.expense)} helper={`${state.summary?.today?.expenseCount || 0} gastos registrados`} icon={TrendingDown} tone="red" empty={!hasTodayData && numberValue(state.summary?.today?.expense) === 0} />
            <MetricCard title="Saldo neto" value={formatMoney(state.summary?.today?.net)} helper={numberValue(state.summary?.today?.net) >= 0 ? 'Resultado positivo o sin movimientos' : 'Resultado negativo'} icon={Banknote} tone={numberValue(state.summary?.today?.net) >= 0 ? 'teal' : 'red'} empty={!hasTodayData} />
            <MetricCard title="Compras pendientes" value={formatMoney(state.summary?.purchases?.committed)} helper={`${state.summary?.purchases?.pendingCount || 0} compras pendientes`} icon={ShoppingCart} tone="amber" empty={!state.summary?.purchases?.pendingCount} />
            <MetricCard title="Cambios detectados" value={`${state.summary?.changes?.totalRecent || 0}`} helper={`${state.changes.filter((change) => !change.reviewStatus || /pendiente|unreviewed/i.test(change.reviewStatus)).length} sin revisar`} icon={Activity} tone="blue" empty={!state.summary?.changes?.totalRecent} />
            <MetricCard title="Alertas" value={`${importantAlerts.length || state.summary?.alerts?.important || 0}`} helper={state.summary?.alerts?.negativeBalance ? 'Saldo negativo detectado' : 'Alertas importantes'} icon={Bell} tone="amber" empty={!importantAlerts.length && !state.summary?.alerts?.important} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#0F172A]">Centro de operaciones</h2>
                  <p className="mt-1 text-sm text-[#64748B]">Estado real del sistema y lo que falta para activar los datos empresariales.</p>
                </div>
                <ToolbarButton onClick={() => load()} tone="secondary">Actualizar estado</ToolbarButton>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatusTile icon={Server} title="Servidor" value={state.health?.status === 'OK' ? 'Operativo' : 'Operativo con observaciones'} status={state.health?.status === 'OK' ? 'OK' : 'Revisar'} />
                <StatusTile icon={Database} title="Base de datos" value={dbConnected ? 'Conectada' : 'Revisar DATABASE_URL'} status={dbConnected ? 'OK' : 'Pendiente'} />
                <StatusTile icon={FileSpreadsheet} title="Google Drive" value={driveReady ? 'Con datos' : 'Sin sincronizar'} status={driveReady ? 'OK' : 'Pendiente'} />
                <StatusTile icon={Laptop} title="Agentes" value={`${onlineDevices.length}/${devices.length || 0} activos`} status={onlineDevices.length ? 'OK' : 'Pendiente'} />
              </div>
              <div className="mt-5 rounded-xl bg-[#F8FAFC] p-4">
                <p className="font-semibold text-[#0F172A]">Siguiente acción recomendada</p>
                <p className="mt-1 text-sm leading-6 text-[#64748B]">
                  {!dbConnected ? 'Corrige DATABASE_URL o DIRECT_URL en Render para activar finanzas, documentos, reportes y cambios reales.' : !driveReady ? 'Ejecuta Sincronizar ahora para procesar documentos empresariales autorizados.' : 'El sistema está listo para operar con datos empresariales reales.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ToolbarButton onClick={syncNow} disabled={syncing}>Sincronizar Drive</ToolbarButton>
                  <ToolbarButton tone="secondary" onClick={() => onNavigate('drive-enterprise')}>Configurar documentos</ToolbarButton>
                  <ToolbarButton tone="secondary" onClick={() => onNavigate('machines')}>Ver equipos</ToolbarButton>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-[#0F172A]">Actividad de agentes</h2>
              <p className="mt-1 text-sm text-[#64748B]">Eventos reales enviados por equipos autorizados.</p>
              <div className="mt-4 space-y-3">
                {recentAgentEvents.length ? recentAgentEvents.map((event) => (
                  <div key={event.id} className="rounded-xl bg-[#F8FAFC] p-3">
                    <p className="truncate text-sm font-semibold text-[#0F172A]">{event.naturalText || event.action || 'Actividad registrada'}</p>
                    <p className="mt-1 truncate text-xs text-[#64748B]">{event.deviceName || devices.find((device) => device.id === event.deviceId)?.name || 'Equipo'} · {event.fileName || 'Sin archivo'} · {new Date(event.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )) : (
                  <div className="rounded-xl bg-[#F8FAFC] p-4 text-sm text-[#64748B]">Sin eventos recientes. Cuando el agente envíe actividad, aparecerá aquí.</div>
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <IncomeExpenseChart data={chartData} />
            <CategoryChart data={state.categories.map((item) => ({ name: item.name, value: numberValue(item.expense) }))} />
            <DocumentsStatusChart data={documentsStatus(state.documents)} />
            <MonthlyResultChart data={[{ label: 'Mes actual', income: numberValue(state.summary?.month?.income), expense: numberValue(state.summary?.month?.expense), balance: numberValue(state.summary?.month?.net) }]} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <RecentActivity changes={state.changes} notifications={state.notifications} onViewAll={() => onNavigate('changes')} />
            {importantAlerts.length ? (
              <div className="rounded-2xl border border-[#FDE68A] bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-[#0F172A]">Alertas importantes</h2>
                <div className="mt-4 space-y-3">{importantAlerts.slice(0, 5).map((alert) => <div key={alert.id} className="rounded-xl bg-[#FFFBEB] p-4"><p className="font-semibold text-[#92400E]">{alert.title || 'Alerta empresarial'}</p><p className="mt-1 text-sm text-[#92400E]">{alert.message || 'Requiere revisión.'}</p></div>)}</div>
                <ToolbarButton tone="secondary" onClick={() => onNavigate('alerts')}><AlertTriangle className="h-4 w-4" /> Revisar alertas</ToolbarButton>
              </div>
            ) : <EmptyState icon={Bell} title="Sin alertas importantes" description="No hay alertas críticas o importantes pendientes en este momento." />}
          </div>

          {state.documents.length > 0 && <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-[#0F172A]">Documentos recientes</h2><ToolbarButton tone="secondary" onClick={() => onNavigate('drive-enterprise')}><FileSpreadsheet className="h-4 w-4" /> Ver Drive</ToolbarButton></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{state.documents.slice(0, 6).map((document) => <div key={document.id} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"><p className="truncate font-semibold text-[#0F172A]">{document.name || document.googleFileId}</p><p className="mt-1 text-sm text-[#64748B]">{document.sheets?.length || 0} hojas · {document.status || 'Pendiente'}</p></div>)}</div></div>}
        </>
      )}
    </div>
  );
}

function StatusTile({ icon: Icon, title, value, status }: { icon: typeof Server; title: string; value: string; status: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]"><Icon className="h-4 w-4" /></div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">{title}</p>
      <p className="mt-1 text-sm font-semibold text-[#0F172A]">{value}</p>
    </div>
  );
}
