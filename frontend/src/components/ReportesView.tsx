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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reportes</h1>
          <p className="text-sm text-text-secondary mt-1">Registro de actividad e incidentes</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(c => (
          <div key={c.label} className="bg-surface-elevated border border-surface-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-xs text-text-tertiary font-medium">{c.label}</span>
            </div>
            <p className="text-xl font-bold text-text-primary">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-surface-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand"
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
      <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
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
