import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { DataTable, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, PageHeader, SearchInput, SelectInput, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { enterpriseApi, formatDateTime, formatMoney, numberValue } from '../../services/enterpriseApi';
import type { FinancialRecord } from '../../services/enterpriseApi';

export function RecordsPage({ type }: { type: 'incomes' | 'expenses' | 'purchases' }) {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const meta = {
    incomes: { title: 'Ingresos', description: 'Movimientos de entrada detectados desde documentos sincronizados.', icon: TrendingUp, tone: 'green' as const, empty: 'No se encontraron ingresos para este periodo.' },
    expenses: { title: 'Gastos y egresos', description: 'Salidas de dinero, gastos operativos y egresos clasificados.', icon: TrendingDown, tone: 'red' as const, empty: 'No se encontraron egresos para este periodo.' },
    purchases: { title: 'Compras', description: 'Compras realizadas, pendientes, programadas o por aprobar.', icon: FileText, tone: 'amber' as const, empty: 'No se encontraron compras en los documentos analizados.' },
  }[type];

  const load = useCallback((signal?: AbortSignal) => {
    setError(false);
    return enterpriseApi.getFinanceRecords(type, { search: search || undefined, status: status || undefined, pageSize: 100 }, signal)
      .then((response) => setRecords(response.rows))
      .catch((requestError) => { if (requestError?.name !== 'CanceledError') setError(true); })
      .finally(() => setLoading(false));
  }, [search, status, type]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const stats = useMemo(() => {
    const total = records.reduce((sum, record) => sum + numberValue(record.amount), 0);
    return {
      total,
      count: records.length,
      average: records.length ? total / records.length : 0,
      max: Math.max(0, ...records.map((record) => numberValue(record.amount))),
      uncategorized: records.filter((record) => !record.category || /sin/i.test(record.category)).length,
      pending: records.filter((record) => /PENDIENTE|PROGRAMADO|SOLICITADO|POR APROBAR/i.test(record.status || '')).length,
    };
  }, [records]);

  const exportCsv = () => {
    const csv = ['Fecha,Descripcion,Categoria,Proveedor,Cliente,Documento,Hoja,Monto,Estado', ...records.map((record) => [`"${formatDateTime(record.date)}"`, `"${record.description || ''}"`, `"${record.category || ''}"`, `"${record.provider || ''}"`, `"${record.customer || ''}"`, `"${record.document?.name || ''}"`, `"${record.sheet?.name || ''}"`, `"${numberValue(record.amount).toFixed(2)}"`, `"${record.status || ''}"`].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={meta.title} description={meta.description}>
        <ToolbarButton onClick={exportCsv} disabled={!records.length} tone="secondary"><Download className="h-4 w-4" /> Exportar CSV</ToolbarButton>
      </PageHeader>
      {loading ? <LoadingState /> : error ? <ErrorState onRetry={() => load()} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title={type === 'incomes' ? 'Total ingresado' : type === 'expenses' ? 'Total egresado' : 'Total compras'} value={formatMoney(stats.total)} helper={`${stats.count} registros`} icon={meta.icon} tone={meta.tone} empty={!stats.count} />
            <MetricCard title="Número de movimientos" value={`${stats.count}`} helper="Registros activos" icon={FileText} tone="blue" empty={!stats.count} />
            <MetricCard title={type === 'purchases' ? 'Dinero comprometido' : 'Promedio'} value={formatMoney(type === 'purchases' ? stats.total : stats.average)} helper={type === 'purchases' ? `${stats.pending} pendientes` : 'Total entre registros'} icon={meta.icon} tone="teal" empty={!stats.count} />
            <MetricCard title={type === 'expenses' ? 'Gastos sin categoría' : type === 'purchases' ? 'Compras pendientes' : 'Mayor ingreso'} value={type === 'expenses' ? `${stats.uncategorized}` : type === 'purchases' ? `${stats.pending}` : formatMoney(stats.max)} helper={type === 'expenses' ? 'Requieren clasificación' : 'Dato real del filtro'} icon={Search} tone="amber" empty={!stats.count} />
          </div>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar descripción, cliente, proveedor o categoría" />
            <SelectInput value={status} onChange={setStatus} options={[{ value: '', label: 'Todos los estados' }, { value: 'PENDIENTE', label: 'Pendiente' }, { value: 'PAGADO', label: 'Pagado' }, { value: 'APROBADO', label: 'Aprobado' }, { value: 'OBSERVADO', label: 'Observado' }]} />
            <ToolbarButton onClick={() => load()}><Search className="h-4 w-4" /> Filtrar</ToolbarButton>
          </FilterBar>
          <DataTable
            columns={type === 'purchases' ? ['Producto', 'Cantidad', 'Proveedor', 'Costo unitario', 'Costo total', 'Fecha', 'Responsable', 'Prioridad', 'Estado', 'Documento'] : ['Fecha', 'Descripción', type === 'incomes' ? 'Cliente' : 'Proveedor', 'Servicio/Categoría', 'Método de pago', 'Responsable', 'Documento', 'Hoja', 'Monto', 'Estado', 'Acciones']}
            rows={records.map((record) => type === 'purchases' ? (
              <tr key={record.id} className="hover:bg-[#F8FAFC]"><td className="max-w-[260px] px-4 py-4 font-semibold text-[#0F172A]">{record.description || 'Compra sin descripción'}</td><td className="px-4 py-4 text-[#64748B]">{record.quantity || 'Sin dato'}</td><td className="px-4 py-4 text-[#64748B]">{record.provider || 'No disponible'}</td><td className="px-4 py-4 text-[#64748B]">{record.unitCost ? formatMoney(record.unitCost) : 'Sin dato'}</td><td className="px-4 py-4 font-semibold text-[#0F172A]">{formatMoney(record.amount)}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(record.date)}</td><td className="px-4 py-4 text-[#64748B]">{record.responsible || 'No asignado'}</td><td className="px-4 py-4 text-[#64748B]">{record.priority || 'Normal'}</td><td className="px-4 py-4"><StatusBadge status={record.status} /></td><td className="px-4 py-4">{record.document?.url ? <a href={record.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#2563EB]"><ExternalLink className="h-4 w-4" />Abrir</a> : 'Sin enlace'}</td></tr>
            ) : (
              <tr key={record.id} className="hover:bg-[#F8FAFC]"><td className="px-4 py-4 text-[#64748B]">{formatDateTime(record.date)}</td><td className="max-w-[280px] px-4 py-4 font-semibold text-[#0F172A]">{record.description || 'Sin descripción'}</td><td className="px-4 py-4 text-[#64748B]">{record.customer || record.provider || 'No disponible'}</td><td className="px-4 py-4 text-[#64748B]">{record.category || 'Sin categoría'}</td><td className="px-4 py-4 text-[#64748B]">{record.paymentMethod || 'Sin dato'}</td><td className="px-4 py-4 text-[#64748B]">{record.responsible || 'No asignado'}</td><td className="max-w-[220px] truncate px-4 py-4 text-[#64748B]">{record.document?.name || 'Documento'}</td><td className="px-4 py-4 text-[#64748B]">{record.sheet?.name || 'Hoja'}</td><td className={`px-4 py-4 text-right font-semibold ${type === 'expenses' ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>{formatMoney(record.amount)}</td><td className="px-4 py-4"><StatusBadge status={record.status} /></td><td className="px-4 py-4">{record.document?.url ? <a href={record.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#2563EB]"><ExternalLink className="h-4 w-4" />Original</a> : <button disabled className="text-[#94A3B8]">Sin enlace</button>}</td></tr>
            ))}
            empty={<EmptyState icon={FileText} title={meta.empty} description="Ajusta los filtros o sincroniza nuevamente los documentos de Google Drive." />}
          />
        </>
      )}
    </div>
  );
}
