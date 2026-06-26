import { useState, useEffect, useMemo } from 'react';
import { Activity, Download, CheckCircle2, TrendingUp, TrendingDown, AlertTriangle, MessageSquare, Server, X, Clock, Calendar, BarChart3, Zap, ZoomIn, ZoomOut, Eye, Wifi, WifiOff, FileText, ChevronRight, Star, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { useSimpleMode } from '../context/SimpleModeContext';

interface ExcelAuditLog {
  id: string;
  deviceId: string;
  fileName: string;
  sheetName: string;
  action: string;
  details: string;
  naturalText: string;
  createdAt: string;
}

interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline';
}

// ─── Helper: time ago in Spanish ───
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins} minuto${mins > 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} hora${hrs > 1 ? 's' : ''}`;
  return `Hace ${Math.floor(hrs / 24)} día${Math.floor(hrs / 24) > 1 ? 's' : ''}`;
}

// ─── Helper: extract amount from log details ───
function extractAmount(log: ExcelAuditLog): { amount: number; isVenta: boolean; isGasto: boolean } {
  let amount = 0;
  const isVenta = log.sheetName.toLowerCase().includes('venta');
  const isGasto = log.sheetName.toLowerCase().includes('gasto');

  if (log.action === 'add_row' || log.action === 'update_row') {
    try {
      const parsed = JSON.parse(log.details);
      const rawData = parsed.data || parsed;
      const amountKey = Object.keys(rawData).find(k =>
        ['monto', 'total', 'precio', 'valor', 'importe', 'ingreso'].some(w => k.toLowerCase().includes(w))
      );
      if (amountKey) {
        const val = parseFloat(rawData[amountKey]);
        if (!isNaN(val)) amount = val;
      }
    } catch {}
  }
  return { amount, isVenta, isGasto };
}

export function MonitoreoExcelView({ socket, devices = [] }: { socket: Socket | null; devices?: Device[] }) {
  const { isSimpleMode, fontSize, zoomIn, zoomOut, resetZoom, highContrast, toggleHighContrast } = useSimpleMode();
  const [logs, setLogs] = useState<ExcelAuditLog[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [lastSync, setLastSync] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'hoy' | 'ayer' | '7dias' | '30dias'>('hoy');
  const [showCalendar, setShowCalendar] = useState(false);
  const [eventsProcessed, setEventsProcessed] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const handleLog = (log: ExcelAuditLog) => {
      setLogs(prev => [log, ...prev]);
      setLastSync(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
      setLastSyncTime(Date.now());
      setEventsProcessed(prev => prev + 1);
    };
    socket.on('excel-audit-log', handleLog);
    return () => { socket.off('excel-audit-log', handleLog); };
  }, [socket]);

  // ─── Real KPIs from logs ───
  const metrics = useMemo(() => {
    let ventas = 0, gastos = 0, alertas = 0, ventasCount = 0, gastosCount = 0;
    logs.forEach(log => {
      const { amount, isVenta, isGasto } = extractAmount(log);
      if (amount > 0) {
        if (isVenta) { ventas += amount; ventasCount++; }
        else if (isGasto) { gastos += amount; gastosCount++; }
        else { ventas += amount; ventasCount++; }
      }
      if (log.action === 'Eliminación' || log.action === 'Advertencia') alertas++;
    });
    return { ventas, gastos, utilidad: ventas - gastos, alertas, ventasCount, gastosCount, totalChanges: logs.length };
  }, [logs]);

  // ─── Smart Notifications ───
  const smartNotifications = useMemo(() => {
    const notifs: { id: string; color: string; icon: string; text: string }[] = [];
    const now = Date.now();

    if (metrics.ventas > 0) {
      notifs.push({ id: 'ventas-up', color: 'text-green-400', icon: '🟢', text: `Se registraron ${metrics.ventasCount} ventas por un total de S/ ${metrics.ventas.toFixed(2)}.` });
    }
    if (metrics.alertas > 0) {
      notifs.push({ id: 'alertas', color: 'text-red-400', icon: '🔴', text: `Se detectaron ${metrics.alertas} incidencias de esquema o eliminaciones. Revisa la bitácora o la pestaña de alertas.` });
    }
    if (lastSyncTime > 0 && (now - lastSyncTime) > 2 * 60 * 60 * 1000) {
      notifs.push({ id: 'no-changes', color: 'text-yellow-400', icon: '🟡', text: 'No se detectan cambios en Excel desde hace más de 2 horas.' });
    }
    if (logs.length > 0) {
      const amounts = logs.map(l => extractAmount(l).amount).filter(a => a > 0);
      if (amounts.length > 0) {
        const maxAmount = Math.max(...amounts);
        notifs.push({ id: 'max-ingreso', color: 'text-blue-400', icon: '🔵', text: `El mayor registro del día fue de S/ ${maxAmount.toFixed(2)}.` });
      }
    }
    if (notifs.length === 0) {
      notifs.push({ id: 'all-ok', color: 'text-green-400', icon: '🟢', text: 'El esquema Excel es correcto y todo está funcionando sin novedades.' });
    }
    return notifs;
  }, [metrics, logs, lastSyncTime]);

  // ─── Top Activities ───
  const topActivities = useMemo(() => {
    const sheetCounts: Record<string, number> = {};
    const hourCounts: Record<number, number> = {};

    logs.forEach(log => {
      sheetCounts[log.sheetName] = (sheetCounts[log.sheetName] || 0) + 1;
      const hour = new Date(log.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const topSheet = Object.entries(sheetCounts).sort((a, b) => b[1] - a[1])[0];
    const topHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      topSheet: topSheet ? { name: topSheet[0], count: topSheet[1] } : null,
      topHour: topHour ? { hour: parseInt(topHour[0]), count: topHour[1] } : null,
      hourCounts,
    };
  }, [logs]);

  // ─── Activity Heatmap Data ───
  const activityBars = useMemo(() => {
    const bars: { hour: number; count: number; pct: number }[] = [];
    const maxCount = Math.max(1, ...Object.values(topActivities.hourCounts));
    for (let h = 6; h <= 22; h++) {
      const count = topActivities.hourCounts[h] || 0;
      bars.push({ hour: h, count, pct: (count / maxCount) * 100 });
    }
    return bars;
  }, [topActivities]);

  // ─── Online devices from props ───
  const onlineDevices = devices.filter(d => d.status === 'online');
  const totalDevices = devices.length || 3; // Fallback display

  // ─── General Status ───
  const generalStatus = useMemo(() => {
    if (metrics.alertas > 2) return { label: 'REQUIERE ATENCIÓN', color: 'bg-red-500/10 border-red-500', textColor: 'text-red-400', icon: AlertTriangle, iconBg: 'bg-red-500' };
    if (metrics.alertas > 0) return { label: 'ATENCIÓN MENOR', color: 'bg-yellow-500/10 border-yellow-500', textColor: 'text-yellow-400', icon: AlertTriangle, iconBg: 'bg-yellow-500' };
    return { label: 'TODO NORMAL', color: 'bg-emerald-500/10 border-emerald-500', textColor: 'text-emerald-400', icon: CheckCircle2, iconBg: 'bg-emerald-500' };
  }, [metrics]);

  // ─── Report generator ───
  const generateReportText = () => {
    let t = `RESUMEN DEL TURNO\n${'='.repeat(40)}\n\n`;
    t += `• Ventas registradas: S/ ${metrics.ventas.toFixed(2)}\n`;
    t += `• Gastos registrados: S/ ${metrics.gastos.toFixed(2)}\n`;
    t += `• Utilidad neta: S/ ${metrics.utilidad.toFixed(2)}\n`;
    t += `• Cambios detectados: ${logs.length}\n`;
    t += `• Alertas: ${metrics.alertas}\n\n`;
    t += `Resumen:\nDurante el turno se registraron ventas por S/ ${metrics.ventas.toFixed(2)}, gastos por S/ ${metrics.gastos.toFixed(2)} y se detectaron ${logs.length} modificaciones en los archivos monitoreados.\n`;
    if (metrics.alertas === 0) t += `No se encontraron incidencias críticas.\n`;
    else t += `Se encontraron ${metrics.alertas} incidencias que requieren revisión.\n`;
    t += `\nBITÁCORA DETALLADA:\n${'-'.repeat(40)}\n`;
    [...logs].reverse().forEach(log => {
      const time = new Date(log.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      t += `${time} - ${log.naturalText}\n`;
    });
    return t;
  };

  const downloadReport = (format: 'txt' | 'pdf' | 'excel') => {
    const text = generateReportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Turno_${new Date().toISOString().split('T')[0]}.${format === 'txt' ? 'txt' : format === 'excel' ? 'csv' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowPreview(false);
  };

  const cardBase = 'bg-white dark:bg-[#111] border-2 border-gray-200 dark:border-gray-700/80 rounded-2xl shadow-lg';

  return (
    <div className={`w-full min-h-screen bg-bg-base transition-all duration-300 ${highContrast ? 'high-contrast' : ''}`}>
      <div className="max-w-[1600px] mx-auto p-5 md:p-8 space-y-6">

        {/* ═══ Accessibility Toolbar ═══ */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">Centro de Control</h1>
          <div className="flex items-center gap-2">
            <button onClick={zoomOut} className="p-2 rounded-xl bg-surface-elevated border border-surface-border hover:bg-surface-highlight transition-colors" title="Reducir texto">
              <ZoomOut className="w-5 h-5 text-text-secondary" />
            </button>
            <span className="text-sm font-bold text-text-tertiary min-w-[40px] text-center">{fontSize}px</span>
            <button onClick={zoomIn} className="p-2 rounded-xl bg-surface-elevated border border-surface-border hover:bg-surface-highlight transition-colors" title="Ampliar texto">
              <ZoomIn className="w-5 h-5 text-text-secondary" />
            </button>
            <button onClick={toggleHighContrast} className={`p-2 rounded-xl border transition-colors ${highContrast ? 'bg-brand/20 border-brand text-brand' : 'bg-surface-elevated border-surface-border text-text-secondary hover:bg-surface-highlight'}`} title="Alto contraste">
              <Eye className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ═══ 1. ESTADO GENERAL DEL NEGOCIO ═══ */}
        <div className={`w-full ${generalStatus.color} border-2 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between shadow-xl transition-colors`}>
          <div className="flex items-center gap-5 md:gap-6">
            <div className={`w-16 h-16 md:w-20 md:h-20 ${generalStatus.iconBg} rounded-full flex items-center justify-center shrink-0 shadow-lg`}>
              <generalStatus.icon className="w-10 h-10 md:w-12 md:h-12 text-white" />
            </div>
            <div>
              <h2 className="text-3xl md:text-5xl font-black text-text-primary tracking-tight">{generalStatus.label}</h2>
              <p className={`${generalStatus.textColor} font-bold mt-1 text-lg md:text-xl uppercase tracking-wide`}>Negocio operando {metrics.alertas === 0 ? 'correctamente' : 'con observaciones'}</p>
            </div>
          </div>
          <div className="flex gap-8 md:gap-12 mt-4 md:mt-0">
            <div className="text-center md:text-right">
              <p className="text-text-tertiary font-bold uppercase text-xs tracking-wider">Ventas Hoy</p>
              <p className="text-2xl md:text-3xl font-black text-text-primary">S/ {metrics.ventas.toFixed(0)}</p>
            </div>
            <div className="text-center md:text-right">
              <p className="text-text-tertiary font-bold uppercase text-xs tracking-wider">Máquinas</p>
              <p className="text-2xl md:text-3xl font-black text-text-primary">{onlineDevices.length}<span className="text-text-tertiary">/{totalDevices}</span></p>
            </div>
            <div className="text-center md:text-right">
              <p className="text-text-tertiary font-bold uppercase text-xs tracking-wider">Alertas</p>
              <p className={`text-2xl md:text-3xl font-black ${metrics.alertas > 0 ? 'text-red-400' : 'text-text-primary'}`}>{metrics.alertas}</p>
            </div>
          </div>
        </div>

        {/* ═══ Smart Notifications Bar ═══ */}
        <div className={`${cardBase} p-4 md:p-5`}>
          <div className="flex items-center gap-3 mb-3">
            <Zap className="w-5 h-5 text-brand" />
            <h3 className="font-bold text-text-secondary uppercase text-sm tracking-wider">Notificaciones Inteligentes</h3>
          </div>
          <div className="space-y-2">
            {smartNotifications.map(n => (
              <div key={n.id} className="flex items-center gap-3 p-3 bg-surface-elevated/50 rounded-xl">
                <span className="text-xl shrink-0">{n.icon}</span>
                <span className={`font-semibold text-base ${n.color}`}>{n.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ KPIs Row ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[
            { label: 'Ventas Hoy', value: metrics.ventas, prefix: 'S/ ', icon: TrendingUp, color: 'text-emerald-500', count: metrics.ventasCount },
            { label: 'Gastos Hoy', value: metrics.gastos, prefix: 'S/ ', icon: TrendingDown, color: 'text-red-500', count: metrics.gastosCount },
            { label: 'Utilidad', value: metrics.utilidad, prefix: 'S/ ', icon: Activity, color: 'text-brand', count: null },
            { label: 'Alertas', value: metrics.alertas, prefix: '', icon: AlertTriangle, color: metrics.alertas > 0 ? 'text-red-500' : 'text-yellow-500', count: null },
          ].map((kpi, i) => (
            <div key={i} className={`${cardBase} p-5 md:p-6 ${i === 3 && metrics.alertas > 0 ? '!border-red-500 !bg-red-500/5' : ''}`}>
              <div className={`flex items-center gap-2 ${kpi.color} mb-3`}>
                <kpi.icon className="w-6 h-6" />
                <h3 className="font-bold uppercase text-sm text-text-tertiary">{kpi.label}</h3>
              </div>
              <p className="text-3xl md:text-4xl font-black text-text-primary">
                {kpi.prefix && <span className="text-xl text-text-tertiary">{kpi.prefix}</span>}
                {typeof kpi.value === 'number' && kpi.prefix ? kpi.value.toFixed(2) : kpi.value}
              </p>
              {kpi.count !== null && kpi.count > 0 && (
                <p className="text-sm text-text-tertiary mt-2 font-semibold">{kpi.count} registros</p>
              )}
            </div>
          ))}
        </div>

        {/* ═══ Main Grid: Bitácora + Sidebar ═══ */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left 2/3: Bitácora + Activity Map */}
          <div className="xl:col-span-2 space-y-6">

            {/* ═══ Bitácora WhatsApp ═══ */}
            <div className={`${cardBase} p-6 md:p-8`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl md:text-2xl font-black text-text-primary flex items-center gap-3 uppercase">
                  <MessageSquare className="w-7 h-7 text-brand" />
                  Bitácora en Vivo
                </h2>
                {logs.length > 0 && <span className="text-sm font-bold text-text-tertiary bg-surface-elevated px-3 py-1 rounded-full">{logs.length} eventos</span>}
              </div>

              {logs.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-surface-elevated flex items-center justify-center">
                    <MessageSquare className="w-10 h-10 text-text-tertiary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-text-primary mb-2">Sin actividad todavía</p>
                    <p className="text-text-secondary max-w-md mx-auto leading-relaxed">
                      No se han detectado cambios todavía. El sistema está monitoreando el Excel y mostrará actividad automáticamente cuando se guarden cambios.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-500 bg-emerald-500/10 px-4 py-2 rounded-full mt-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-sm">Escuchando cambios...</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-2">
                  {logs.map(log => {
                    const isVenta = log.sheetName.toLowerCase().includes('venta');
                    const isGasto = log.sheetName.toLowerCase().includes('gasto');
                    const isDelete = log.action === 'delete_row';
                    const dotColor = isDelete ? 'bg-red-500' : isVenta ? 'bg-emerald-500' : isGasto ? 'bg-orange-500' : 'bg-blue-500';
                    const emoji = isDelete ? '🔴' : isVenta ? '🟢' : isGasto ? '🟠' : '🔵';

                    return (
                      <div key={log.id} className="flex gap-4 items-start p-4 bg-surface-elevated/40 rounded-xl border border-surface-border/50 hover:bg-surface-elevated transition-colors">
                        <div className={`w-3.5 h-3.5 mt-2 rounded-full shrink-0 ${dotColor} shadow-lg`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-3">
                            <span className="font-bold text-text-tertiary text-sm shrink-0">
                              {new Date(log.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-base md:text-lg font-bold text-text-primary truncate">
                              {isSimpleMode
                                ? (isDelete ? 'Se eliminó un registro' : isVenta ? 'Nueva venta registrada' : isGasto ? 'Nuevo gasto registrado' : 'Inventario actualizado')
                                : (log.naturalText || (log.action === 'add_row' ? 'Nuevo registro añadido' : 'Dato modificado'))}
                            </span>
                          </div>
                          {!isSimpleMode && (
                            <p className="text-xs text-text-tertiary mt-1 font-mono">{log.fileName} → {log.sheetName}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═══ Activity Heatmap ═══ */}
            {!isSimpleMode && logs.length > 0 && (
              <div className={`${cardBase} p-6`}>
                <h3 className="font-bold text-text-secondary uppercase text-sm tracking-wider mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-brand" />
                  Mapa de Actividad del Día
                </h3>
                <div className="flex items-end gap-1.5 h-20">
                  {activityBars.map(bar => (
                    <div key={bar.hour} className="flex-1 flex flex-col items-center gap-1" title={`${bar.hour}:00 — ${bar.count} eventos`}>
                      <div className="w-full bg-brand/20 rounded-t-sm relative" style={{ height: '60px' }}>
                        <div className="absolute bottom-0 w-full bg-brand rounded-t-sm transition-all duration-500" style={{ height: `${Math.max(bar.pct, 4)}%` }} />
                      </div>
                      <span className="text-[10px] text-text-tertiary font-mono">{bar.hour}</span>
                    </div>
                  ))}
                </div>
                {topActivities.topHour && (
                  <p className="text-sm text-text-tertiary mt-3">
                    Mayor actividad a las <span className="font-bold text-text-primary">{topActivities.topHour.hour}:00</span> con {topActivities.topHour.count} eventos.
                  </p>
                )}
              </div>
            )}

            {/* ═══ Top Activities ═══ */}
            {!isSimpleMode && logs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${cardBase} p-5`}>
                  <h4 className="font-bold text-text-tertiary uppercase text-xs tracking-wider mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-brand" /> Hoja Más Modificada
                  </h4>
                  {topActivities.topSheet ? (
                    <div>
                      <p className="text-xl font-black text-text-primary">{topActivities.topSheet.name}</p>
                      <p className="text-sm text-text-tertiary">{topActivities.topSheet.count} modificaciones</p>
                    </div>
                  ) : <p className="text-text-tertiary">Sin datos</p>}
                </div>
                <div className={`${cardBase} p-5`}>
                  <h4 className="font-bold text-text-tertiary uppercase text-xs tracking-wider mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand" /> Hora Pico
                  </h4>
                  {topActivities.topHour ? (
                    <div>
                      <p className="text-xl font-black text-text-primary">{topActivities.topHour.hour}:00 hrs</p>
                      <p className="text-sm text-text-tertiary">{topActivities.topHour.count} eventos en esa hora</p>
                    </div>
                  ) : <p className="text-text-tertiary">Sin datos</p>}
                </div>
              </div>
            )}
          </div>

          {/* Right 1/3: Sidebar panels */}
          <div className="space-y-6 flex flex-col">

            {/* ═══ System Health ═══ */}
            <div className={`${cardBase} p-5`}>
              <h3 className="font-bold text-text-tertiary uppercase text-xs tracking-wider mb-4 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-500" /> Salud del Sistema
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary font-semibold">Estado Excel</span>
                  <span className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Conectado ✅
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary font-semibold">Estado Servidor</span>
                  <span className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Conectado ✅
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary font-semibold">Última sincronización</span>
                  <span className="font-bold text-text-primary text-sm">{lastSync || 'Esperando...'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary font-semibold">Eventos hoy</span>
                  <span className="font-black text-text-primary text-lg">{eventsProcessed}</span>
                </div>
              </div>
            </div>

            {/* ═══ Machines Status ═══ */}
            <div className={`${cardBase} p-5`}>
              <h3 className="font-bold text-text-tertiary uppercase text-xs tracking-wider mb-4 flex items-center gap-2">
                <Server className="w-4 h-4" /> Estado de Equipos
              </h3>
              {devices.length === 0 ? (
                <p className="text-text-tertiary text-sm py-4 text-center">Los equipos aparecerán cuando se conecten al sistema.</p>
              ) : (
                <div className="space-y-2">
                  {devices.map(dev => (
                    <div key={dev.id} className="flex items-center justify-between p-3 bg-surface-elevated/50 rounded-xl border border-surface-border/50">
                      <span className="font-bold text-text-primary">{dev.name}</span>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${dev.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${dev.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {dev.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ═══ Generate Report Button ═══ */}
            <button
              onClick={() => setShowPreview(true)}
              className="w-full bg-brand hover:bg-brand-dark text-white font-black text-xl md:text-2xl py-6 md:py-8 rounded-2xl shadow-[0_8px_30px_rgba(255,107,53,0.35)] hover:shadow-[0_12px_40px_rgba(255,107,53,0.45)] transition-all active:scale-[0.97] border-b-[6px] border-orange-700 flex flex-col items-center justify-center gap-2"
            >
              <Download className="w-10 h-10" />
              GENERAR REPORTE DEL TURNO
            </button>

            {/* ═══ Report Calendar ═══ */}
            <div className={`${cardBase} p-5`}>
              <h3 className="font-bold text-text-tertiary uppercase text-xs tracking-wider mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand" /> Reportes Históricos
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Reporte de Hoy', date: new Date().toLocaleDateString('es-CO'), period: 'hoy' as const },
                  { label: 'Reporte de Ayer', date: new Date(Date.now() - 86400000).toLocaleDateString('es-CO'), period: 'ayer' as const },
                  { label: 'Últimos 7 días', date: '', period: '7dias' as const },
                  { label: 'Últimos 30 días', date: '', period: '30dias' as const },
                ].map(item => (
                  <button
                    key={item.period}
                    onClick={() => { setSelectedPeriod(item.period); setShowCalendar(true); }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors hover:bg-surface-elevated ${selectedPeriod === item.period && showCalendar ? 'border-brand bg-brand/5' : 'border-surface-border/50'}`}
                  >
                    <div className="text-left">
                      <p className="font-bold text-text-primary text-sm">{item.label}</p>
                      {item.date && <p className="text-xs text-text-tertiary">{item.date}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary" />
                  </button>
                ))}
              </div>
            </div>

            {/* ═══ AI Assistant Compact ═══ */}
            <div className="bg-brand/5 border-2 border-brand/20 rounded-2xl p-5 shadow-lg">
              <h3 className="font-bold text-brand uppercase text-sm tracking-wider mb-4 flex items-center gap-2">
                <span className="text-xl">🤖</span> Asistente: Resumen
              </h3>
              <ul className="space-y-2 text-sm font-medium text-text-primary">
                <li className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" /> Ventas: {metrics.ventasCount} registros por S/ {metrics.ventas.toFixed(2)}</li>
                <li className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500 shrink-0" /> Gastos: {metrics.gastosCount} registros por S/ {metrics.gastos.toFixed(2)}</li>
                <li className="flex items-center gap-2"><Activity className="w-4 h-4 text-blue-500 shrink-0" /> Cambios detectados: {logs.length}</li>
                <li className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" /> Incidencias: {metrics.alertas}</li>
                <li className="mt-3 pt-3 border-t border-brand/20 font-black text-brand flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> ESTADO: {metrics.alertas === 0 ? 'NORMAL ✅' : 'REVISIÓN ⚠️'}
                </li>
              </ul>
            </div>

          </div>
        </div>
      </div>

      {/* ═══ Report Preview Modal ═══ */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowPreview(false)}>
          <div className="bg-white dark:bg-[#111] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border-2 border-gray-200 dark:border-gray-700 animate-slide-up">
            <div className="p-6 md:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl md:text-3xl font-black text-text-primary uppercase">Vista Previa del Reporte</h2>
                <button onClick={() => setShowPreview(false)} className="p-2 bg-surface-elevated rounded-full hover:bg-surface-highlight transition-colors">
                  <X className="w-7 h-7 text-text-tertiary" />
                </button>
              </div>

              {/* Summary cards inside modal */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-surface-elevated rounded-xl p-4 text-center">
                  <p className="text-xs text-text-tertiary font-bold uppercase">Ventas</p>
                  <p className="text-xl font-black text-emerald-500">S/ {metrics.ventas.toFixed(2)}</p>
                </div>
                <div className="bg-surface-elevated rounded-xl p-4 text-center">
                  <p className="text-xs text-text-tertiary font-bold uppercase">Gastos</p>
                  <p className="text-xl font-black text-red-500">S/ {metrics.gastos.toFixed(2)}</p>
                </div>
                <div className="bg-surface-elevated rounded-xl p-4 text-center">
                  <p className="text-xs text-text-tertiary font-bold uppercase">Cambios</p>
                  <p className="text-xl font-black text-text-primary">{logs.length}</p>
                </div>
                <div className="bg-surface-elevated rounded-xl p-4 text-center">
                  <p className="text-xs text-text-tertiary font-bold uppercase">Alertas</p>
                  <p className="text-xl font-black text-text-primary">{metrics.alertas}</p>
                </div>
              </div>

              {/* Natural language summary */}
              <div className="bg-brand/5 border border-brand/20 rounded-xl p-4 mb-6">
                <p className="text-base text-text-primary font-medium leading-relaxed">
                  Durante el turno se registraron ventas por <strong>S/ {metrics.ventas.toFixed(2)}</strong>, 
                  gastos por <strong>S/ {metrics.gastos.toFixed(2)}</strong> y se detectaron <strong>{logs.length} modificaciones</strong> en 
                  los archivos monitoreados. {metrics.alertas === 0 ? 'No se encontraron incidencias críticas.' : `Se encontraron ${metrics.alertas} incidencias.`}
                </p>
              </div>

              {/* Full report preview */}
              <div className="bg-surface-elevated p-4 rounded-xl border border-surface-border mb-6 max-h-[25vh] overflow-y-auto custom-scrollbar">
                <pre className="whitespace-pre-wrap text-sm text-text-secondary font-mono">{generateReportText()}</pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button onClick={() => downloadReport('txt')} className="py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold rounded-xl text-base hover:opacity-90 transition-opacity">
                  📄 Descargar TXT
                </button>
                <button onClick={() => downloadReport('pdf')} className="py-4 bg-red-600 text-white font-bold rounded-xl text-base hover:opacity-90 transition-opacity">
                  📕 Exportar PDF
                </button>
                <button onClick={() => downloadReport('excel')} className="py-4 bg-emerald-600 text-white font-bold rounded-xl text-base hover:opacity-90 transition-opacity">
                  📊 Exportar Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Historical Report Modal ═══ */}
      {showCalendar && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setShowCalendar(false)}>
          <div className="bg-white dark:bg-[#111] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border-2 border-gray-200 dark:border-gray-700 animate-slide-up">
            <div className="p-6 md:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-text-primary uppercase">
                  {selectedPeriod === 'hoy' ? 'Reporte de Hoy' : selectedPeriod === 'ayer' ? 'Reporte de Ayer' : selectedPeriod === '7dias' ? 'Últimos 7 Días' : 'Últimos 30 Días'}
                </h2>
                <button onClick={() => setShowCalendar(false)} className="p-2 bg-surface-elevated rounded-full hover:bg-surface-highlight transition-colors">
                  <X className="w-7 h-7 text-text-tertiary" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="bg-surface-elevated rounded-xl p-5 text-center">
                  <p className="text-text-tertiary font-bold uppercase text-xs mb-2">Período</p>
                  <p className="text-lg font-black text-text-primary">
                    {selectedPeriod === 'hoy' ? new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) :
                     selectedPeriod === 'ayer' ? new Date(Date.now() - 86400000).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) :
                     selectedPeriod === '7dias' ? 'Última semana' : 'Último mes'}
                  </p>
                </div>
                <div className="bg-brand/5 border border-brand/20 rounded-xl p-5">
                  <p className="text-text-secondary font-medium leading-relaxed">
                    {selectedPeriod === 'hoy' 
                      ? `Hoy se han registrado ${logs.length} cambios. Ventas: S/ ${metrics.ventas.toFixed(2)}, Gastos: S/ ${metrics.gastos.toFixed(2)}.`
                      : 'Los reportes históricos estarán disponibles cuando el servidor tenga conexión a la base de datos. Los datos del día actual se muestran en tiempo real.'}
                  </p>
                </div>
                <button onClick={() => setShowCalendar(false)} className="w-full py-3 bg-brand text-white font-bold rounded-xl hover:bg-brand-dark transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
