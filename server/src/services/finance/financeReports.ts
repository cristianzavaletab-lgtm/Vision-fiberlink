import { PrismaClient } from '@prisma/client';
import { centsFromDecimal, decimalFromCents } from './normalization';

type PrismaLike = PrismaClient;

export function parseDateRange(query: Record<string, unknown>) {
  const now = new Date();
  const from = query.from ? new Date(String(query.from)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = query.to ? new Date(String(query.to)) : now;
  return { from, to };
}

export function reportDateRange(input: { type?: string; from?: string; to?: string }) {
  if (input.from || input.to || input.type === 'custom') return parseDateRange(input as Record<string, unknown>);
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  if (input.type === 'daily') from.setHours(0, 0, 0, 0);
  else if (input.type === 'weekly') {
    from.setDate(now.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

export async function buildEnterpriseReport(prisma: PrismaLike, tenantId: string, input: { type: string; from?: string; to?: string }) {
  const { from, to } = reportDateRange(input);
  const [records, documents, changes, notifications, categories, providers] = await Promise.all([
    prisma.financialRecord.findMany({ where: { tenantId, isActive: true, date: { gte: from, lte: to } }, include: { document: true, sheet: true }, orderBy: [{ date: 'desc' }, { lastSeenAt: 'desc' }], take: 5000 }),
    prisma.driveDocument.findMany({ where: { tenantId }, include: { sheets: true }, orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.rowChange.findMany({ where: { tenantId, detectedAt: { gte: from, lte: to } }, include: { document: true, sheet: true }, orderBy: { detectedAt: 'desc' }, take: 300 }),
    prisma.notification.findMany({ where: { tenantId, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }, take: 300 }),
    groupByField(prisma, tenantId, 'category', { from: from.toISOString(), to: to.toISOString() }),
    groupByField(prisma, tenantId, 'provider', { from: from.toISOString(), to: to.toISOString() }),
  ]);
  const incomes = records.filter((record) => record.type === 'INCOME');
  const expenses = records.filter((record) => record.type === 'EXPENSE');
  const purchases = records.filter((record) => record.type === 'PURCHASE');
  const incomeCents = sum(incomes, 'INCOME');
  const expenseCents = expenses.reduce<bigint>((total, record) => total + centsFromDecimal(record.amount), 0n);
  const purchaseCents = purchases.reduce<bigint>((total, record) => total + centsFromDecimal(record.amount), 0n);
  const expenseTotal = expenseCents + purchaseCents;
  return {
    type: input.type,
    period: { from: from.toISOString(), to: to.toISOString() },
    generatedAt: new Date().toISOString(),
    totals: {
      income: decimalFromCents(incomeCents),
      expense: decimalFromCents(expenseTotal),
      net: decimalFromCents(incomeCents - expenseTotal),
      incomeCount: incomes.length,
      expenseCount: expenses.length,
      purchaseCount: purchases.length,
      recordCount: records.length,
    },
    documents: {
      total: documents.length,
      processed: documents.filter((document) => document.lastSyncAt).length,
      errors: documents.filter((document) => ['ERROR', 'SIN_ACCESO', 'ARCHIVO_NO_DISPONIBLE'].includes(String(document.status))).length,
      rows: documents.map((document) => ({ id: document.id, name: document.name, googleFileId: document.googleFileId, status: document.status, lastSyncAt: document.lastSyncAt, sheets: document.sheets.length })),
    },
    changes: {
      total: changes.length,
      high: changes.filter((change) => change.importance === 'high').length,
      rows: changes.slice(0, 100).map((change) => ({ id: change.id, document: change.document?.name, sheet: change.sheet?.name, type: change.changeType, field: change.fieldName, previousValue: change.previousValue, newValue: change.newValue, importance: change.importance, detectedAt: change.detectedAt })),
    },
    alerts: {
      total: notifications.length,
      unread: notifications.filter((notification) => !notification.read).length,
      rows: notifications.slice(0, 100).map((notification) => ({ id: notification.id, type: notification.type, title: notification.title, message: notification.message, importance: notification.importance, read: notification.read, createdAt: notification.createdAt })),
    },
    categories: categories.slice(0, 20),
    providers: providers.slice(0, 20),
    recentRecords: records.slice(0, 200).map((record) => ({ id: record.id, type: record.type, date: record.date, description: record.description, category: record.category, provider: record.provider, customer: record.customer, amount: record.amount, document: record.document?.name, sheet: record.sheet?.name })),
  };
}

export async function getFinanceSummary(prisma: PrismaLike, tenantId: string) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [records, documents, changes] = await Promise.all([
    prisma.financialRecord.findMany({ where: { tenantId, isActive: true }, orderBy: { lastSeenAt: 'desc' }, take: 10000 }),
    prisma.driveDocument.findMany({ where: { tenantId }, orderBy: { lastSyncAt: 'desc' }, take: 500 }),
    prisma.rowChange.findMany({ where: { tenantId }, orderBy: { detectedAt: 'desc' }, take: 20 }),
  ]);

  const today = records.filter((record) => record.date && record.date >= todayStart);
  const month = records.filter((record) => record.date && record.date >= monthStart);
  const pendingPurchases = records.filter((record) => record.type === 'PURCHASE' && /PENDIENTE|PROGRAMADO|SOLICITADO|COTIZADO|NO PAGADO/i.test(record.status || JSON.stringify(record.originalDataJson)));
  const todayIncome = sum(today, 'INCOME');
  const todayExpense = sum(today, 'EXPENSE');
  const monthIncome = sum(month, 'INCOME');
  const monthExpense = sum(month, 'EXPENSE');
  const expenseRecords = month.filter((record) => record.type === 'EXPENSE' && record.amount);
  const incomeRecords = month.filter((record) => record.type === 'INCOME' && record.amount);
  const committedPurchases = pendingPurchases.reduce<bigint>((total, record) => total + centsFromDecimal(record.amount), 0n);

  return {
    today: {
      income: decimalFromCents(todayIncome),
      expense: decimalFromCents(todayExpense),
      net: decimalFromCents(todayIncome - todayExpense),
      incomeCount: today.filter((record) => record.type === 'INCOME').length,
      expenseCount: today.filter((record) => record.type === 'EXPENSE').length,
    },
    month: {
      income: decimalFromCents(monthIncome),
      expense: decimalFromCents(monthExpense),
      net: decimalFromCents(monthIncome - monthExpense),
      incomeCount: incomeRecords.length,
      expenseCount: expenseRecords.length,
      averageIncome: decimalFromCents(avg(incomeRecords)),
      averageExpense: decimalFromCents(avg(expenseRecords)),
      highestIncome: decimalFromCents(max(incomeRecords)),
      highestExpense: decimalFromCents(max(expenseRecords)),
    },
    purchases: {
      pendingCount: pendingPurchases.length,
      committed: decimalFromCents(committedPurchases),
      projectedBalance: decimalFromCents(monthIncome - monthExpense - committedPurchases),
    },
    documents: {
      updatedToday: documents.filter((document) => document.lastSyncAt && document.lastSyncAt >= todayStart).length,
      total: documents.length,
      lastActivity: records[0]?.lastSeenAt || documents[0]?.lastSyncAt || null,
    },
    changes: {
      totalRecent: changes.length,
      last: changes[0] || null,
    },
    alerts: {
      important: changes.filter((change) => change.importance === 'high').length,
      negativeBalance: monthIncome - monthExpense < 0n,
    },
  };
}

export async function listFinancialRecords(prisma: PrismaLike, tenantId: string, type: 'INCOME' | 'EXPENSE' | 'PURCHASE', query: Record<string, unknown>) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 50), 1), 200);
  const { from, to } = parseDateRange(query);
  const where: any = { tenantId, type, isActive: true };
  if (query.from || query.to) where.date = { gte: from, lte: to };
  if (query.category) where.category = String(query.category);
  if (query.provider) where.provider = String(query.provider);
  if (query.status) where.status = String(query.status);
  if (query.documentId) where.documentId = String(query.documentId);
  if (query.search) {
    where.OR = [
      { description: { contains: String(query.search), mode: 'insensitive' } },
      { provider: { contains: String(query.search), mode: 'insensitive' } },
      { category: { contains: String(query.search), mode: 'insensitive' } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.financialRecord.count({ where }),
    prisma.financialRecord.findMany({ where, include: { document: true, sheet: true }, orderBy: [{ date: 'desc' }, { lastSeenAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { page, pageSize, total, rows };
}

export async function groupByField(prisma: PrismaLike, tenantId: string, field: 'category' | 'provider', query: Record<string, unknown> = {}) {
  const where: any = { tenantId, isActive: true, amount: { not: null } };
  if (query.from || query.to) {
    const { from, to } = parseDateRange(query);
    where.date = { gte: from, lte: to };
  }
  const rows = await prisma.financialRecord.findMany({ where, select: { [field]: true, amount: true, type: true } as any });
  const grouped = new Map<string, { name: string; income: bigint; expense: bigint; count: number }>();
  for (const row of rows as any[]) {
    const name = row[field] || 'Sin clasificar';
    const item = grouped.get(name) || { name, income: 0n, expense: 0n, count: 0 };
    if (row.type === 'INCOME') item.income += centsFromDecimal(row.amount);
    if (row.type === 'EXPENSE' || row.type === 'PURCHASE') item.expense += centsFromDecimal(row.amount);
    item.count += 1;
    grouped.set(name, item);
  }
  return Array.from(grouped.values()).map((item) => ({ ...item, income: decimalFromCents(item.income), expense: decimalFromCents(item.expense) })).sort((a, b) => Number(b.expense) - Number(a.expense));
}

function sum(records: any[], type: string): bigint {
  return records.filter((record) => record.type === type && record.amount).reduce<bigint>((total, record) => total + centsFromDecimal(record.amount), 0n);
}

function avg(records: any[]): bigint {
  if (!records.length) return 0n;
  return records.reduce<bigint>((total, record) => total + centsFromDecimal(record.amount), 0n) / BigInt(records.length);
}

function max(records: any[]): bigint {
  return records.reduce<bigint>((highest, record) => {
    const value = centsFromDecimal(record.amount);
    return value > highest ? value : highest;
  }, 0n);
}
