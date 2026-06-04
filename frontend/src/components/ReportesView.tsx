import { useState, useEffect } from 'react';
import { FileText, Download, Search, AlertTriangle, Monitor, Activity } from 'lucide-react';
import { api } from '../services/api';

interface Report {
  date: string;
  device: string;
  type: string;
  description: string;
  status: string;
}

interface Summary {
  totalIncidents: number;
  criticalOpen: number;
  offlineDevices: number;
  sessionsToday: number;
}

export function ReportesView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIncidents: 0, criticalOpen: 0, offlineDevices: 0, sessionsToday: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reportsRes, summaryRes] = await Promise.all([
          api.get('/reports'),
          api.get('/reports/summary'),
        ]);
        setReports(reportsRes.data);
        setSummary(summaryRes.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = reports.filter(r => {
    const matchesSearch = !search || r.description.toLowerCase().includes(search.toLowerCase()) || r.device.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'All' || r.type === typeFilter;
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const exportCSV = () => {
    const headers = ['Fecha,Dispositivo,Tipo,Descripción,Estado'];
    const rows = filtered.map(r => `"${r.date}","${r.device}","${r.type}","${r.description}","${r.status}"`);
    const csv = [...headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reportes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = [
    { label: 'Total Incidentes', value: summary.totalIncidents, icon: FileText, color: 'text-brand' },
    { label: 'Críticos Abiertos', value: summary.criticalOpen, icon: AlertTriangle, color: 'text-status-error' },
    { label: 'Equipos Offline', value: summary.offlineDevices, icon: Monitor, color: 'text-status-warning' },
    { label: 'Sesiones Hoy', value: summary.sessionsToday, icon: Activity, color: 'text-status-success' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 md:space-y-8 max-w-7xl mx-auto animate-slide-up">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 stagger-1">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Reportes y Logs</h1>
          <p className="text-sm md:text-base text-text-secondary mt-1">Registro detallado de actividad e incidentes de la infraestructura</p>
        </div>
        <button onClick={exportCSV} className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 bg-brand/10 border border-brand/20 text-brand rounded-xl text-sm font-semibold hover:bg-brand/20 hover:border-brand/40 transition-all glow-brand hover-card">
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 stagger-2">
        {summaryCards.map((c) => (
          <div key={c.label} className="glass-subtle rounded-2xl p-4 md:p-5 hover-card group border border-surface-border hover:border-surface-border/80 transition-all">
            <div className="flex justify-between items-start mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-surface-elevated border border-surface-border group-hover:scale-110 transition-transform`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">{c.value}</p>
            <p className="text-sm font-semibold text-text-secondary mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 stagger-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por dispositivo o descripción..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface-elevated/50 border border-surface-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand/50 focus:bg-surface-elevated transition-all"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
        >
          <option value="All">Todos los tipos</option>
          <option value="Actividad">Actividad</option>
          <option value="Alerta">Alerta</option>
          <option value="Sistema">Sistema</option>
          <option value="Sesión">Sesión</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-surface-elevated border border-surface-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-brand"
        >
          <option value="All">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Crítico">Crítico</option>
          <option value="Automático">Automático</option>
          <option value="Resuelto">Resuelto</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass-subtle rounded-2xl overflow-hidden border border-surface-border stagger-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary">Dispositivo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary">Descripción</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-text-tertiary">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">Sin resultados</td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i} className="border-b border-surface-border/50 hover:bg-bg-base/50">
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3 text-text-primary font-medium">{r.device}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-brand/10 text-brand">{r.type}</span></td>
                    <td className="px-4 py-3 text-text-secondary max-w-[300px] truncate">{r.description}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.status === 'Crítico' ? 'bg-status-error/10 text-status-error' :
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
      </div>
    </div>
  );
}
