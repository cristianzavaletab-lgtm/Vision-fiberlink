import { useState, useEffect } from 'react';
import { FileText, Search, AlertTriangle, Monitor, Activity, Calendar, Clock, BarChart3, FileDown, PieChart, Laptop } from 'lucide-react';
import { api } from '../services/api';

// Dynamic imports for export libraries (loaded on-demand to reduce initial bundle)
const loadPdfLibs = () => Promise.all([
  import('jspdf'),
  import('jspdf-autotable')
]);
const loadDocxLibs = () => Promise.all([
  import('docx'),
  import('file-saver')
]);
const loadXlsxLib = () => import('xlsx');

interface Report {
  date: string;
  device: string;
  deviceName?: string;
  type: string;
  description: string;
  status: string;
}

interface Summary {
  totalIncidents: number;
  criticalOpen: number;
  offlineDevices: number;
  sessionsToday: number;
  activitiesToday?: number;
  activeDevices?: number;
}

interface AppUsageEntry {
  app: string;
  seconds: number;
}

interface HourlyEntry {
  hour: number;
  apps: Record<string, number>;
  totalSeconds: number;
}

interface DailyReport {
  date: string;
  deviceId: string;
  hourlyBreakdown: HourlyEntry[];
  appUsage: AppUsageEntry[];
  bootSessions: Array<{ bootAt: string; shutdownAt?: string; totalSeconds?: number; deviceName: string }>;
  sessions: Array<{ appName: string; startedAt: string; endedAt?: string; duration?: number; deviceName: string }>;
  activities: Report[];
  summary: {
    totalApps: number;
    totalActiveSeconds: number;
    totalSessions: number;
    mostUsedApp: string;
  };
}

type ViewMode = 'table' | 'timeline' | 'daily';

