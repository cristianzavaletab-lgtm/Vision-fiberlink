import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { DriveSyncService } from '../services/driveSync.service';
import { buildEnterpriseReport, getFinanceSummary, groupByField, listFinancialRecords, parseDateRange, reportDateRange } from '../services/finance/financeReports';

type EmitFn = (event: string, payload: unknown) => void;

const documentSchema = z.object({ googleFileId: z.string().optional(), url: z.string().optional(), name: z.string().optional() }).refine((value) => value.googleFileId || value.url, 'googleFileId or url required');
const noteSchema = z.object({ financialRecordId: z.string().optional(), documentId: z.string().optional(), sheetId: z.string().optional(), note: z.string().min(1).max(2000) });
const reportSchema = z.object({ type: z.enum(['daily', 'weekly', 'monthly', 'custom']).default('daily'), from: z.string().optional(), to: z.string().optional() });

export function createEnterpriseRoutes(prisma: PrismaClient | null, emit: EmitFn) {
  const router = Router();
  if (!prisma) {
    router.use((_req, res) => res.status(503).json({ error: 'Database unavailable. Configure DATABASE_URL to use enterprise finance monitoring.' }));
    return router;
  }

  const driveSync = new DriveSyncService(prisma, emit);
  const tenant = (req: any) => req.user?.companyId || 'default';

  router.get('/drive/status', async (req, res, next) => { try { res.json(await driveSync.status(tenant(req))); } catch (error) { next(error); } });
  router.post('/drive/sync', async (req, res, next) => { try { res.status(202).json(await driveSync.syncNow(tenant(req))); } catch (error) { next(error); } });
  router.post('/drive/documents', async (req, res, next) => {
    try {
      const parsed = documentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', fields: parsed.error.flatten().fieldErrors });
      res.status(201).json(await driveSync.addDocument(tenant(req), parsed.data));
    } catch (error) { next(error); }
  });
  router.get('/drive/documents', async (req, res, next) => {
    try {
      const page = Math.max(Number(req.query.page || 1), 1);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);
      const where: any = { tenantId: tenant(req) };
      if (req.query.status) where.status = String(req.query.status);
      const [total, rows] = await Promise.all([
        prisma.driveDocument.count({ where }),
        prisma.driveDocument.findMany({ where, include: { sheets: true }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      res.json({ page, pageSize, total, rows });
    } catch (error) {
      console.error('[EnterpriseRoutes] drive documents fallback:', error instanceof Error ? error.message : error);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);
      const rows = driveSync.configuredDocuments().filter((document) => !req.query.status || document.status === String(req.query.status)).slice(0, pageSize);
      res.json({ page: 1, pageSize, total: rows.length, rows });
    }
  });
  router.get('/drive/documents/:id', async (req, res, next) => {
    try {
      const document = await prisma.driveDocument.findFirst({ where: { id: req.params.id, tenantId: tenant(req) }, include: { sheets: true } });
      if (!document) return res.status(404).json({ error: 'Document not found' });
      res.json(document);
    } catch (error) { next(error); }
  });
  router.get('/drive/documents/:id/sheets', async (req, res, next) => {
    try { res.json(await prisma.driveSheet.findMany({ where: { documentId: req.params.id, tenantId: tenant(req) }, orderBy: { sourceIndex: 'asc' } })); } catch (error) { next(error); }
  });
  router.patch('/drive/sheets/:id/category', async (req, res, next) => {
    try {
      const category = String(req.body.category || '').toUpperCase();
      if (!['INCOME', 'EXPENSE', 'OPERATIONS', 'UNCLASSIFIED'].includes(category)) return res.status(400).json({ error: 'Invalid category' });
      res.json(await prisma.driveSheet.update({ where: { id: req.params.id }, data: { manualCategory: category, category } }));
    } catch (error) { next(error); }
  });
  router.get('/drive/changes', async (req, res, next) => {
    try {
      const page = Math.max(Number(req.query.page || 1), 1);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);
      const where: any = { tenantId: tenant(req) };
      if (req.query.type) where.changeType = String(req.query.type);
      const [total, rows] = await Promise.all([
        prisma.rowChange.count({ where }),
        prisma.rowChange.findMany({ where, include: { document: true, sheet: true }, orderBy: { detectedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      res.json({ page, pageSize, total, rows });
    } catch (error) { next(error); }
  });

  router.get('/finance/summary', async (req, res, next) => { try { res.json(await getFinanceSummary(prisma, tenant(req))); } catch (error) { next(error); } });
  router.get('/finance/incomes', async (req, res, next) => { try { res.json(await listFinancialRecords(prisma, tenant(req), 'INCOME', req.query)); } catch (error) { next(error); } });
  router.get('/finance/expenses', async (req, res, next) => { try { res.json(await listFinancialRecords(prisma, tenant(req), 'EXPENSE', req.query)); } catch (error) { next(error); } });
  router.get('/finance/purchases', async (req, res, next) => { try { res.json(await listFinancialRecords(prisma, tenant(req), 'PURCHASE', req.query)); } catch (error) { next(error); } });
  router.get('/finance/categories', async (req, res, next) => { try { res.json(await groupByField(prisma, tenant(req), 'category', req.query)); } catch (error) { next(error); } });
  router.get('/finance/providers', async (req, res, next) => { try { res.json(await groupByField(prisma, tenant(req), 'provider', req.query)); } catch (error) { next(error); } });
  router.get('/finance/comparison', async (req, res, next) => {
    try {
      const { from, to } = parseDateRange(req.query);
      const span = to.getTime() - from.getTime();
      const previousFrom = new Date(from.getTime() - span);
      const previousTo = new Date(to.getTime() - span);
      const rows = await prisma.financialRecord.findMany({ where: { tenantId: tenant(req), isActive: true, date: { gte: previousFrom, lte: to } } });
      const summarize = (start: Date, end: Date) => rows.filter((row) => row.date && row.date >= start && row.date <= end).reduce((acc, row) => {
        const amount = Number(row.amount || 0);
        if (row.type === 'INCOME') acc.income += amount;
        if (row.type === 'EXPENSE' || row.type === 'PURCHASE') acc.expense += amount;
        return acc;
      }, { income: 0, expense: 0 });
      const current = summarize(from, to);
      const previous = summarize(previousFrom, previousTo);
      const variation = previous.income > 0 ? ((current.income - previous.income) / previous.income) * 100 : null;
      res.json({ current, previous, variation, comparable: previous.income > 0 && current.income > 0 });
    } catch (error) { next(error); }
  });

  router.get('/notifications', async (req, res, next) => {
    try { res.json(await prisma.notification.findMany({ where: { tenantId: tenant(req) }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.limit || 100), 500) })); } catch (error) { next(error); }
  });
  router.patch('/notifications/:id/read', async (req, res, next) => {
    try { res.json(await prisma.notification.update({ where: { id: req.params.id }, data: { read: true, readAt: new Date() } })); } catch (error) { next(error); }
  });

  router.post('/internal-notes', async (req, res, next) => {
    try {
      const parsed = noteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', fields: parsed.error.flatten().fieldErrors });
      res.status(201).json(await prisma.internalNote.create({ data: { tenantId: tenant(req), ...parsed.data } }));
    } catch (error) { next(error); }
  });

  router.get('/reports', async (req, res, next) => {
    try { res.json(await prisma.report.findMany({ where: { tenantId: tenant(req) }, orderBy: { createdAt: 'desc' }, take: 100 })); } catch (error) { next(error); }
  });
  router.post('/reports/generate', async (req, res, next) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', fields: parsed.error.flatten().fieldErrors });
      const { from, to } = reportDateRange(parsed.data);
      const summary = await buildEnterpriseReport(prisma, tenant(req), parsed.data);
      const title = reportTitle(parsed.data.type, from, to);
      const report = await prisma.report.create({ data: { tenantId: tenant(req), type: parsed.data.type, periodStart: from, periodEnd: to, title, summaryJson: JSON.stringify(summary), sourceJson: JSON.stringify({ from, to, source: 'Google Sheets solo lectura', formats: ['json', 'csv', 'xlsx', 'html'] }) } });
      res.status(201).json(report);
    } catch (error) { next(error); }
  });
  router.get('/reports/:id/download', async (req, res, next) => {
    try {
      const report = await prisma.report.findFirst({ where: { id: req.params.id, tenantId: tenant(req) } });
      if (!report) return res.status(404).json({ error: 'Report not found' });
      const payload = { ...report, summary: JSON.parse(report.summaryJson), sources: report.sourceJson ? JSON.parse(report.sourceJson) : null };
      const format = String(req.query.format || 'json').toLowerCase();
      const baseName = report.title.replace(/\W+/g, '-').toLowerCase();
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
        return res.send(reportCsv(payload.summary));
      }
      if (format === 'xlsx') {
        const workbook = reportWorkbook(payload.summary);
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
        return res.send(buffer);
      }
      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.html"`);
        return res.send(reportHtml(payload.summary));
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
      res.send(JSON.stringify(payload, null, 2));
    } catch (error) { next(error); }
  });

  (router as any).startEnterpriseSync = (tenantId: string) => driveSync.start(tenantId);
  return router as Router & { startEnterpriseSync?: (tenantId: string) => void };
}

function reportTitle(type: string, from: Date, to: Date) {
  const labels: Record<string, string> = { daily: 'Reporte diario', weekly: 'Reporte semanal', monthly: 'Reporte mensual', custom: 'Reporte ejecutivo' };
  return `${labels[type] || 'Reporte ejecutivo'} ${from.toLocaleDateString('es-PE')} - ${to.toLocaleDateString('es-PE')}`;
}

function reportCsv(summary: any) {
  const lines = [
    ['Seccion', 'Campo', 'Valor'],
    ['Periodo', 'Desde', summary.period?.from],
    ['Periodo', 'Hasta', summary.period?.to],
    ['Totales', 'Ingresos', summary.totals?.income],
    ['Totales', 'Egresos', summary.totals?.expense],
    ['Totales', 'Saldo neto', summary.totals?.net],
    ['Totales', 'Registros', summary.totals?.recordCount],
    ['Documentos', 'Total', summary.documents?.total],
    ['Documentos', 'Procesados', summary.documents?.processed],
    ['Cambios', 'Total', summary.changes?.total],
    ['Alertas', 'Sin leer', summary.alerts?.unread],
  ];
  const records = (summary.recentRecords || []).map((record: any) => ['Registro', record.type, `${record.date || ''} | ${record.description || ''} | ${record.amount || ''}`]);
  return [...lines, ...records].map((row) => row.map(csvCell).join(',')).join('\n');
}

function reportWorkbook(summary: any) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Indicador: 'Ingresos', Valor: summary.totals?.income },
    { Indicador: 'Egresos', Valor: summary.totals?.expense },
    { Indicador: 'Saldo neto', Valor: summary.totals?.net },
    { Indicador: 'Registros', Valor: summary.totals?.recordCount },
    { Indicador: 'Documentos procesados', Valor: summary.documents?.processed },
    { Indicador: 'Cambios detectados', Valor: summary.changes?.total },
  ]), 'Resumen');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary.recentRecords || []), 'Registros');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary.categories || []), 'Categorias');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary.changes?.rows || []), 'Cambios');
  return workbook;
}

