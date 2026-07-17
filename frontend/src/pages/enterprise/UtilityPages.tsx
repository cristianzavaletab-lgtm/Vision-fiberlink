import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, History, ReceiptText, RefreshCw, Scale } from 'lucide-react';
import { DataTable, EmptyState, LoadingState, MetricCard, PageHeader, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { enterpriseApi, formatDateTime, formatMoney } from '../../services/enterpriseApi';
import type { DriveDocument, DriveStatus, FinanceComparison } from '../../services/enterpriseApi';

export function DocumentsPage({ onDrive }: { onDrive: () => void }) {
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback((signal?: AbortSignal) => enterpriseApi.getDriveDocuments({ pageSize: 200 }, signal).then((response) => setDocuments(response.rows)).finally(() => setLoading(false)), []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  return <div className="space-y-6"><PageHeader title="Documentos" description="Inventario de documentos y hojas utilizadas por VisionControl."><ToolbarButton onClick={onDrive} tone="secondary">Administrar Drive</ToolbarButton></PageHeader>{loading ? <LoadingState /> : <DataTable columns={['Documento', 'Hojas', 'Estado', 'Última sincronización']} rows={documents.map((document) => <tr key={document.id}><td className="px-4 py-4 font-semibold text-[#0F172A]">{document.name || document.googleFileId}</td><td className="px-4 py-4 text-[#64748B]">{document.sheets?.map((sheet) => sheet.name).join(', ') || 'Sin hojas'}</td><td className="px-4 py-4"><StatusBadge status={document.status} /></td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(document.lastSyncAt)}</td></tr>)} empty={<EmptyState icon={FileSpreadsheet} title="Sin documentos" description="Sin documentos sincronizados todavía." />} />}</div>;
}

export function SyncsPage() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const load = useCallback((signal?: AbortSignal) => enterpriseApi.getDriveStatus(signal).then(setStatus).finally(() => setLoading(false)), []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const syncNow = async () => { setSyncing(true); try { await enterpriseApi.syncDrive(); await load(); } finally { setSyncing(false); } };
  return <div className="space-y-6"><PageHeader title="Sincronizaciones" description="Estado y programación de las sincronizaciones con Google Drive."><ToolbarButton onClick={syncNow} disabled={syncing || status?.running}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Sincronizando' : 'Sincronizar desde Drive'}</ToolbarButton></PageHeader>{loading ? <LoadingState /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Modo" value={status?.mode || 'public'} helper={status?.readOnly === false ? 'Lectura y escritura' : 'Solo lectura'} icon={RefreshCw} tone="blue" /><MetricCard title="Última sincronización" value={formatDateTime(status?.lastSyncAt)} helper="Último ciclo registrado" icon={History} tone="teal" /><MetricCard title="Próxima sincronización" value={formatDateTime(status?.nextSyncAt)} helper="Programada automáticamente" icon={RefreshCw} tone="slate" /><MetricCard title="Errores" value={`${status?.errors || 0}`} helper="Documentos con fallo" icon={ReceiptText} tone="amber" empty={!status?.errors} /></div>}</div>;
}

export function ComparisonPage() {
  const [comparison, setComparison] = useState<FinanceComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback((signal?: AbortSignal) => enterpriseApi.getComparison({}, signal).then(setComparison).finally(() => setLoading(false)), []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  return <div className="space-y-6"><PageHeader title="Comparaciones" description="Periodo actual frente al periodo anterior con datos reales disponibles." />{loading ? <LoadingState /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Ingresos actuales" value={formatMoney(comparison?.current?.income)} helper="Periodo actual" icon={Scale} tone="green" empty={!comparison?.current?.income} /><MetricCard title="Egresos actuales" value={formatMoney(comparison?.current?.expense)} helper="Periodo actual" icon={Scale} tone="red" empty={!comparison?.current?.expense} /><MetricCard title="Ingresos anteriores" value={formatMoney(comparison?.previous?.income)} helper="Periodo anterior" icon={Scale} tone="slate" empty={!comparison?.previous?.income} /><MetricCard title="Variación" value={comparison?.comparable && comparison.variation !== null ? `${comparison?.variation?.toFixed(1)}%` : 'Sin datos'} helper="Solo se muestra si ambos periodos son comparables" icon={Scale} tone="blue" empty={!comparison?.comparable} /></div>}</div>;
}

export function DebtsPage() {
  return <div className="space-y-6"><PageHeader title="Deudas" description="Seguimiento de deudas y obligaciones pendientes." /><EmptyState icon={ReceiptText} title="Módulo sin endpoint específico" description="El backend actual no expone un endpoint de deudas. Las obligaciones detectables aparecen por ahora en Compras pendientes y Alertas." /></div>;
}

export function HistoryPage({ onChanges }: { onChanges: () => void }) {
  return <div className="space-y-6"><PageHeader title="Historial" description="Historial documental y financiero consolidado."><ToolbarButton onClick={onChanges} tone="secondary">Ver cambios detectados</ToolbarButton></PageHeader><EmptyState icon={History} title="Historial consolidado pendiente" description="Usa Cambios detectados, Documentos y Reportes para consultar el historial real disponible actualmente." /></div>;
}
