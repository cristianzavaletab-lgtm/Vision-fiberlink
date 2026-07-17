import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, History, PlayCircle } from 'lucide-react';
import { DataTable, EmptyState, InlineAlert, LoadingState, MetricCard, PageHeader, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { api } from '../../services/api';
import { enterpriseApi, formatDateTime } from '../../services/enterpriseApi';
import type { EnterpriseReport } from '../../services/enterpriseApi';

const reportCards = [
  { type: 'daily', title: 'Reporte diario', description: 'Resumen ejecutivo del día.' },
  { type: 'weekly', title: 'Reporte semanal', description: 'Actividad financiera y documental de la semana.' },
  { type: 'monthly', title: 'Reporte mensual', description: 'Cierre mensual de ingresos, egresos y cambios.' },
  { type: 'custom', title: 'Reporte ejecutivo', description: 'Reporte configurable del periodo disponible.' },
] as const;

export function ReportsEnterprisePage() {
  const [reports, setReports] = useState<EnterpriseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState('');

  const load = useCallback((signal?: AbortSignal) => {
    return enterpriseApi.getReports(signal)
      .then(setReports)
      .finally(() => setLoading(false));
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

  const download = async (report: EnterpriseReport) => {
    const response = await api.get(enterpriseApi.reportDownloadUrl(report.id), { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(report.title || report.type || 'reporte').replace(/\W+/g, '-').toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reportes" description="Generación e historial de reportes empresariales conectados a los datos sincronizados." />
      {loading ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Reportes generados" value={`${reports.length}`} helper="Historial disponible" icon={History} tone="blue" empty={!reports.length} />
            <MetricCard title="Último reporte" value={reports[0] ? formatDateTime(reports[0].createdAt) : 'Sin reportes'} helper={reports[0]?.title || 'Genera el primer reporte'} icon={FileText} tone="teal" empty={!reports.length} />
            <MetricCard title="Tipos activos" value={`${new Set(reports.map((report) => report.type)).size}`} helper="Tipos con historial" icon={FileSpreadsheet} tone="slate" empty={!reports.length} />
            <MetricCard title="Estado" value="Operativo" helper="Endpoint de reportes disponible" icon={PlayCircle} tone="green" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {reportCards.map((card) => (
              <div key={card.type} className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-[#0F172A]">{card.title}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#64748B]">{card.description}</p>
                <div className="mt-5 grid gap-2">
                  <ToolbarButton onClick={() => generate(card.type)} disabled={generating === card.type}><PlayCircle className="h-4 w-4" />{generating === card.type ? 'Generando' : 'Generar'}</ToolbarButton>
                  <button disabled className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-semibold text-[#94A3B8]">PDF no disponible</button>
                  <button disabled className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-semibold text-[#94A3B8]">Excel no disponible</button>
                  <button disabled className="rounded-xl border border-[#E2E8F0] px-3 py-2 text-sm font-semibold text-[#94A3B8]">CSV no disponible</button>
                </div>
              </div>
            ))}
          </div>
          <InlineAlert title="Formatos de descarga" description="El backend actual expone descarga real en JSON para reportes generados. PDF, Excel y CSV quedan deshabilitados para no ofrecer acciones inexistentes." />
          <DataTable
            columns={['Reporte', 'Tipo', 'Periodo', 'Creado', 'Estado', 'Acciones']}
            rows={reports.map((report) => (
              <tr key={report.id} className="hover:bg-[#F8FAFC]"><td className="px-4 py-4 font-semibold text-[#0F172A]">{report.title || 'Reporte empresarial'}</td><td className="px-4 py-4 text-[#64748B]">{report.type || 'custom'}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(report.periodStart)} - {formatDateTime(report.periodEnd)}</td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(report.createdAt)}</td><td className="px-4 py-4"><StatusBadge status={report.status || 'Generado'} /></td><td className="px-4 py-4"><ToolbarButton tone="secondary" onClick={() => download(report)}><Download className="h-4 w-4" /> Descargar JSON</ToolbarButton></td></tr>
            ))}
            empty={<EmptyState icon={FileText} title="Sin reportes generados" description="Genera un reporte diario, semanal, mensual o ejecutivo para iniciar el historial." />}
          />
        </>
      )}
    </div>
  );
}