export function ReportesView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIncidents: 0, criticalOpen: 0, offlineDevices: 0, sessionsToday: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [deviceFilter, setDeviceFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [exporting, setExporting] = useState(false);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reportsRes, summaryRes, devicesRes] = await Promise.all([
          api.get('/reports'),
          api.get('/reports/summary'),
          api.get('/devices'),
        ]);
        setReports(reportsRes.data);
        setSummary(summaryRes.data);
        setDevices(devicesRes.data.map((d: any) => ({ id: d.id, name: d.name })));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch daily report when date or device changes
  useEffect(() => {
    const fetchDaily = async () => {
      setLoadingDaily(true);
      try {
        const params = new URLSearchParams({ date: dateFilter });
        if (deviceFilter) params.set('deviceId', deviceFilter);
        const res = await api.get(`/reports/daily?${params.toString()}`);
        setDailyReport(res.data);
      } catch {
        setDailyReport(null);
      } finally {
        setLoadingDaily(false);
      }
    };
    fetchDaily();
  }, [dateFilter, deviceFilter]);

  const filtered = reports.filter(r => {
    const matchesSearch = !search || r.description?.toLowerCase().includes(search.toLowerCase()) || r.device?.toLowerCase().includes(search.toLowerCase()) || r.deviceName?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'All' || r.type === typeFilter;
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  // ─── Helper functions ───
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}:00 ${ampm}`;
  };

  const getAppColor = (appName: string) => {
    const lower = appName.toLowerCase();
    if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('edge') || lower.includes('brave')) return 'bg-blue-500';
    if (lower.includes('code') || lower.includes('visual studio') || lower.includes('intellij')) return 'bg-emerald-500';
    if (lower.includes('word') || lower.includes('excel') || lower.includes('powerpoint')) return 'bg-orange-500';
    if (lower.includes('slack') || lower.includes('teams') || lower.includes('discord')) return 'bg-purple-500';
    if (lower.includes('explorer') || lower.includes('finder')) return 'bg-gray-500';
    return 'bg-brand';
  };

  // ─── Export: PDF ───
  const exportPDF = async () => {
    setExporting(true);
    try {
      const [{ jsPDF }, autoTableModule] = await loadPdfLibs();
      const autoTable = autoTableModule.default;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(20, 20, 30);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 107, 53);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('VisionControl', 14, 18);
      doc.setTextColor(200, 200, 200);
      doc.setFontSize(10);
      doc.text('Reporte de Actividad', 14, 26);
      doc.setFontSize(8);
      doc.text(`Fecha: ${dateFilter} | Generado: ${new Date().toLocaleString('es-CO')}`, 14, 34);
      if (deviceFilter) {
        const deviceName = devices.find(d => d.id === deviceFilter)?.name || deviceFilter;
        doc.text(`Dispositivo: ${deviceName}`, pageWidth - 14, 34, { align: 'right' });
      }

      let yPos = 50;

      // Summary section
      if (dailyReport) {
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen del Dia', 14, yPos);
        yPos += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const summaryData = [
          [`Total Apps Usadas: ${dailyReport.summary.totalApps}`, `Tiempo Activo: ${formatDuration(dailyReport.summary.totalActiveSeconds)}`],
          [`Total Sesiones: ${dailyReport.summary.totalSessions}`, `App Mas Usada: ${dailyReport.summary.mostUsedApp}`],
        ];
        summaryData.forEach(row => {
          doc.text(row[0], 14, yPos);
          doc.text(row[1], pageWidth / 2, yPos);
          yPos += 6;
        });
        yPos += 6;

        // App Usage table
        if (dailyReport.appUsage.length > 0) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Uso de Aplicaciones', 14, yPos);
          yPos += 4;

          autoTable(doc, {
            startY: yPos,
            head: [['Aplicacion', 'Tiempo de Uso', '% del Total']],
            body: dailyReport.appUsage.slice(0, 15).map(app => [
              app.app,
              formatDuration(app.seconds),
              `${Math.round((app.seconds / Math.max(dailyReport.summary.totalActiveSeconds, 1)) * 100)}%`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [255, 107, 53], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        // Hourly breakdown
        if (dailyReport.hourlyBreakdown.some(h => h.totalSeconds > 0)) {
          if (yPos > 240) { doc.addPage(); yPos = 20; }
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Desglose por Hora', 14, yPos);
          yPos += 4;

          const hourlyData = dailyReport.hourlyBreakdown
            .filter(h => h.totalSeconds > 0)
            .map(h => [
              formatHour(h.hour),
              formatDuration(h.totalSeconds),
              Object.entries(h.apps).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'
            ]);

          autoTable(doc, {
            startY: yPos,
            head: [['Hora', 'Tiempo Activo', 'App Principal']],
            body: hourlyData,
            theme: 'striped',
            headStyles: { fillColor: [255, 107, 53], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        // Boot sessions
        if (dailyReport.bootSessions.length > 0) {
          if (yPos > 240) { doc.addPage(); yPos = 20; }
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text('Sesiones de Equipo (Boot)', 14, yPos);
          yPos += 4;

          autoTable(doc, {
            startY: yPos,
            head: [['Dispositivo', 'Encendido', 'Apagado', 'Duracion']],
            body: dailyReport.bootSessions.map(b => [
              b.deviceName,
              new Date(b.bootAt).toLocaleTimeString('es-CO'),
              b.shutdownAt ? new Date(b.shutdownAt).toLocaleTimeString('es-CO') : 'Activo',
              b.totalSeconds ? formatDuration(b.totalSeconds) : 'En curso'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [50, 50, 70], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            margin: { left: 14, right: 14 },
          });
        }
      }

      // Activity table (last page)
      if (filtered.length > 0) {
        doc.addPage();
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Registro de Actividad Detallado', 14, 20);

        autoTable(doc, {
          startY: 26,
          head: [['Fecha', 'Dispositivo', 'Tipo', 'Descripcion', 'Estado']],
          body: filtered.slice(0, 100).map(r => [
            r.date ? new Date(r.date).toLocaleString('es-CO') : '-',
            r.deviceName || r.device || '-',
            r.type,
            r.description?.substring(0, 60) || '-',
            r.status
          ]),
          theme: 'striped',
          headStyles: { fillColor: [255, 107, 53], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
          bodyStyles: { fontSize: 7 },
          columnStyles: { 3: { cellWidth: 60 } },
          margin: { left: 14, right: 14 },
        });
      }

      // Footer on all pages
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`VisionControl - Pagina ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
      }

      doc.save(`VisionControl_Reporte_${dateFilter}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  // ─── Export: Word (.docx) ───
  const exportWord = async () => {
    setExporting(true);
    try {
      const [docxModule, fileSaverModule] = await loadDocxLibs();
      const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } = docxModule;
      const { saveAs } = fileSaverModule;
      const deviceName = deviceFilter ? (devices.find(d => d.id === deviceFilter)?.name || 'Todos') : 'Todos los equipos';

      const sections: any[] = [];

      // Title
      sections.push(
        new Paragraph({
          children: [new TextRun({ text: 'VisionControl', bold: true, size: 36, color: 'FF6B35' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Reporte de Actividad', size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Fecha: ${dateFilter}  |  Dispositivo: ${deviceName}  |  Generado: ${new Date().toLocaleString('es-CO')}`, size: 18, color: '666666' }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );

      // Summary
      if (dailyReport) {
        sections.push(
          new Paragraph({ text: 'Resumen del Dia', heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 } }),
          new Paragraph({
            children: [
              new TextRun({ text: `Total Apps: ${dailyReport.summary.totalApps}  |  ` }),
              new TextRun({ text: `Tiempo Activo: ${formatDuration(dailyReport.summary.totalActiveSeconds)}  |  ` }),
              new TextRun({ text: `Sesiones: ${dailyReport.summary.totalSessions}  |  ` }),
              new TextRun({ text: `App Mas Usada: ${dailyReport.summary.mostUsedApp}`, bold: true }),
            ],
            spacing: { after: 300 },
          })
        );

        // App usage table
        if (dailyReport.appUsage.length > 0) {
          sections.push(
            new Paragraph({ text: 'Uso de Aplicaciones', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } })
          );

          const appTableRows = [
            new TableRow({
              children: ['Aplicacion', 'Tiempo', '% Total'].map(text =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })] })],
                  shading: { fill: 'FF6B35' },
                  width: { size: 33, type: WidthType.PERCENTAGE },
                })
              ),
            }),
            ...dailyReport.appUsage.slice(0, 20).map(app =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: app.app, size: 18 })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatDuration(app.seconds), size: 18 })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${Math.round((app.seconds / Math.max(dailyReport.summary.totalActiveSeconds, 1)) * 100)}%`, size: 18 })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                ],
              })
            ),
          ];

          sections.push(new Table({ rows: appTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        }

        // Hourly breakdown
        const activeHours = dailyReport.hourlyBreakdown.filter(h => h.totalSeconds > 0);
        if (activeHours.length > 0) {
          sections.push(
            new Paragraph({ text: '', spacing: { before: 300 } }),
            new Paragraph({ text: 'Desglose por Hora', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } })
          );

          const hourRows = [
            new TableRow({
              children: ['Hora', 'Tiempo', 'App Principal'].map(text =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })] })],
                  shading: { fill: '333346' },
                  width: { size: 33, type: WidthType.PERCENTAGE },
                })
              ),
            }),
            ...activeHours.map(h =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatHour(h.hour), size: 18 })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatDuration(h.totalSeconds), size: 18 })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: Object.entries(h.apps).sort((a, b) => b[1] - a[1])[0]?.[0] || '-', size: 18 })] })], width: { size: 33, type: WidthType.PERCENTAGE } }),
                ],
              })
            ),
          ];
          sections.push(new Table({ rows: hourRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        }
      }

      const doc = new Document({
        sections: [{ children: sections }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `VisionControl_Reporte_${dateFilter}.docx`);
    } catch (err) {
      console.error('Error exporting Word:', err);
    } finally {
      setExporting(false);
    }
  };

  // ─── Export: Excel (.xlsx) ───
  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await loadXlsxLib();
      const wb = XLSX.utils.book_new();

      // Sheet 1: Activity Log
      const activityData = filtered.map(r => ({
        Fecha: r.date ? new Date(r.date).toLocaleString('es-CO') : '-',
        Dispositivo: r.deviceName || r.device || '-',
        Tipo: r.type,
        Descripcion: r.description || '-',
        Estado: r.status,
      }));
      const ws1 = XLSX.utils.json_to_sheet(activityData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Actividad');

      // Sheet 2: App Usage
      if (dailyReport?.appUsage) {
        const appData = dailyReport.appUsage.map(a => ({
          Aplicacion: a.app,
          'Tiempo (segundos)': a.seconds,
          'Tiempo Formato': formatDuration(a.seconds),
          '% del Total': `${Math.round((a.seconds / Math.max(dailyReport.summary.totalActiveSeconds, 1)) * 100)}%`,
        }));
        const ws2 = XLSX.utils.json_to_sheet(appData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Uso Apps');
      }

      // Sheet 3: Hourly Breakdown
      if (dailyReport?.hourlyBreakdown) {
        const hourlyData = dailyReport.hourlyBreakdown.filter(h => h.totalSeconds > 0).map(h => ({
          Hora: formatHour(h.hour),
          'Tiempo Activo (seg)': h.totalSeconds,
          'Tiempo Formato': formatDuration(h.totalSeconds),
          'App Principal': Object.entries(h.apps).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
          'Total Apps': Object.keys(h.apps).length,
        }));
        const ws3 = XLSX.utils.json_to_sheet(hourlyData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Por Hora');
      }

      // Sheet 4: Boot Sessions
      if (dailyReport?.bootSessions) {
        const bootData = dailyReport.bootSessions.map(b => ({
          Dispositivo: b.deviceName,
          Encendido: new Date(b.bootAt).toLocaleString('es-CO'),
          Apagado: b.shutdownAt ? new Date(b.shutdownAt).toLocaleString('es-CO') : 'Activo',
          'Duracion (seg)': b.totalSeconds || 0,
          'Duracion Formato': b.totalSeconds ? formatDuration(b.totalSeconds) : 'En curso',
        }));
        const ws4 = XLSX.utils.json_to_sheet(bootData);
        XLSX.utils.book_append_sheet(wb, ws4, 'Sesiones Boot');
      }

      XLSX.writeFile(wb, `VisionControl_Reporte_${dateFilter}.xlsx`);
    } catch (err) {
      console.error('Error exporting Excel:', err);
    } finally {
      setExporting(false);
    }
  };

  const summaryCards = [
    { label: 'Total Incidentes', value: summary.totalIncidents, icon: FileText, color: 'text-brand', bg: 'bg-brand/10' },
    { label: 'Criticos Abiertos', value: summary.criticalOpen, icon: AlertTriangle, color: 'text-status-error', bg: 'bg-status-error/10' },
    { label: 'Equipos Offline', value: summary.offlineDevices, icon: Monitor, color: 'text-status-warning', bg: 'bg-status-warning/10' },
    { label: 'Sesiones Hoy', value: summary.sessionsToday, icon: Activity, color: 'text-status-success', bg: 'bg-status-success/10' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 stagger-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Reportes</h3>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Reportes y Actividad</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1">Historial detallado por dia, hora y aplicacion utilizada</p>
        </div>
        
        {/* Export Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={exportPDF} 
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/20 hover:border-red-500/40 transition-all disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            PDF
          </button>
          <button 
            onClick={exportWord} 
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-semibold hover:bg-blue-500/20 hover:border-blue-500/40 transition-all disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            Word
          </button>
          <button 
            onClick={exportExcel} 
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            Excel
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-2">
        {summaryCards.map((c) => (
          <div key={c.label} className="glass-subtle rounded-2xl p-4 md:p-5 hover-card group border border-surface-border hover:border-surface-border/80 transition-all">
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} border border-surface-border group-hover:scale-110 transition-transform`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{c.value}</p>
            <p className="text-sm font-semibold text-text-secondary mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* View Mode Tabs + Filters */}
      <div className="flex flex-col md:flex-row gap-4 stagger-3">
        {/* View Mode */}
        <div className="flex bg-surface-elevated/50 rounded-xl p-1 border border-surface-border">
          {([
            { key: 'daily', label: 'Diario', icon: Calendar },
            { key: 'timeline', label: 'Timeline', icon: Clock },
            { key: 'table', label: 'Tabla', icon: BarChart3 },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                viewMode === tab.key 
                  ? 'bg-brand text-white shadow-lg shadow-brand/20' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Date & Device Filters */}
        <div className="flex gap-3 flex-1">
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="bg-surface-elevated border border-surface-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand/50 transition-all"
          />
          <select
            value={deviceFilter}
            onChange={e => setDeviceFilter(e.target.value)}
            className="bg-surface-elevated border border-surface-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand flex-1 max-w-[200px]"
          >
            <option value="">Todos los equipos</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ═══════════ DAILY VIEW ═══════════ */}
      {viewMode === 'daily' && (
        <div className="space-y-6">
          {loadingDaily ? (
            <div className="glass-subtle rounded-2xl p-12 border border-surface-border flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
            </div>
          ) : dailyReport ? (
            <>
              {/* Daily Summary Bar */}
              <div className="glass-subtle rounded-2xl p-5 border border-surface-border">
                <div className="flex items-center gap-3 mb-4">
                  <PieChart className="w-5 h-5 text-brand" />
                  <h3 className="font-bold text-text-primary">Resumen - {new Date(dateFilter + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-surface-elevated/50 rounded-xl p-3 border border-surface-border">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Tiempo Activo</p>
                    <p className="text-lg font-black text-text-primary">{formatDuration(dailyReport.summary.totalActiveSeconds)}</p>
                  </div>
                  <div className="bg-surface-elevated/50 rounded-xl p-3 border border-surface-border">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Apps Usadas</p>
                    <p className="text-lg font-black text-text-primary">{dailyReport.summary.totalApps}</p>
                  </div>
                  <div className="bg-surface-elevated/50 rounded-xl p-3 border border-surface-border">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Cambios de App</p>
                    <p className="text-lg font-black text-text-primary">{dailyReport.summary.totalSessions}</p>
                  </div>
                  <div className="bg-surface-elevated/50 rounded-xl p-3 border border-surface-border">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">App Principal</p>
                    <p className="text-sm font-bold text-brand truncate">{dailyReport.summary.mostUsedApp}</p>
                  </div>
                </div>
              </div>

              {/* App Usage Chart */}
              {dailyReport.appUsage.length > 0 && (
                <div className="glass-subtle rounded-2xl p-5 border border-surface-border">
                  <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="w-5 h-5 text-brand" />
                    <h3 className="font-bold text-text-primary">Uso por Aplicacion</h3>
                  </div>
                  <div className="space-y-3">
                    {dailyReport.appUsage.slice(0, 10).map((app, i) => {
                      const percent = Math.round((app.seconds / Math.max(dailyReport.summary.totalActiveSeconds, 1)) * 100);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${getAppColor(app.app)}`} />
                          <span className="text-xs font-medium text-text-primary w-40 truncate" title={app.app}>{app.app}</span>
                          <div className="flex-1 h-2 bg-surface-border/30 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-700 ${getAppColor(app.app)}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-text-secondary w-12 text-right">{formatDuration(app.seconds)}</span>
                          <span className="text-[10px] font-bold text-text-tertiary w-8 text-right">{percent}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hourly Timeline */}
              <div className="glass-subtle rounded-2xl p-5 border border-surface-border">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-brand" />
                  <h3 className="font-bold text-text-primary">Actividad por Hora</h3>
                </div>
                <div className="grid grid-cols-12 md:grid-cols-24 gap-1">
                  {dailyReport.hourlyBreakdown.map((h) => {
                    const maxSeconds = Math.max(...dailyReport.hourlyBreakdown.map(x => x.totalSeconds), 1);
                    const intensity = h.totalSeconds / maxSeconds;
                    return (
                      <div key={h.hour} className="flex flex-col items-center gap-1" title={`${formatHour(h.hour)}: ${formatDuration(h.totalSeconds)}`}>
                        <div 
                          className="w-full rounded-sm transition-all duration-300"
                          style={{ 
                            height: `${Math.max(4, intensity * 48)}px`,
                            backgroundColor: h.totalSeconds > 0 
                              ? `rgba(255, 107, 53, ${0.2 + intensity * 0.8})` 
                              : 'rgba(255,255,255,0.03)'
                          }}
                        />
                        {h.hour % 3 === 0 && (
                          <span className="text-[8px] text-text-tertiary">{h.hour}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[9px] text-text-tertiary">12 AM</span>
                  <span className="text-[9px] text-text-tertiary">6 AM</span>
                  <span className="text-[9px] text-text-tertiary">12 PM</span>
                  <span className="text-[9px] text-text-tertiary">6 PM</span>
                  <span className="text-[9px] text-text-tertiary">11 PM</span>
                </div>
              </div>

              {/* Boot Sessions */}
              {dailyReport.bootSessions.length > 0 && (
                <div className="glass-subtle rounded-2xl p-5 border border-surface-border">
                  <div className="flex items-center gap-3 mb-4">
                    <Laptop className="w-5 h-5 text-brand" />
                    <h3 className="font-bold text-text-primary">Sesiones del Equipo</h3>
                    <span className="text-[10px] text-text-tertiary">(Desde el encendido hasta apagado)</span>
                  </div>
                  <div className="space-y-3">
                    {dailyReport.bootSessions.map((boot, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-surface-elevated/30 rounded-xl border border-surface-border/50">
                        <div className={`w-2 h-2 rounded-full ${boot.shutdownAt ? 'bg-text-tertiary' : 'bg-status-success animate-pulse'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-text-primary">{boot.deviceName}</p>
                          <p className="text-[10px] text-text-tertiary">
                            {new Date(boot.bootAt).toLocaleTimeString('es-CO')} - {boot.shutdownAt ? new Date(boot.shutdownAt).toLocaleTimeString('es-CO') : 'En curso'}
                          </p>
                        </div>
                        <span className="text-xs font-mono text-brand font-bold">
                          {boot.totalSeconds ? formatDuration(boot.totalSeconds) : 'Activo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="glass-subtle rounded-2xl p-12 border border-surface-border text-center">
              <Calendar className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
              <p className="text-text-secondary font-medium">No hay datos para esta fecha</p>
              <p className="text-text-tertiary text-sm mt-1">Selecciona otro dia o espera a que el agente reporte actividad</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TIMELINE VIEW ═══════════ */}
      {viewMode === 'timeline' && (
        <div className="glass-subtle rounded-2xl p-5 border border-surface-border">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-brand" />
            <h3 className="font-bold text-text-primary">Timeline de Actividad</h3>
          </div>
          {dailyReport?.sessions && dailyReport.sessions.length > 0 ? (
            <div className="relative pl-6 border-l-2 border-surface-border ml-3 space-y-4 max-h-[600px] overflow-y-auto">
              {dailyReport.sessions.slice(0, 50).map((session, i) => (
                <div key={i} className="relative animate-slide-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <div className={`absolute -left-[29px] w-3.5 h-3.5 rounded-full border-2 border-surface-base ${getAppColor(session.appName)}`} />
                  <div className="bg-surface-elevated/30 rounded-xl p-3 border border-surface-border/50 hover:border-brand/20 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-text-primary truncate">{session.appName}</span>
                        <span className="text-[9px] text-text-tertiary px-1.5 py-0.5 bg-surface-border/30 rounded font-mono">{session.deviceName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-brand font-bold shrink-0">
                        {session.duration ? formatDuration(session.duration) : 'activa'}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1">
                      {new Date(session.startedAt).toLocaleTimeString('es-CO')}
                      {session.endedAt && ` - ${new Date(session.endedAt).toLocaleTimeString('es-CO')}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-tertiary text-sm text-center py-8">Sin sesiones registradas para este dia</p>
          )}
        </div>
      )}

      {/* ═══════════ TABLE VIEW ═══════════ */}
      {viewMode === 'table' && (
        <>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por dispositivo o descripcion..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated/50 border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 focus:bg-surface-elevated transition-all"
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-surface-elevated border border-surface-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
            >
              <option value="All">Todos los tipos</option>
              <option value="Actividad">Actividad</option>
              <option value="Alerta">Alerta</option>
              <option value="Sistema">Sistema</option>
              <option value="Sesion">Sesion</option>
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-surface-elevated border border-surface-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
            >
              <option value="All">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Critico">Critico</option>
              <option value="Automatico">Automatico</option>
              <option value="Resuelto">Resuelto</option>
            </select>
          </div>

          {/* Table */}
          <div className="glass-subtle rounded-2xl overflow-hidden border border-surface-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-elevated/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Dispositivo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Descripcion</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">
                      <div className="w-6 h-6 rounded-full border-2 border-brand/30 border-t-brand animate-spin mx-auto" />
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">Sin resultados</td></tr>
                  ) : (
                    filtered.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-b border-surface-border/30 hover:bg-surface-elevated/20 transition-colors">
                        <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap font-mono">
                          {r.date ? new Date(r.date).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                        </td>
                        <td className="px-4 py-3 text-text-primary font-medium text-xs">{r.deviceName || r.device || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.type === 'Alerta' ? 'bg-status-error/10 text-status-error' :
                            r.type === 'Sistema' ? 'bg-emerald-500/10 text-emerald-400' :
                            'bg-brand/10 text-brand'
                          }`}>{r.type}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-xs max-w-[300px] truncate">{r.description}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            r.status === 'Critico' ? 'bg-status-error/10 text-status-error' :
                            r.status === 'Resuelto' ? 'bg-status-success/10 text-status-success' :
                            'bg-surface-border/50 text-text-secondary'
                          }`}>{r.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 100 && (
              <div className="px-4 py-2 border-t border-surface-border text-center">
                <span className="text-[10px] text-text-tertiary">Mostrando 100 de {filtered.length} registros. Exporta para ver todos.</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
