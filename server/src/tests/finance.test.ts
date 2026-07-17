import assert from 'assert';
import { classifySheetName, normalizeDate, normalizeMoney, normalizeRows } from '../services/finance/normalization';
import { compareSnapshots } from '../services/finance/snapshotComparer';

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

testMoney();
testDates();
testSheetRecognition();
testRowsAndPurchases();
testSnapshotDiffs();

console.log('Finance normalization and snapshot tests passed.');
