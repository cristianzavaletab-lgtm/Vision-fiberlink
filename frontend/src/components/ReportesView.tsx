import { useState } from 'react';
import { FileText, Download, Filter, Search, Calendar, ShieldAlert, Activity, UserCheck, Smartphone } from 'lucide-react';

import type { Report } from '../App';

interface ReportesProps {
  reports: Report[];
}

export function ReportesView({ reports }: ReportesProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredReports = reports.filter(r => 
    r.device.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-slide-up relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,107,53,0.6)]" />
            <h3 className="text-brand font-bold text-[11px] tracking-[0.2em] uppercase">Auditoría</h3>
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-text-primary mb-2 tracking-tight">Reportes y Logs</h1>
          <p className="text-text-secondary text-sm lg:text-base max-w-xl">
            Historial global de actividades, alertas de seguridad y eventos de todos los equipos.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-surface-elevated/50 backdrop-blur-xl border border-surface-border hover:bg-surface-highlight px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-colors text-text-primary">
            <Filter className="w-4 h-4 text-text-secondary" /> Filtros
          </button>
          <button className="flex items-center gap-2 bg-brand hover:bg-brand-light shadow-lg shadow-brand/20 text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.98]">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-5 relative overflow-hidden group hover:border-status-error/30 transition-colors">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-status-error/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-status-error/20 transition-colors" />
          <div className="flex items-center gap-2.5 text-text-tertiary mb-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-status-error/10 flex items-center justify-center border border-status-error/20">
              <ShieldAlert className="w-4 h-4 text-status-error" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Críticas</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary relative z-10">{reports.filter(r => r.status === 'Crítico').length}</div>
        </div>
        
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-5 relative overflow-hidden group hover:border-status-warning/30 transition-colors">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-status-warning/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-status-warning/20 transition-colors" />
          <div className="flex items-center gap-2.5 text-text-tertiary mb-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-status-warning/10 flex items-center justify-center border border-status-warning/20">
              <Activity className="w-4 h-4 text-status-warning" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Actividad</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary relative z-10">{reports.filter(r => r.type === 'Actividad').length}</div>
        </div>
        
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-blue-500/20 transition-colors" />
          <div className="flex items-center gap-2.5 text-text-tertiary mb-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <UserCheck className="w-4 h-4 text-blue-500" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Sesiones</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary relative z-10">{reports.filter(r => r.type === 'Sesión').length}</div>
        </div>
        
        <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl p-5 relative overflow-hidden group hover:border-brand/30 transition-colors">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-brand/10 rounded-full blur-[30px] pointer-events-none group-hover:bg-brand/20 transition-colors" />
          <div className="flex items-center gap-2.5 text-text-tertiary mb-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center border border-brand/20">
              <FileText className="w-4 h-4 text-brand" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider">Registros</span>
          </div>
          <div className="text-3xl font-extrabold text-text-primary relative z-10">{reports.length}</div>
        </div>
      </div>

      <div className="bg-surface-elevated/50 border border-surface-border rounded-2xl overflow-hidden relative">
        <div className="p-4 sm:p-5 border-b border-surface-border flex flex-col sm:flex-row justify-between items-center bg-surface-base/50 gap-4">
          <div className="relative w-full sm:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary group-focus-within:text-brand transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar por ID, app, evento..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-base border border-surface-border rounded-lg pl-11 pr-4 py-2.5 text-[13px] text-text-primary placeholder-text-tertiary/50 focus:border-brand/40 outline-none transition-all focus:ring-1 focus:ring-brand/40"
            />
          </div>
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-surface-base border border-surface-border hover:bg-surface-highlight px-4 py-2.5 rounded-lg text-[13px] font-semibold text-text-secondary transition-colors">
            <Calendar className="w-4 h-4" /> Hoy
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-text-secondary">
            <thead className="text-[10px] uppercase font-semibold tracking-wider bg-surface-base/50 text-text-tertiary border-b border-surface-border">
              <tr>
                <th className="px-5 py-3.5">Fecha / Hora</th>
                <th className="px-5 py-3.5">Equipo</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5">Descripción</th>
                <th className="px-5 py-3.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-surface-highlight transition-colors group">
                    <td className="px-5 py-3.5 font-mono text-[11px] text-text-tertiary group-hover:text-text-secondary transition-colors">{report.date}</td>
                    <td className="px-5 py-3.5 font-mono font-medium text-text-primary flex items-center gap-2 text-[13px]">
                      <Smartphone className="w-3.5 h-3.5 text-text-tertiary group-hover:text-brand transition-colors" />
                      {report.device}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                        report.type === 'Alerta' ? 'bg-status-error/10 text-status-error border-status-error/20' :
                        report.type === 'Actividad' ? 'bg-status-warning/10 text-status-warning border-status-warning/20' :
                        report.type === 'Sesión' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-brand/10 text-brand border-brand/20'
                      }`}>
                        {report.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-text-secondary group-hover:text-text-primary transition-colors max-w-sm truncate" title={report.description}>
                      {report.description}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold tracking-wide flex items-center gap-1.5 ${
                        report.status === 'Crítico' ? 'text-status-error' :
                        report.status === 'Pendiente' ? 'text-status-warning' :
                        report.status === 'Revisado' ? 'text-blue-400' :
                        report.status === 'Automático' ? 'text-brand' :
                        'text-text-tertiary'
                      }`}>
                        {(report.status === 'Crítico' || report.status === 'Automático') && <div className={`w-1.5 h-1.5 rounded-full ${report.status === 'Crítico' ? 'bg-status-error animate-pulse' : 'bg-brand'}`} />}
                        {report.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-[13px] text-text-tertiary">
                    No se encontraron reportes que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
