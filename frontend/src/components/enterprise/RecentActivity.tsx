import { ArrowRight, FileText } from 'lucide-react';
import { formatDateTime } from '../../services/enterpriseApi';
import type { DriveChange, EnterpriseNotification } from '../../services/enterpriseApi';
import { EmptyState, SectionCard, StatusBadge, ToolbarButton } from './EnterpriseUI';

export function RecentActivity({ changes, notifications, onViewAll }: { changes: DriveChange[]; notifications: EnterpriseNotification[]; onViewAll?: () => void }) {
  const items = [
    ...changes.slice(0, 6).map((change) => ({
      id: `change-${change.id}`,
      date: change.detectedAt,
      type: change.changeType || 'Cambio detectado',
      title: change.document?.name || 'Documento modificado',
      detail: `${change.sheet?.name || 'Hoja'} · ${change.fieldName || 'Fila'} · ${change.previousValue || 'Sin valor'} -> ${change.newValue || 'Sin valor'}`,
      status: change.importance || 'Pendiente',
    })),
    ...notifications.slice(0, 4).map((notification) => ({
      id: `notification-${notification.id}`,
      date: notification.createdAt,
      type: notification.type || 'Alerta',
      title: notification.title || 'Notificación empresarial',
      detail: notification.message || 'Sin descripción adicional.',
      status: notification.priority || notification.importance || (notification.read ? 'Revisada' : 'Nueva'),
    })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 8);

  return (
    <SectionCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">Actividad reciente</h2>
          <p className="text-sm text-[#64748B]">Cambios, alertas y eventos relevantes detectados por el sistema.</p>
        </div>
        {onViewAll && <ToolbarButton tone="secondary" onClick={onViewAll}>Ver todo <ArrowRight className="h-4 w-4" /></ToolbarButton>}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={FileText} title="Sin actividad reciente" description="Cuando Google Drive procese documentos o detecte cambios, aparecerán aquí los eventos relevantes." />
      ) : (
        <div className="divide-y divide-[#E2E8F0]">
          {items.map((item) => (
            <div key={item.id} className="grid gap-3 py-4 md:grid-cols-[140px_1fr_auto] md:items-center">
              <p className="text-xs font-semibold text-[#64748B]">{formatDateTime(item.date)}</p>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0F172A]">{item.type}</p>
                <p className="mt-1 truncate text-sm text-[#64748B]">{item.title} · {item.detail}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
