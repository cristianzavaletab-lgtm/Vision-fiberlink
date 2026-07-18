import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, History, PlayCircle } from 'lucide-react';
import { DataTable, EmptyState, InlineAlert, LoadingState, MetricCard, PageHeader, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { api } from '../../services/api';
import { enterpriseApi, formatDateTime, formatMoney, numberValue } from '../../services/enterpriseApi';
import type { DriveStatus, EnterpriseReport, FinanceSummary } from '../../services/enterpriseApi';

const reportCards = [
  { type: 'daily', title: 'Reporte diario', description: 'Resumen ejecutivo del día.' },
  { type: 'weekly', title: 'Reporte semanal', description: 'Actividad financiera y documental de la semana.' },
  { type: 'monthly', title: 'Reporte mensual', description: 'Cierre mensual de ingresos, egresos y cambios.' },
  { type: 'custom', title: 'Reporte ejecutivo', description: 'Reporte configurable del periodo disponible.' },
] as const;

export function ReportsEnterprisePage() {
  const [reports, setReports] = useState<EnterpriseReport[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState('');

  const load = useCallback((signal?: AbortSignal) => {
    return Promise.all([
      enterpriseApi.getReports(signal),
      enterpriseApi.getFinanceSummary(signal),
      enterpriseApi.getDriveStatus(signal),
    ]).then(([nextReports, nextSummary, nextStatus]) => {
      setReports(nextReports);
      setSummary(nextSummary);
      setDriveStatus(nextStatus);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const generate = async (type: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    setGenerating(type);
    try {
      await enterpriseApi.generateReport(type);
      await load();
    } finally {
      setGenerating('');
    }
  };

  const download = async (report: EnterpriseReport, format: 'json' | 'csv' | 'xlsx' | 'html') => {
    const response = await api.get(enterpriseApi.reportDownloadUrl(report.id, format), { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(report.title || report.type || 'reporte').replace(/\W+/g, '-').toLowerCase()}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const monthRecords = Number(summary?.month?.incomeCount || 0) + Number(summary?.month?.expenseCount || 0);
  const driveProcessed = Number(driveStatus?.processed || 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" description="Generación e historial de reportes empresariales conectados a los datos sincronizados." />
      {loading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Datos del mes" value={`${monthRecords}`} helper={`${formatMoney(summary?.month?.income)} ingresos · ${formatMoney(summary?.month?.expense)} egresos`} icon={History} tone="blue" empty={!monthRecords} emptyValue="Sin registros" />
            <MetricCard title="Documentos procesados" value={`${driveProcessed}`} helper={`${driveStatus?.filesFound || summary?.documents?.total || 0} documentos encontrados`} icon={FileSpreadsheet} tone="teal" empty={!driveProcessed} emptyValue="Sin procesar" />
            <MetricCard title="Saldo mensual" value={formatMoney(summary?.month?.net)} helper={numberValue(summary?.month?.net) >= 0 ? 'Resultado positivo' : 'Resultado negativo'} icon={FileText} tone={numberValue(summary?.month?.net) >= 0 ? 'green' : 'red'} empty={!monthRecords} emptyValue="Sin saldo" />
            <MetricCard title="Historial" value={`${reports.length}`} helper={reports[0] ? `Último: ${formatDateTime(reports[0].createdAt)}` : 'Genera el primer reporte'} icon={PlayCircle} tone="slate" empty={!reports.length} emptyValue="Sin historial" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {reportCards.map((card) => (
              <div key={card.type} className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-[#0F172A]">{card.title}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#64748B]">{card.description}</p>
                <div className="mt-5 grid gap-2">
                  <ToolbarButton onClick={() => generate(card.type)} disabled={generating === card.type}><PlayCircle className="h-4 w-4" />{generating === card.type ? 'Generando' : 'Generar'}</ToolbarButton>
                  <p className="text-xs leading-5 text-[#64748B]">Después de generar, podrás descargar JSON, Excel, CSV y vista imprimible.</p>
                </div>
              </div>
            ))}
          </div>
          <InlineAlert title="Formatos de descarga" description="Los reportes generados incluyen resumen financiero, documentos procesados, cambios, alertas, categorías y registros recientes. Descargas reales: JSON, Excel, CSV y vista imprimible HTML." />
          <DataTable
            columns={['Reporte', 'Tipo', 'Periodo', 'Creado', 'Estado', 'Acciones']}
            rows={reports.map((report) => (
              <tr key={report.id} className="hover:bg-[#F8FAFC]"><td className="px-4 py-4 font-semibold text-[#0F172A]">{report.title || 'Reporte empresarial'}</td><td className="px-4 py-4 text-[#64748B]">{report.type || 'custom'}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(report.periodStart)} - {formatDateTime(report.periodEnd)}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(report.createdAt)}</td><td className="px-4 py-4"><StatusBadge status={report.status || 'Generado'} /></td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><ToolbarButton tone="secondary" onClick={() => download(report, 'json')}><Download className="h-4 w-4" /> JSON</ToolbarButton><ToolbarButton tone="secondary" onClick={() => download(report, 'xlsx')}>Excel</ToolbarButton><ToolbarButton tone="secondary" onClick={() => download(report, 'csv')}>CSV</ToolbarButton><ToolbarButton tone="secondary" onClick={() => download(report, 'html')}>Imprimir</ToolbarButton></div></td></tr>
            ))}
            empty={<EmptyState icon={FileText} title="Sin reportes generados" description="Genera un reporte diario, semanal, mensual o ejecutivo para iniciar el historial." />}
          />
        </>
      )}
    </div>
  );
}
