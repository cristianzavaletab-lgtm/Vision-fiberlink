import nodemailer from 'nodemailer';
import cron from 'node-cron';

type ScheduledTask = ReturnType<typeof cron.schedule>;

// ═══════════════════════════════════════════════════════════════════
// Email Report Service - Sends scheduled activity reports via SMTP
// ═══════════════════════════════════════════════════════════════════

interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  recipients: string[];
  schedule: string; // cron expression
  reportType: 'daily' | 'weekly';
}

// Default config (overridden by env vars or API)
let emailConfig: EmailConfig = {
  enabled: false,
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'VisionControl <noreply@visioncontrol.app>',
  recipients: (process.env.REPORT_RECIPIENTS || '').split(',').filter(Boolean),
  schedule: process.env.REPORT_SCHEDULE || '0 18 * * 1-5', // Default: 6PM weekdays
  reportType: 'daily',
};

let transporter: nodemailer.Transporter | null = null;
let cronJob: ScheduledTask | null = null;

// Data getter functions (injected from index.ts)
let getReportData: (() => any) | null = null;

export function setReportDataGetter(fn: () => any) {
  getReportData = fn;
}

export function getEmailConfig(): EmailConfig {
  return { ...emailConfig };
}

export function updateEmailConfig(partial: Partial<EmailConfig>): EmailConfig {
  emailConfig = { ...emailConfig, ...partial };
  
  // Recreate transporter if credentials changed
  if (partial.host || partial.port || partial.user || partial.pass) {
    createTransporter();
  }
  
  // Reschedule if schedule changed
  if (partial.schedule || partial.enabled !== undefined) {
    scheduleCronJob();
  }
  
  return emailConfig;
}

function createTransporter() {
  if (!emailConfig.user || !emailConfig.pass) {
    transporter = null;
    return;
  }
  
  transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: {
      user: emailConfig.user,
      pass: emailConfig.pass,
    },
  });
  
  console.log(`[Email] Transporter configurado: ${emailConfig.host}:${emailConfig.port} (user: ${emailConfig.user})`);
}

function scheduleCronJob() {
  // Stop existing job
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  
  if (!emailConfig.enabled || !emailConfig.schedule) {
    console.log('[Email] Reportes por email desactivados');
    return;
  }
  
  if (!cron.validate(emailConfig.schedule)) {
    console.error(`[Email] Expresion cron invalida: ${emailConfig.schedule}`);
    return;
  }
  
  cronJob = cron.schedule(emailConfig.schedule, async () => {
    console.log('[Email] Ejecutando reporte programado...');
    await sendScheduledReport();
  });
  
  console.log(`[Email] Reporte programado: "${emailConfig.schedule}" -> ${emailConfig.recipients.join(', ')}`);
}

export async function sendScheduledReport(): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    return { success: false, error: 'SMTP no configurado' };
  }
  
  if (emailConfig.recipients.length === 0) {
    return { success: false, error: 'Sin destinatarios configurados' };
  }
  
  if (!getReportData) {
    return { success: false, error: 'Funcion de datos no configurada' };
  }
  
  try {
    const data = getReportData();
    const html = generateReportHTML(data);
    
    const info = await transporter.sendMail({
      from: emailConfig.from,
      to: emailConfig.recipients.join(', '),
      subject: `VisionControl - Reporte ${emailConfig.reportType === 'daily' ? 'Diario' : 'Semanal'} - ${new Date().toLocaleDateString('es-CO')}`,
      html,
    });
    
    console.log(`[Email] Reporte enviado: ${info.messageId}`);
    return { success: true };
  } catch (err: any) {
    console.error('[Email] Error enviando reporte:', err.message);
    return { success: false, error: err.message };
  }
}

