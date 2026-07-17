import { NormalizedRow } from './normalization';

export interface RowDiff {
  rowKey: string;
  approximateRow?: number;
  changeType: 'FILA_AGREGADA' | 'FILA_EDITADA' | 'FILA_ELIMINADA' | 'MONTO_CAMBIADO' | 'FECHA_CAMBIADA' | 'ESTADO_CAMBIADO' | 'PROVEEDOR_CAMBIADO' | 'CATEGORIA_CAMBIADA';
  fieldName?: string;
  previousValue?: string;
  newValue?: string;
  importance: 'low' | 'medium' | 'high';
}

export function compareSnapshots(previous: NormalizedRow[], current: NormalizedRow[]): RowDiff[] {
  const previousByKey = new Map(previous.map((row) => [row.rowKey, row]));
  const currentByKey = new Map(current.map((row) => [row.rowKey, row]));
  const matchedPreviousKeys = new Set<string>();
  const diffs: RowDiff[] = [];

  for (const row of current) {
    const old = previousByKey.get(row.rowKey) || previous.find((candidate) => !currentByKey.has(candidate.rowKey) && candidate.sourceRow === row.sourceRow && stableComparable(candidate, row));
    if (!old) {
      diffs.push({ rowKey: row.rowKey, approximateRow: row.sourceRow, changeType: 'FILA_AGREGADA', newValue: row.description || row.amount, importance: row.type === 'OTHER' ? 'low' : 'medium' });
      continue;
    }
    matchedPreviousKeys.add(old.rowKey);
    if (old.contentHash !== row.contentHash) {
      const fields: Array<[keyof NormalizedRow, RowDiff['changeType']]> = [
        ['amount', 'MONTO_CAMBIADO'],
        ['originalDate', 'FECHA_CAMBIADA'],
        ['status', 'ESTADO_CAMBIADO'],
        ['provider', 'PROVEEDOR_CAMBIADO'],
        ['category', 'CATEGORIA_CAMBIADA'],
      ];
      let specific = false;
      for (const [field, changeType] of fields) {
        const previousValue = stringify(old[field]);
        const newValue = stringify(row[field]);
        if (previousValue !== newValue) {
          specific = true;
          diffs.push({ rowKey: row.rowKey, approximateRow: row.sourceRow, changeType, fieldName: String(field), previousValue, newValue, importance: changeType === 'MONTO_CAMBIADO' ? 'high' : 'medium' });
        }
      }
      if (!specific) diffs.push({ rowKey: row.rowKey, approximateRow: row.sourceRow, changeType: 'FILA_EDITADA', previousValue: JSON.stringify(old.originalData), newValue: JSON.stringify(row.originalData), importance: 'medium' });
    }
  }

  for (const row of previous) {
    if (!currentByKey.has(row.rowKey) && !matchedPreviousKeys.has(row.rowKey)) diffs.push({ rowKey: row.rowKey, approximateRow: row.sourceRow, changeType: 'FILA_ELIMINADA', previousValue: row.description || row.amount, importance: row.type === 'OTHER' ? 'low' : 'high' });
  }
  return diffs;
}

function stableComparable(a: NormalizedRow, b: NormalizedRow) {
  return stringify(a.originalDate) === stringify(b.originalDate)
    && stringify(a.description).toUpperCase() === stringify(b.description).toUpperCase()
    && stringify(a.provider).toUpperCase() === stringify(b.provider).toUpperCase();
}

function stringify(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return '';
  return String(value);
}
