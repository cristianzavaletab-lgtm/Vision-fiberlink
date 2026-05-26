import { useState } from 'react';
import { FileText, Download, Filter, Search, Calendar, ShieldAlert, Activity, CheckCircle2 } from 'lucide-react';

import type { Report } from '../App';

interface ReportesProps {
  reports: Report[];
}

export function ReportesView({ reports }: ReportesProps) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <h3 className="text-brand-primary text-xs font-bold tracking-[0.2em] uppercase mb-2">Auditoría</h3>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 tracking-tight">Reportes y Logs</h1>
          <p className="text-text-secondary text-sm sm:text-base max-w-xl">
            Historial global de actividades, alertas de seguridad y eventos de todos los equipos.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-bg-surface border border-bg-elevated hover:bg-bg-highlight px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-white">
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <button className="flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary px-4 py-2.5 rounded-xl text-sm font-bold transition-colors text-white shadow-lg shadow-brand-primary/20">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-bg-surface border border-bg-elevated rounded-2xl p-5">
          <div className="flex items-center gap-3 text-text-tertiary mb-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <span className="text-xs font-bold uppercase">Alertas Críticas</span>
          </div>
          <div className="text-3xl font-bold text-white">12</div>
        </div>
        <div className="bg-bg-surface border border-bg-elevated rounded-2xl p-5">
          <div className="flex items-center gap-3 text-text-tertiary mb-2">
            <Activity className="w-5 h-5 text-orange-500" />
            <span className="text-xs font-bold uppercase">Eventos Anómalos</span>
          </div>
          <div className="text-3xl font-bold text-white">45</div>
        </div>
        <div className="bg-bg-surface border border-bg-elevated rounded-2xl p-5">
          <div className="flex items-center gap-3 text-text-tertiary mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-xs font-bold uppercase">Actualizaciones</span>
          </div>
          <div className="text-3xl font-bold text-white">128</div>
        </div>
        <div className="bg-bg-surface border border-bg-elevated rounded-2xl p-5">
          <div className="flex items-center gap-3 text-text-tertiary mb-2">
            <FileText className="w-5 h-5 text-brand-primary" />
            <span className="text-xs font-bold uppercase">Total Registros</span>
          </div>
          <div className="text-3xl font-bold text-white">1,402</div>
        </div>
      </div>

      <div className="bg-bg-surface border border-bg-elevated rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-bg-elevated flex justify-between items-center bg-bg-base/50">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input 
              type="text" 
              placeholder="Buscar por ID de equipo, evento..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg-surface border border-bg-elevated rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-brand-primary outline-none transition-colors"
            />
          </div>
          <button className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm font-medium transition-colors">
            <Calendar className="w-4 h-4" /> Últimos 7 días
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text-secondary">
            <thead className="text-xs uppercase bg-bg-base/50 text-text-tertiary border-b border-bg-elevated">
              <tr>
                <th className="px-6 py-4 font-bold">Fecha / Hora</th>
                <th className="px-6 py-4 font-bold">Equipo</th>
                <th className="px-6 py-4 font-bold">Tipo</th>
                <th className="px-6 py-4 font-bold">Descripción</th>
                <th className="px-6 py-4 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b border-bg-elevated/50 hover:bg-bg-highlight/30 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs">{report.date}</td>
                  <td className="px-6 py-4 font-mono font-medium text-white">{report.device}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      report.type === 'Alerta' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      report.type === 'Actividad' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      report.type === 'Sesión' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      'bg-green-500/10 text-green-500 border-green-500/20'
                    }`}>
                      {report.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-text-primary">{report.description}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${
                      report.status === 'Crítico' ? 'text-red-500' :
                      report.status === 'Pendiente' ? 'text-orange-500' :
                      report.status === 'Revisado' ? 'text-blue-500' :
                      'text-text-tertiary'
                    }`}>
                      {report.status === 'Crítico' && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      {report.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
