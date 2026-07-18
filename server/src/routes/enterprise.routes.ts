import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { DriveSyncService } from '../services/driveSync.service';
import { getFinanceSummary, groupByField, listFinancialRecords, parseDateRange } from '../services/finance/financeReports';

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
      const { from, to } = parseDateRange(parsed.data);
      const summary = await getFinanceSummary(prisma, tenant(req));
      const report = await prisma.report.create({ data: { tenantId: tenant(req), type: parsed.data.type, periodStart: from, periodEnd: to, title: `Reporte ${parsed.data.type}`, summaryJson: JSON.stringify(summary), sourceJson: JSON.stringify({ from, to, source: 'Google Sheets solo lectura' }) } });
      res.status(201).json(report);
    } catch (error) { next(error); }
  });
  router.get('/reports/:id/download', async (req, res, next) => {
    try {
      const report = await prisma.report.findFirst({ where: { id: req.params.id, tenantId: tenant(req) } });
      if (!report) return res.status(404).json({ error: 'Report not found' });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${report.title.replace(/\W+/g, '-').toLowerCase()}.json"`);
      res.send(JSON.stringify({ ...report, summary: JSON.parse(report.summaryJson), sources: report.sourceJson ? JSON.parse(report.sourceJson) : null }, null, 2));
    } catch (error) { next(error); }
  });

  (router as any).startEnterpriseSync = (tenantId: string) => driveSync.start(tenantId);
  return router as Router & { startEnterpriseSync?: (tenantId: string) => void };
}
