import crypto from 'crypto';

export type SheetCategory = 'INCOME' | 'EXPENSE' | 'OPERATIONS' | 'UNCLASSIFIED';
export type RecordType = 'INCOME' | 'EXPENSE' | 'PURCHASE' | 'OTHER';

export interface NormalizedDate {
  date: Date | null;
  original: string;
}

export interface NormalizedMoney {
  decimal: string | null;
  cents: bigint | null;
  original: string;
}

export interface NormalizedRow {
  rowKey: string;
  sourceRow: number;
  type: RecordType;
  date: Date | null;
  originalDate?: string;
  description?: string;
  category?: string;
  provider?: string;
  customer?: string;
  amount?: string;
  currency: string;
  status?: string;
  paymentMethod?: string;
  responsible?: string;
  location?: string;
  originalData: Record<string, unknown>;
  contentHash: string;
  isPendingPurchase: boolean;
  product?: string;
  quantity?: string;
  unitPrice?: string;
  expectedDate?: Date | null;
  priority?: string;
  hasReceipt: boolean;
}

const INCOME_NAMES = ['INGRESOS', 'COBROS', 'VENTAS', 'PAGOS', 'RECAUDACION', 'ABONOS', 'CAJA', 'LIQUIDACION'];
const EXPENSE_NAMES = ['GASTOS', 'EGRESOS', 'COMPRAS', 'SALIDAS', 'PAGOS REALIZADOS', 'COSTOS', 'CAJA CHICA', 'PROVEEDORES'];
const OPERATIONS_NAMES = ['INSTALACIONES', 'ATENCIONES', 'ATENCION TECNICA', 'MOVIMIENTOS', 'AVERIAS', 'MIGRACIONES', 'GESTIONES', 'DEUDA', 'CLIENTES ACTIVOS'];

const COLUMN_ALIASES: Record<string, string[]> = {
  amount: ['MONTO', 'TOTAL', 'IMPORTE', 'PRECIO', 'PAGADO', 'COBRADO', 'VALOR', 'COSTO'],
  description: ['DESCRIPCION', 'DETALLE', 'CONCEPTO', 'MOTIVO', 'OBSERVACION', 'PRODUCTO', 'SERVICIO'],
  provider: ['PROVEEDOR', 'EMPRESA', 'TIENDA', 'BENEFICIARIO', 'PAGADO A'],
  category: ['CATEGORIA', 'TIPO', 'RUBRO', 'CLASE', 'AREA'],
  status: ['ESTADO', 'SITUACION', 'CONDICION', 'PENDIENTE', 'PAGADO'],
  date: ['FECHA', 'DIA', 'FEC', 'FECHA Y HORA', 'REGISTRADO', 'EMISION'],
  customer: ['CLIENTE', 'ABONADO', 'USUARIO'],
  paymentMethod: ['METODO DE PAGO', 'FORMA DE PAGO', 'MEDIO DE PAGO', 'BANCO'],
  responsible: ['RESPONSABLE', 'ASESOR', 'TECNICO', 'VENDEDOR', 'OPERADOR'],
  location: ['SEDE', 'SECTOR', 'ZONA', 'UBICACION', 'LOCALIDAD'],
  quantity: ['CANTIDAD', 'QTY', 'UNIDADES'],
  unitPrice: ['PRECIO UNITARIO', 'P UNITARIO', 'PU'],
  expectedDate: ['FECHA PREVISTA', 'FECHA PROGRAMADA', 'VENCIMIENTO'],
  priority: ['PRIORIDAD', 'URGENCIA'],
  receipt: ['COMPROBANTE', 'FACTURA', 'BOLETA', 'RECIBO'],
  id: ['ID', 'CODIGO', 'CODIGO OPERACION', 'OPERACION', 'NRO', 'NUMERO', 'COMPROBANTE'],
};

