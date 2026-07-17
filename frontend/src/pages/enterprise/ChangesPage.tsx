import { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, FileSearch, Search } from 'lucide-react';
import { DataTable, EmptyState, ErrorState, FilterBar, LoadingState, MetricCard, PageHeader, SearchInput, SelectInput, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { enterpriseApi, formatDateTime } from '../../services/enterpriseApi';
import type { DriveChange } from '../../services/enterpriseApi';

export function ChangesPage() {
  const [changes, setChanges] = useState<DriveChange[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    setError(false);
    return enterpriseApi.getDriveChanges({ pageSize: 100, type: type || undefined }, signal)
      .then((response) => setChanges(response.rows))
      .catch((requestError) => { if (requestError?.name !== 'CanceledError') setError(true); })
      .finally(() => setLoading(false));
  }, [type]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = changes.filter((change) => !search || `${change.document?.name} ${change.sheet?.name} ${change.fieldName} ${change.previousValue} ${change.newValue}`.toLowerCase().includes(search.toLowerCase()));
  const high = changes.filter((change) => /high|alta|critical/i.test(change.importance || '')).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Cambios detectados" description="Auditoría de modificaciones detectadas en documentos, hojas, filas y campos." />
      {loading ? <LoadingState /> : error ? <ErrorState onRetry={() => load()} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Cambios nuevos" value={`${changes.length}`} helper="Detectados por snapshot" icon={Copy} tone="blue" empty={!changes.length} />
            <MetricCard title="Alta importancia" value={`${high}`} helper="Requieren revisión prioritaria" icon={FileSearch} tone="amber" empty={!high} />
            <MetricCard title="Sin revisar" value={`${changes.filter((change) => !change.reviewStatus).length}`} helper="Estado de revisión pendiente" icon={Search} tone="slate" empty={!changes.length} />
            <MetricCard title="Documentos afectados" value={`${new Set(changes.map((change) => change.document?.id).filter(Boolean)).size}`} helper="Documentos con modificaciones" icon={FileSearch} tone="teal" empty={!changes.length} />
          </div>
          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar documento, hoja, campo o valor" />
            <SelectInput value={type} onChange={setType} options={[{ value: '', label: 'Todos los cambios' }, { value: 'ROW_ADDED', label: 'Fila nueva' }, { value: 'ROW_UPDATED', label: 'Fila modificada' }, { value: 'ROW_DELETED', label: 'Fila eliminada' }, { value: 'AMOUNT_CHANGED', label: 'Monto cambiado' }]} />
            <ToolbarButton onClick={() => load()}><Search className="h-4 w-4" /> Filtrar</ToolbarButton>
          </FilterBar>
          <DataTable
            columns={['Documento', 'Hoja', 'Fila', 'Campo', 'Valor anterior', 'Valor nuevo', 'Tipo de cambio', 'Fecha detectada', 'Importancia', 'Estado', 'Acciones']}
            rows={filtered.map((change) => (
              <tr key={change.id} className="hover:bg-[#F8FAFC]"><td className="max-w-[220px] truncate px-4 py-4 font-semibold text-[#0F172A]">{change.document?.name || 'Documento'}</td><td className="px-4 py-4 text-[#64748B]">{change.sheet?.name || 'Documento'}</td><td className="px-4 py-4 text-[#64748B]">{change.rowKey || 'Fila'}</td><td className="px-4 py-4 text-[#64748B]">{change.fieldName || 'Registro'}</td><td className="max-w-[180px] truncate px-4 py-4 text-[#64748B]">{change.previousValue || 'No aplica'}</td><td className="max-w-[180px] truncate px-4 py-4 font-semibold text-[#0F172A]">{change.newValue || 'No aplica'}</td><td className="px-4 py-4 text-[#64748B]">{change.changeType || 'Cambio'}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(change.detectedAt)}</td><td className="px-4 py-4"><StatusBadge status={change.importance || 'Normal'} /></td><td className="px-4 py-4"><StatusBadge status={change.reviewStatus || 'Sin revisar'} /></td><td className="px-4 py-4">{change.document?.url ? <a href={change.document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#2563EB]"><ExternalLink className="h-4 w-4" />Documento</a> : <button disabled className="text-[#94A3B8]">Sin enlace</button>}</td></tr>
            ))}
            empty={<EmptyState icon={Copy} title="Sin cambios comparables" description="Cuando exista una versión anterior y una nueva, VisionControl mostrará filas agregadas, editadas y eliminadas." />}
          />
        </>
      )}
    </div>
  );
}
