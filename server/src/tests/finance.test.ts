import assert from 'assert';
import { classifySheetName, normalizeDate, normalizeMoney, normalizeRows } from '../services/finance/normalization';
import { compareSnapshots } from '../services/finance/snapshotComparer';
import { buildEnterpriseReport, reportDateRange } from '../services/finance/financeReports';

function testMoney() {
  assert.equal(normalizeMoney('S/ 1,250.50').decimal, '1250.50');
  assert.equal(normalizeMoney('S/. 1,250.50').decimal, '1250.50');
  assert.equal(normalizeMoney('1250.50').decimal, '1250.50');
  assert.equal(normalizeMoney('1.250,50').decimal, '1250.50');
  assert.equal(normalizeMoney('1,250').decimal, '1250.00');
  assert.equal(normalizeMoney('S/1250').decimal, '1250.00');
  assert.equal(normalizeMoney('-250.00').decimal, '-250.00');
}

function testDates() {
  assert.equal(normalizeDate('16/07/2026').date?.toISOString().slice(0, 10), '2026-07-16');
  assert.equal(normalizeDate('2026-07-16').date?.toISOString().slice(0, 10), '2026-07-16');
  assert.equal(normalizeDate('16-07-2026').date?.toISOString().slice(0, 10), '2026-07-16');
  assert.equal(normalizeDate('16 JUL 2026').date?.toISOString().slice(0, 10), '2026-07-16');
  assert.equal(normalizeDate('16/7/26').date?.toISOString().slice(0, 10), '2026-07-16');
}

function testSheetRecognition() {
  assert.equal(classifySheetName('recaudación diaria'), 'INCOME');
  assert.equal(classifySheetName('caja chica'), 'EXPENSE');
  assert.equal(classifySheetName('Atención técnica'), 'OPERATIONS');
  assert.equal(classifySheetName('Hoja rara'), 'UNCLASSIFIED');
}

function testRowsAndPurchases() {
  const income = normalizeRows('INGRESOS', [
    ['Fecha', 'Descripción', 'Monto', 'Cliente'],
    ['16/07/2026', 'Instalación fibra', 'S/ 850.00', 'Cliente A'],
  ]);
  assert.equal(income.rows.length, 1);
  assert.equal(income.rows[0].type, 'INCOME');
  assert.equal(income.rows[0].amount, '850.00');

  const expense = normalizeRows('GASTOS', [
    ['Fecha', 'Detalle', 'Importe', 'Proveedor', 'Estado'],
    ['16/07/2026', 'Cableado', '420', 'Proveedor X', 'Pagado'],
  ]);
  assert.equal(expense.rows[0].type, 'EXPENSE');
  assert.equal(expense.rows[0].provider, 'Proveedor X');

  const purchase = normalizeRows('COMPRAS', [
    ['Fecha', 'Producto', 'Costo', 'Estado'],
    ['16/07/2026', 'Router', '1250', 'PENDIENTE'],
  ]);
  assert.equal(purchase.rows[0].type, 'PURCHASE');
  assert.equal(purchase.rows[0].isPendingPurchase, true);

  const liquidation = normalizeRows('LIQUIDACIÓN', [
    ['FECHA', 'TOTAL INGRESOS', 'TOTAL EGRESOS', 'ESTADO'],
    ['16/07/2026', 'S/ 1000.00', 'S/ 250.00', 'ENTREGADO'],
  ], undefined, { includeLiquidationIncome: false, includeLiquidationExpense: true });
  assert.equal(liquidation.rows.length, 1);
  assert.equal(liquidation.rows[0].type, 'EXPENSE');
  assert.equal(liquidation.rows[0].amount, '250.00');
}

function testSnapshotDiffs() {
  const base = normalizeRows('GASTOS', [
    ['Fecha', 'Detalle', 'Importe', 'Proveedor'],
    ['16/07/2026', 'Cable', '250', 'Proveedor A'],
  ]).rows;
  const edited = normalizeRows('GASTOS', [
    ['Fecha', 'Detalle', 'Importe', 'Proveedor'],
    ['16/07/2026', 'Cable', '420', 'Proveedor A'],
    ['16/07/2026', 'Herramienta', '180', 'Proveedor B'],
  ]).rows;
  const diffs = compareSnapshots(base, edited);
  assert.ok(diffs.some((diff) => diff.changeType === 'MONTO_CAMBIADO'));
  assert.ok(diffs.some((diff) => diff.changeType === 'FILA_AGREGADA'));
  const removed = compareSnapshots(edited, base);
  assert.ok(removed.some((diff) => diff.changeType === 'FILA_ELIMINADA'));
}

async function testReports() {
  const daily = reportDateRange({ type: 'daily' });
  assert.equal(daily.from.getHours(), 0);
  assert.equal(daily.from.getMinutes(), 0);

  const records = [
    { id: 'income-1', tenantId: 'default', type: 'INCOME', date: new Date(), amount: '100.00', description: 'Pago mensual', category: 'Mensualidad', provider: null, customer: 'Cliente A', document: { name: 'Doc ingresos' }, sheet: { name: 'INGRESOS' } },
    { id: 'expense-1', tenantId: 'default', type: 'EXPENSE', date: new Date(), amount: '25.00', description: 'Gasto operativo', category: 'Operativo', provider: 'Proveedor A', customer: null, document: { name: 'Doc gastos' }, sheet: { name: 'GASTOS' } },
  ];
  const prisma = {
    financialRecord: { findMany: async (args: any) => args?.select ? records.map((record) => ({ category: record.category, provider: record.provider, amount: record.amount, type: record.type })) : records },
    driveDocument: { findMany: async () => [{ id: 'doc-1', name: 'Doc ingresos', googleFileId: 'sheet-1', status: 'ACTUALIZADO', lastSyncAt: new Date(), sheets: [{ id: 'sheet-1' }] }] },
    rowChange: { findMany: async () => [{ id: 'change-1', changeType: 'MONTO_CAMBIADO', fieldName: 'amount', previousValue: '90.00', newValue: '100.00', importance: 'high', detectedAt: new Date(), document: { name: 'Doc ingresos' }, sheet: { name: 'INGRESOS' } }] },
    notification: { findMany: async () => [{ id: 'notif-1', type: 'MONTO_CAMBIADO', title: 'Monto cambiado', message: 'Cambio detectado', importance: 'high', read: false, createdAt: new Date() }] },
  };
  const report = await buildEnterpriseReport(prisma as any, 'default', { type: 'daily' });
  assert.equal(report.totals.income, '100.00');
  assert.equal(report.totals.expense, '25.00');
  assert.equal(report.totals.net, '75.00');
  assert.equal(report.documents.processed, 1);
  assert.equal(report.changes.high, 1);
  assert.equal(report.alerts.unread, 1);
}

testMoney();
testDates();
testSheetRecognition();
testRowsAndPurchases();
testSnapshotDiffs();
testReports().then(() => {
  console.log('Finance normalization, snapshot and report tests passed.');
});