const PENDING_WORDS = ['PENDIENTE', 'POR COMPRAR', 'PROGRAMADO', 'SOLICITADO', 'COTIZADO', 'POR APROBAR', 'APROBADO', 'NO PAGADO'];
const CANCELLED_WORDS = ['ANULADO', 'ANULADA', 'CANCELADO', 'CANCELADA', 'ELIMINADO'];
const TOTAL_WORDS = ['TOTAL', 'SUBTOTAL', 'SUMA', 'SALDO ANTERIOR', 'ACUMULADO'];
const MONTHS: Record<string, number> = { ENE: 0, ENERO: 0, FEB: 1, FEBRERO: 1, MAR: 2, MARZO: 2, ABR: 3, ABRIL: 3, MAY: 4, MAYO: 4, JUN: 5, JUNIO: 5, JUL: 6, JULIO: 6, AGO: 7, AGOSTO: 7, SEP: 8, SET: 8, SEPTIEMBRE: 8, OCT: 9, OCTUBRE: 9, NOV: 10, NOVIEMBRE: 10, DIC: 11, DICIEMBRE: 11 };

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.\-_–—/\\()[\]{}:;,*+!?¿¡@#$%^&="'`~|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsApprox(normalized: string, candidates: string[]) {
  return candidates.some((candidate) => normalized.includes(normalizeText(candidate)) || normalizeText(candidate).includes(normalized));
}

export function classifySheetName(name: string): SheetCategory {
  const normalized = normalizeText(name);
  const matches: Array<{ category: SheetCategory; length: number }> = [];
  for (const candidate of INCOME_NAMES) if (containsApprox(normalized, [candidate])) matches.push({ category: 'INCOME', length: normalizeText(candidate).length });
  for (const candidate of EXPENSE_NAMES) if (containsApprox(normalized, [candidate])) matches.push({ category: 'EXPENSE', length: normalizeText(candidate).length });
  for (const candidate of OPERATIONS_NAMES) if (containsApprox(normalized, [candidate])) matches.push({ category: 'OPERATIONS', length: normalizeText(candidate).length });
  return matches.sort((a, b) => b.length - a.length)[0]?.category || 'UNCLASSIFIED';
}

