import { Activity, AlertTriangle, Laptop, MonitorSmartphone, Wifi, WifiOff } from 'lucide-react';
import { DataTable, EmptyState, MetricCard, PageHeader, StatusBadge, ToolbarButton } from '../../components/enterprise/EnterpriseUI';
import { formatDateTime } from '../../services/enterpriseApi';

export interface EnterpriseDevice {
  id: string;
  name: string;
  os?: string;
  status: 'online' | 'offline';
  lastSeen: number;
  activeApp?: string;
  companyArea?: string;
  agentVersion?: string;
  remoteSupportEnabled?: boolean;
  supportSocketConnected?: boolean;
}

export interface EnterpriseEventRow {
  id: string;
  deviceId: string;
  fileName?: string;
  createdAt: string;
  action?: string;
}

export function AgentsPage({ devices, rows, onDetail, onSupport, onNavigate }: { devices: EnterpriseDevice[]; rows: EnterpriseEventRow[]; onDetail: (deviceId: string) => void; onSupport: () => void; onNavigate?: (view: string) => void }) {
  const online = devices.filter((device) => device.status === 'online').length;
  const errors = devices.filter((device) => device.supportSocketConnected === false || device.remoteSupportEnabled === false).length;
  const files = new Set(rows.map((row) => row.fileName).filter(Boolean));

  return (
    <div className="space-y-6">
      <PageHeader title="Equipos y agentes" description="Estado de los equipos autorizados que envían actividad al sistema.">
        <ToolbarButton onClick={onSupport} tone="secondary"><MonitorSmartphone className="h-4 w-4" /> Soporte remoto</ToolbarButton>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Equipos registrados" value={`${devices.length}`} helper="Agentes conocidos por el panel" icon={Laptop} tone="blue" empty={!devices.length} />
        <MetricCard title="Conectados" value={`${online}`} helper="En línea actualmente" icon={Wifi} tone="green" empty={!online} />
        <MetricCard title="Archivos detectados" value={`${files.size}`} helper="Archivos con eventos enviados" icon={Activity} tone="teal" empty={!files.size} />
        <MetricCard title="Observaciones" value={`${errors}`} helper="Canal remoto o permisos" icon={AlertTriangle} tone="amber" empty={!errors} />
      </div>
      {onNavigate && (
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A]">Herramientas operativas</h2>
          <p className="mt-1 text-sm text-[#64748B]">Funciones heredadas conservadas como soporte del sistema principal.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ToolbarButton tone="secondary" onClick={() => onNavigate('excel')}>Archivos Excel</ToolbarButton>
            <ToolbarButton tone="secondary" onClick={() => onNavigate('movements')}>Movimientos</ToolbarButton>
            <ToolbarButton tone="secondary" onClick={() => onNavigate('daily-close')}>Cierre diario</ToolbarButton>
            <ToolbarButton tone="secondary" onClick={() => onNavigate('screen-intelligence')}>Pantalla inteligente</ToolbarButton>
            <ToolbarButton tone="secondary" onClick={() => onNavigate('communication')}>Comunicación</ToolbarButton>
            <ToolbarButton tone="secondary" onClick={onSupport}>Soporte remoto</ToolbarButton>
          </div>
        </div>
      )}
      <DataTable
        columns={['Equipo', 'Sistema operativo', 'Estado', 'Última conexión', 'Archivos monitoreados', 'Eventos enviados', 'Sincronizaciones', 'Errores', 'Acciones']}
        rows={devices.map((device) => {
          const deviceRows = rows.filter((row) => row.deviceId === device.id);
          const deviceFiles = new Set(deviceRows.map((row) => row.fileName).filter(Boolean));
          return (
            <tr key={device.id} className="hover:bg-[#F8FAFC]"><td className="max-w-[280px] px-4 py-4"><p className="whitespace-normal break-words font-semibold text-[#0F172A]" title={device.name}>{device.name}</p><p className="text-xs text-[#64748B]">{device.companyArea || 'Área no definida'} · {device.agentVersion || 'Sin versión'}</p></td><td className="px-4 py-4 text-[#64748B]">{device.os || 'Sistema no especificado'}</td><td className="px-4 py-4"><StatusBadge status={device.status === 'online' ? 'Conectado' : 'Desconectado'} /></td><td className="px-4 py-4 text-[#64748B]">{formatDateTime(device.lastSeen)}</td><td className="px-4 py-4 font-semibold text-[#0F172A]">{deviceFiles.size}</td><td className="px-4 py-4 font-semibold text-[#0F172A]">{deviceRows.length}</td><td className="px-4 py-4 text-[#64748B]">{deviceRows.filter((row) => /sync|sincron/i.test(row.action || '')).length}</td><td className="px-4 py-4 text-[#64748B]">{deviceRows.filter((row) => /error|fall/i.test(row.action || '')).length}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><ToolbarButton tone="secondary" onClick={() => onDetail(device.id)}>Ver detalle</ToolbarButton>{device.status === 'online' ? <ToolbarButton tone="secondary" onClick={onSupport}><Wifi className="h-4 w-4" />Soporte</ToolbarButton> : <button disabled className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] px-3 py-2 text-xs font-semibold text-[#94A3B8]"><WifiOff className="h-4 w-4" /> Offline</button>}</div></td></tr>
          );
        })}
        empty={<EmptyState icon={Laptop} title="Aún no hay equipos registrados" description="Instala o inicia el agente autorizado para que cada equipo aparezca aquí con su actividad real." />}
      />
    </div>
  );
}
