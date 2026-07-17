import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileSpreadsheet, RefreshCw, Search, Sheet, ShieldAlert, TableProperties } from 'lucide-react';
import { DataTable, EmptyState, FilterBar, LoadingState, MetricCard, PageHeader, SearchInput, SelectInput, StatusBadge, SyncStatus, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { enterpriseApi, formatDateTime } from '../../services/enterpriseApi';
import type { DriveDocument, DriveStatus } from '../../services/enterpriseApi';

export function DrivePage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      enterpriseApi.getDriveStatus(signal),
      enterpriseApi.getDriveDocuments({ pageSize: 200, status: statusFilter || undefined }, signal),
    ]).then(([nextStatus, nextDocuments]) => {
      setStatus(nextStatus);
      setDocuments(nextDocuments.rows.length ? nextDocuments.rows : nextStatus.documents || []);
    }).finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((document) => !query || `${document.name} ${document.googleFileId} ${document.status}`.toLowerCase().includes(query));
  }, [documents, search]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await enterpriseApi.syncDrive();
      await load();
    } finally {
      setSyncing(false);
    }
  };

  const addDocument = async () => {
    if (!manualLink.trim()) return;
    setSaving(true);
    try {
      await enterpriseApi.addDriveDocument(manualLink.trim());
      setManualLink('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Drive empresarial" description="Documentos autorizados utilizados para generar los reportes financieros y operativos.">
        <SyncStatus status={status || undefined} onSync={syncNow} syncing={syncing} />
      </PageHeader>

      {loading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="Documentos encontrados" value={`${status?.filesFound || documents.length}`} helper="Archivos conocidos o descubiertos" icon={FileSpreadsheet} tone="blue" />
            <MetricCard title="Hojas procesadas" value={`${documents.reduce((sum, document) => sum + (document.sheets?.length || 0), 0)}`} helper="Hojas leídas desde Sheets" icon={Sheet} tone="teal" />
            <MetricCard title="Con cambios" value={`${documents.filter((document) => /CAMBIOS/i.test(document.status || '')).length}`} helper="Requieren revisión" icon={RefreshCw} tone="amber" />
            <MetricCard title="Con errores" value={`${status?.errors || 0}`} helper="Sin acceso o lectura fallida" icon={ShieldAlert} tone="red" empty={!status?.errors} />
            <MetricCard title="Última sincronización" value={status?.lastSyncAt ? formatDateTime(status.lastSyncAt) : 'Pendiente'} helper="Registro interno" icon={TableProperties} tone="slate" />
            <MetricCard title="Próxima sincronización" value={status?.nextSyncAt ? formatDateTime(status.nextSyncAt) : 'No programada'} helper={`Modo ${status?.mode || 'public'}`} icon={RefreshCw} tone="slate" />
          </div>

          <FilterBar>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por documento, ID o estado" />
            <SelectInput value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Todos los estados' }, { value: 'ACTUALIZADO', label: 'Actualizado' }, { value: 'CON_CAMBIOS', label: 'Con cambios' }, { value: 'SIN_CAMBIOS', label: 'Sin cambios' }, { value: 'ERROR', label: 'Error' }, { value: 'PENDIENTE', label: 'Pendiente' }]} />
            <label className="xl:col-span-2 flex gap-2"><input value={manualLink} onChange={(event) => setManualLink(event.target.value)} placeholder="Agregar enlace o ID de Google Sheets" className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2563EB]" /><ToolbarButton onClick={addDocument} disabled={saving || !manualLink.trim()}>{saving ? 'Agregando' : 'Agregar'}</ToolbarButton></label>
          </FilterBar>

          <DataTable
            columns={['Documento', 'Tipo', 'Hojas', 'Última modificación', 'Última sincronización', 'Registros', 'Estado', 'Acciones']}
            rows={filtered.map((document) => (
              <tr key={document.id} className="hover:bg-[#F8FAFC]">
                <td className="max-w-[280px] px-4 py-4"><p className="truncate font-semibold text-[#0F172A]">{document.name || document.googleFileId || 'Documento sin nombre'}</p><p className="truncate text-xs text-[#64748B]">{document.googleFileId}</p></td>
                <td className="px-4 py-4 text-[#64748B]">Google Sheet</td>
                <td className="px-4 py-4 font-semibold text-[#0F172A]">{document.sheets?.length || 0}</td>
                <td className="px-4 py-4 text-[#64748B]">{formatDateTime(document.knownModifiedAt || document.updatedAt)}</td>
                <td className="px-4 py-4 text-[#64748B]">{formatDateTime(document.lastSyncAt)}</td>
                <td className="px-4 py-4 text-[#64748B]">{document.sheets?.reduce((sum, sheet) => sum + Number(sheet.rowCount || 0), 0) || 'Sin dato'}</td>
                <td className="px-4 py-4"><StatusBadge status={document.status} /></td>
                <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><ToolbarButton tone="secondary" onClick={() => onNavigate('documents')}>Ver hojas</ToolbarButton><ToolbarButton tone="secondary" onClick={() => onNavigate('changes')}>Ver cambios</ToolbarButton>{document.url ? <a href={document.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#2563EB]"><ExternalLink className="h-3.5 w-3.5" /> Drive</a> : <button disabled className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#94A3B8]">Sin enlace</button>}</div></td>
              </tr>
            ))}
            empty={<EmptyState icon={Search} title="Sin documentos encontrados" description="No hay documentos que coincidan con los filtros. Puedes sincronizar Drive o agregar un enlace autorizado." />}
          />
        </>
      )}
    </div>
  );
}