export function normalizeMoney(value: unknown): NormalizedMoney {
  const original = String(value ?? '').trim();
  if (!original) return { decimal: null, cents: null, original };
  let raw = original.replace(/S\/\.?/gi, '').replace(/PEN/gi, '').replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!raw || raw === '-' || raw === ',' || raw === '.') return { decimal: null, cents: null, original };

  const negative = raw.startsWith('-');
  raw = raw.replace(/-/g, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma > -1 && lastDot > -1) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = raw.split(thousandsSeparator).join('').replace(decimalSeparator, '.');
  } else if (lastComma > -1) {
    const decimals = raw.length - lastComma - 1;
    normalized = decimals === 2 ? raw.replace(/,/g, '.') : raw.replace(/,/g, '');
  } else if (lastDot > -1) {
    const decimals = raw.length - lastDot - 1;
    normalized = decimals === 2 ? raw : raw.replace(/\./g, '');
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) return { decimal: null, cents: null, original };
  const cents = BigInt(Math.round(number * 100)) * (negative ? -1n : 1n);
  const abs = cents < 0n ? -cents : cents;
  const decimal = `${cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
  return { decimal, cents, original };
}

export function normalizeDate(value: unknown): NormalizedDate {
  const original = String(value ?? '').trim();
  if (!original) return { date: null, original };
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { date: value, original };
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return { date: new Date(excelEpoch + value * 86400000), original };
  }

  const clean = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  let match = clean.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (match) return { date: safeDate(Number(match[1]), Number(match[2]) - 1, Number(match[3])), original };
  match = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (match) {
    const year = normalizeYear(Number(match[3]));
    return { date: safeDate(year, Number(match[2]) - 1, Number(match[1])), original };
  }
  match = clean.match(/^(\d{1,2})\s+([A-Z]+)\s+(\d{2,4})/);
  if (match && MONTHS[match[2]] !== undefined) return { date: safeDate(normalizeYear(Number(match[3])), MONTHS[match[2]], Number(match[1])), original };

  const parsed = new Date(original);
  return { date: Number.isNaN(parsed.getTime()) ? null : parsed, original };
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function safeDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildHeaderMap(headers: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const normalized = normalizeText(header);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.some((alias) => normalized === normalizeText(alias) || normalized.includes(normalizeText(alias)))) map[field] = index;
    }
  });
  return map;
}

export function hashValue(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeRows(sheetName: string, rows: unknown[][], manualCategory?: string): { headers: string[]; headerMap: Record<string, number>; rows: NormalizedRow[]; category: SheetCategory } {
  const headerIndex = rows.findIndex((row) => row.filter((cell) => String(cell ?? '').trim()).length >= 2);
  if (headerIndex === -1) return { headers: [], headerMap: {}, rows: [], category: 'UNCLASSIFIED' };
  const headers = rows[headerIndex].map((cell) => String(cell ?? '').trim());
  const headerMap = buildHeaderMap(headers);
  const category = manualCategory as SheetCategory || classifySheetName(sheetName);
  const normalizedRows: NormalizedRow[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const sourceRow = headerIndex + offset + 2;
    const originalData = Object.fromEntries(headers.map((header, index) => [header || `COL_${index + 1}`, row[index] ?? null]));
    if (isIgnorableRow(row)) return;
    const amount = headerMap.amount !== undefined ? normalizeMoney(row[headerMap.amount]) : { decimal: null, cents: null, original: '' };
    const dateValue = headerMap.date !== undefined ? normalizeDate(row[headerMap.date]) : { date: null, original: '' };
    const description = valueAt(row, headerMap.description);
    const status = valueAt(row, headerMap.status);
    if (status && CANCELLED_WORDS.some((word) => normalizeText(status).includes(word))) return;

    const searchable = normalizeText(Object.values(originalData).join(' '));
    const isPendingPurchase = PENDING_WORDS.some((word) => searchable.includes(word));
    const type = inferRecordType(category, searchable, amount.decimal, isPendingPurchase);
    if (type !== 'OTHER' && !amount.decimal) return;

    const stableSource = valueAt(row, headerMap.id) || [dateValue.original, description, amount.decimal, valueAt(row, headerMap.provider)].filter(Boolean).join('|') || JSON.stringify(originalData);
    const rowKey = hashValue(stableSource);
    const contentHash = hashValue(originalData);
    normalizedRows.push({
      rowKey,
      sourceRow,
      type,
      date: dateValue.date,
      originalDate: dateValue.original || undefined,
      description,
      category: valueAt(row, headerMap.category),
      provider: valueAt(row, headerMap.provider),
      customer: valueAt(row, headerMap.customer),
      amount: amount.decimal || undefined,
      currency: 'PEN',
      status,
      paymentMethod: valueAt(row, headerMap.paymentMethod),
      responsible: valueAt(row, headerMap.responsible),
      location: valueAt(row, headerMap.location),
      originalData,
      contentHash,
      isPendingPurchase,
      product: description,
      quantity: normalizeMoney(valueAt(row, headerMap.quantity)).decimal || undefined,
      unitPrice: normalizeMoney(valueAt(row, headerMap.unitPrice)).decimal || undefined,
      expectedDate: headerMap.expectedDate !== undefined ? normalizeDate(row[headerMap.expectedDate]).date : null,
      priority: valueAt(row, headerMap.priority),
      hasReceipt: Boolean(valueAt(row, headerMap.receipt)),
    });
  });

  return { headers, headerMap, rows: dedupeRows(normalizedRows), category };
}

function valueAt(row: unknown[], index?: number): string | undefined {
  if (index === undefined) return undefined;
  const value = String(row[index] ?? '').trim();
  return value || undefined;
}

function isIgnorableRow(row: unknown[]) {
  const cells = row.map((cell) => String(cell ?? '').trim()).filter(Boolean);
  if (cells.length === 0) return true;
  const joined = normalizeText(cells.join(' '));
  if (TOTAL_WORDS.some((word) => joined === word || joined.startsWith(`${word} `))) return true;
  return false;
}

function inferRecordType(category: SheetCategory, text: string, amount?: string | null, isPendingPurchase = false): RecordType {
  if (isPendingPurchase) return 'PURCHASE';
  if (!amount) return 'OTHER';
  if (category === 'INCOME') return 'INCOME';
  if (category === 'EXPENSE') return text.includes('COMPRA') ? 'PURCHASE' : 'EXPENSE';
  if (text.includes('INGRES') || text.includes('COBRO') || text.includes('VENTA') || text.includes('RECAUD')) return 'INCOME';
  if (text.includes('GAST') || text.includes('EGRES') || text.includes('COMPRA') || text.includes('PROVEED')) return text.includes('COMPRA') ? 'PURCHASE' : 'EXPENSE';
  return 'OTHER';
}

function dedupeRows(rows: NormalizedRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.rowKey}:${row.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function centsFromDecimal(value: unknown): bigint {
  const money = normalizeMoney(String(value ?? ''));
  return money.cents ?? 0n;
}

export function decimalFromCents(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