function reportHtml(summary: any) {
  const rows = (summary.recentRecords || []).slice(0, 100).map((record: any) => `<tr><td>${escapeHtml(record.date || '')}</td><td>${escapeHtml(record.type || '')}</td><td>${escapeHtml(record.description || '')}</td><td>${escapeHtml(record.amount || '')}</td><td>${escapeHtml(record.document || '')}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reporte VisionControl</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#0f172a}h1{margin-bottom:4px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0}.card{border:1px solid #e2e8f0;border-radius:12px;padding:16px}.label{color:#64748b;font-size:12px;text-transform:uppercase}.value{font-size:24px;font-weight:700}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #e2e8f0;padding:8px;text-align:left}th{background:#f8fafc}</style></head><body><h1>Reporte VisionControl</h1><p>${escapeHtml(summary.period?.from || '')} - ${escapeHtml(summary.period?.to || '')}</p><div class="cards"><div class="card"><div class="label">Ingresos</div><div class="value">${escapeHtml(summary.totals?.income || '0')}</div></div><div class="card"><div class="label">Egresos</div><div class="value">${escapeHtml(summary.totals?.expense || '0')}</div></div><div class="card"><div class="label">Saldo neto</div><div class="value">${escapeHtml(summary.totals?.net || '0')}</div></div></div><h2>Registros recientes</h2><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripcion</th><th>Monto</th><th>Documento</th></tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`;
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
}
