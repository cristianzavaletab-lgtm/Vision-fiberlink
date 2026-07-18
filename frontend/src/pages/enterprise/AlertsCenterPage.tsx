import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, Info } from 'lucide-react';
import { DataTable, EmptyState, FilterBar, LoadingState, MetricCard, PageHeader, SearchInput, SelectInput, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { enterpriseApi, formatDateTime, formatMoney } from '../../services/enterpriseApi';
import type { EnterpriseNotification } from '../../services/enterpriseApi';

function priorityLabel(priority?: string) {
  if (/critical|critica|error/i.test(priority || '')) return 'Crítica';
  if (/high|importante|warning/i.test(priority || '')) return 'Importante';
  if (/info|low/i.test(priority || '')) return 'Informativa';
  return priority || 'Informativa';
}

function alertPriority(alert: EnterpriseNotification) {
  return alert.priority || alert.importance;
}

export function AlertsCenterPage() {
  const [alerts, setAlerts] = useState<EnterpriseNotification[]>([]);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback((signal?: AbortSignal) => {
    return enterpriseApi.getNotifications(signal)
      .then(setAlerts)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => alerts.filter((alert) => {
    const matchesSearch = !search || `${alert.title} ${alert.message} ${alert.type}`.toLowerCase().includes(search.toLowerCase());
    const matchesPriority = !priority || priorityLabel(alertPriority(alert)).toLowerCase() === priority.toLowerCase();
    return matchesSearch && matchesPriority;
  }), [alerts, search, priority]);

  const markRead = async (id: string) => {
    await enterpriseApi.markNotificationRead(id).catch(() => undefined);
    await load();
  };

  const critical = alerts.filter((alert) => priorityLabel(alertPriority(alert)) === 'Crítica').length;
  const important = alerts.filter((alert) => priorityLabel(alertPriority(alert)) === 'Importante').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Alertas" description="Centro profesional de alertas críticas, importantes, informativas y errores técnicos." />
      {loading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Críticas" value={`${critical}`} helper="Atención inmediata" icon={AlertTriangle} tone="red" empty={!critical} />
            <MetricCard title="Importantes" value={`${important}`} helper="Revisar pronto" icon={Bell} tone="amber" empty={!important} />
            <MetricCard title="Informativas" value={`${alerts.filter((alert) => priorityLabel(alertPriority(alert)) === 'Informativa').length}`} helper="Eventos registrados" icon={Info} tone="blue" empty={!alerts.length} />
            <MetricCard title="Sin leer" value={`${alerts.filter((alert) => !alert.read).length}`} helper="Pendientes de revisión" icon={CheckCircle2} tone="teal" empty={!alerts.some((alert) => !alert.read)} />
          </div>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar alerta, documento o explicación" />
            <SelectInput value={priority} onChange={setPriority} options={[{ value: '', label: 'Todas las prioridades' }, { value: 'Crítica', label: 'Críticas' }, { value: 'Importante', label: 'Importantes' }, { value: 'Informativa', label: 'Informativas' }]} />
          </FilterBar>
          <DataTable
            columns={['Título', 'Explicación', 'Fecha', 'Documento', 'Monto relacionado', 'Estado', 'Acción recomendada', 'Acciones']}
            rows={filtered.map((alert) => (
              <tr key={alert.id} className="hover:bg-[#F8FAFC]"><td className="max-w-[220px] px-4 py-4 font-semibold text-[#0F172A]">{alert.title || 'Alerta empresarial'}</td><td className="max-w-[360px] px-4 py-4 text-[#64748B]">{alert.message || 'Sin explicación adicional.'}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(alert.createdAt)}</td><td className="px-4 py-4 text-[#64748B]">{alert.documentId || 'No asociado'}</td><td className="px-4 py-4 text-[#64748B]">{alert.amount ? formatMoney(alert.amount) : 'No aplica'}</td><td className="px-4 py-4"><StatusBadge status={alert.read ? 'Revisada' : priorityLabel(alertPriority(alert))} /></td><td className="px-4 py-4 text-[#64748B]">{alert.read ? 'Sin acción pendiente' : 'Revisar detalle y documento relacionado'}</td><td className="px-4 py-4"><ToolbarButton tone="secondary" disabled={alert.read} onClick={() => markRead(alert.id)}>{alert.read ? 'Revisada' : 'Marcar revisada'}</ToolbarButton></td></tr>
            ))}
            empty={<EmptyState icon={Bell} title="Sin alertas para mostrar" description="No hay alertas empresariales que coincidan con los filtros seleccionados." />}
          />
        </>
      )}
    </div>
  );
}
