import { PrismaClient } from '@prisma/client';
import { centsFromDecimal, decimalFromCents } from './normalization';

type PrismaLike = PrismaClient;

export function parseDateRange(query: Record<string, unknown>) {
  const now = new Date();
  const from = query.from ? new Date(String(query.from)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = query.to ? new Date(String(query.to)) : now;
  return { from, to };
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

export async function groupByField(prisma: PrismaLike, tenantId: string, field: 'category' | 'provider') {
  const rows = await prisma.financialRecord.findMany({ where: { tenantId, isActive: true, amount: { not: null } }, select: { [field]: true, amount: true, type: true } as any });
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