export async function sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
  if (!transporter) {
    return { success: false, error: 'SMTP no configurado. Configura host, user y pass primero.' };
  }
  
  try {
    await transporter.sendMail({
      from: emailConfig.from,
      to,
      subject: 'VisionControl - Email de Prueba',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #FF6B35; margin: 0; font-size: 24px;">VisionControl</h1>
            <p style="color: #666; margin-top: 8px;">Email de prueba</p>
          </div>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; border: 1px solid #e9ecef;">
            <p style="margin: 0; color: #333;">Este es un email de prueba para verificar que la configuracion SMTP es correcta.</p>
            <p style="margin: 16px 0 0; color: #666; font-size: 13px;">Si recibes este mensaje, los reportes automaticos estan listos para funcionar.</p>
          </div>
          <p style="text-align: center; color: #999; font-size: 11px; margin-top: 30px;">
            Enviado desde VisionControl &bull; ${new Date().toLocaleString('es-CO')}
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function generateReportHTML(data: any): string {
  const { devices, activities, appSessions, bootSessions, incidents, summary } = data;
  
  const onlineCount = devices?.filter((d: any) => d.status === 'online').length || 0;
  const totalDevices = devices?.length || 0;
  
  // Top apps by time
  const appUsage: Record<string, number> = {};
  for (const session of (appSessions || [])) {
    const duration = session.duration || 0;
    if (!appUsage[session.appName]) appUsage[session.appName] = 0;
    appUsage[session.appName] += duration;
  }
  const topApps = Object.entries(appUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
  <div style="background: #1a1a2e; border-radius: 16px 16px 0 0; padding: 30px; text-align: center;">
    <h1 style="color: #FF6B35; margin: 0; font-size: 28px; font-weight: 800;">VisionControl</h1>
    <p style="color: #a0a0b0; margin: 8px 0 0; font-size: 14px;">Reporte de Actividad - ${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>
  
  <div style="background: white; padding: 30px; border: 1px solid #e0e0e0;">
    <!-- Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td style="background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
          <div style="font-size: 24px; font-weight: 800; color: #10b981;">${onlineCount}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">Online</div>
        </td>
        <td style="width: 8px;"></td>
        <td style="background: #fef3f2; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
          <div style="font-size: 24px; font-weight: 800; color: #ef4444;">${totalDevices - onlineCount}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">Offline</div>
        </td>
        <td style="width: 8px;"></td>
        <td style="background: #fff7ed; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
          <div style="font-size: 24px; font-weight: 800; color: #f59e0b;">${incidents?.length || 0}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">Alertas</div>
        </td>
        <td style="width: 8px;"></td>
        <td style="background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center; width: 25%;">
          <div style="font-size: 24px; font-weight: 800; color: #3b82f6;">${activities?.length || 0}</div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">Actividades</div>
        </td>
      </tr>
    </table>

    <!-- Top Apps -->
    ${topApps.length > 0 ? `
    <h3 style="font-size: 14px; color: #333; margin: 24px 0 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Apps Mas Usadas</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
      ${topApps.map(([app, seconds], i) => `
      <tr style="border-bottom: 1px solid #f5f5f5;">
        <td style="padding: 8px 0; color: #333; font-weight: 500;">${i + 1}. ${app}</td>
        <td style="padding: 8px 0; color: #666; text-align: right;">${formatDuration(seconds as number)}</td>
      </tr>
      `).join('')}
    </table>
    ` : ''}

    <!-- Boot Sessions -->
    ${bootSessions && bootSessions.length > 0 ? `
    <h3 style="font-size: 14px; color: #333; margin: 24px 0 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Sesiones de Equipo</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 13px;">
      <tr style="background: #f8f9fa;">
        <th style="padding: 8px; text-align: left; font-size: 11px; color: #666;">Equipo</th>
        <th style="padding: 8px; text-align: left; font-size: 11px; color: #666;">Encendido</th>
        <th style="padding: 8px; text-align: right; font-size: 11px; color: #666;">Duracion</th>
      </tr>
      ${bootSessions.slice(0, 10).map((b: any) => `
      <tr style="border-bottom: 1px solid #f5f5f5;">
        <td style="padding: 8px; color: #333;">${b.deviceName}</td>
        <td style="padding: 8px; color: #666;">${new Date(b.bootAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
        <td style="padding: 8px; color: #FF6B35; text-align: right; font-weight: 600;">${b.totalSeconds ? formatDuration(b.totalSeconds) : 'Activo'}</td>
      </tr>
      `).join('')}
    </table>
    ` : ''}

    <!-- Recent Incidents -->
    ${incidents && incidents.length > 0 ? `
    <h3 style="font-size: 14px; color: #333; margin: 24px 0 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">Incidentes Recientes</h3>
    ${incidents.slice(0, 5).map((inc: any) => `
    <div style="background: #fef3f2; border-radius: 8px; padding: 12px; margin-bottom: 8px; border-left: 3px solid #ef4444;">
      <div style="font-size: 12px; font-weight: 600; color: #333;">${inc.description}</div>
      <div style="font-size: 11px; color: #666; margin-top: 4px;">${inc.deviceName || ''} &bull; ${new Date(inc.date).toLocaleTimeString('es-CO')}</div>
    </div>
    `).join('')}
    ` : ''}
  </div>

  <div style="background: #1a1a2e; border-radius: 0 0 16px 16px; padding: 20px; text-align: center;">
    <p style="color: #a0a0b0; font-size: 11px; margin: 0;">
      Generado automaticamente por VisionControl &bull; ${new Date().toLocaleString('es-CO')}
    </p>
  </div>
</body>
</html>
  `;
}

// Initialize on import
export function initEmailService() {
  createTransporter();
  scheduleCronJob();
  console.log(`[Email] Servicio inicializado (enabled: ${emailConfig.enabled})`);
}
