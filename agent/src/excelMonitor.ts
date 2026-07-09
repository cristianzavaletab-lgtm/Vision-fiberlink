import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import * as xlsx from 'xlsx';

export type ExcelEventType =
  | 'excel_file_created'
  | 'excel_file_opened'
  | 'excel_file_modified'
  | 'excel_file_deleted'
  | 'excel_file_renamed'
  | 'excel_file_closed';

export interface ExcelAgentConfig {
  machineId: string;
  machineName: string;
  watchFolders: string[];
  allowedExtensions: string[];
  currency: string;
  decimalPlaces: number;
  excelDeepRead: boolean;
}

export interface ExcelBusinessEvent {
  eventId: string;
  machineId: string;
  machineName: string;
  eventType: ExcelEventType;
  fileName: string;
  filePath: string;
  sheetName?: string;
  detectedAmount?: number;
  currency: string;
  actionSummary: string;
  oldValue?: number;
  newValue?: number;
  createdRows: number;
  updatedRows: number;
  deletedRows: number;
  totalCollected: number;
  totalIncome: number;
  totalSales: number;
  changedSheets: string[];
  importantCells: Array<{ sheetName: string; row: number; column: string; oldValue?: unknown; newValue?: unknown }>;
  fileSize: number;
  fileModifiedAt?: string;
  timestamp: string;
  syncStatus: 'pending' | 'synced' | 'error';
}

interface SheetSnapshot {
  headers: string[];
  rows: unknown[][];
}

interface FileSnapshot {
  sheets: Record<string, SheetSnapshot>;
  fileSize: number;
  fileModifiedAt?: string;
}

interface FileAnalysis {
  createdRows: number;
  updatedRows: number;
  deletedRows: number;
  totalCollected: number;
  totalIncome: number;
  totalSales: number;
  detectedAmount?: number;
  oldValue?: number;
  newValue?: number;
  changedSheets: string[];
  importantCells: Array<{ sheetName: string; row: number; column: string; oldValue?: unknown; newValue?: unknown }>;
  primarySheet?: string;
  snapshot?: FileSnapshot;
}

const MONEY_COLUMNS = ['total', 'monto', 'cobro', 'ingreso', 'venta', 'precio', 'importe', 'pagado', 'valor'];
const INCOME_COLUMNS = ['ingreso', 'venta', 'total', 'importe'];
const COLLECTION_COLUMNS = ['cobro', 'pagado', 'pago', 'cancelado'];

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function toNumber(value: unknown, decimalPlaces: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(decimalPlaces));
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/,/g, '');
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(decimalPlaces)) : undefined;
}

function hasBusinessAmountColumn(header: string) {
  const normalized = normalize(header);
  return MONEY_COLUMNS.some((keyword) => normalized.includes(keyword));
}

function isIncomeColumn(header: string) {
  const normalized = normalize(header);
  return INCOME_COLUMNS.some((keyword) => normalized.includes(keyword));
}

function isCollectionColumn(header: string) {
  const normalized = normalize(header);
  return COLLECTION_COLUMNS.some((keyword) => normalized.includes(keyword));
}

function rowHash(row: unknown[]) {
  return JSON.stringify(row.map((cell) => cell instanceof Date ? cell.toISOString() : cell ?? ''));
}

export class ExcelMonitor extends EventEmitter {
  private config: ExcelAgentConfig;
  private watcher: FSWatcher | null = null;
  private snapshots = new Map<string, FileSnapshot>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private pendingRenames = new Map<string, string>();

  constructor(config: ExcelAgentConfig) {
    super();
    this.config = config;
  }

  public updateConfig(config: ExcelAgentConfig) {
    const shouldRestart = JSON.stringify(config.watchFolders) !== JSON.stringify(this.config.watchFolders)
      || JSON.stringify(config.allowedExtensions) !== JSON.stringify(this.config.allowedExtensions);
    this.config = config;
    if (shouldRestart) {
      this.stop();
      this.start();
    }
  }

  public start() {
    const folders = this.config.watchFolders.filter((folder) => fs.existsSync(folder));
    if (folders.length === 0) {
      this.emit('error-log', 'No hay carpetas autorizadas existentes para monitorear.');
      return;
    }

    this.watcher = chokidar.watch(folders, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 250 },
      ignored: (filePath: string) => this.isTemporaryOfficeFile(filePath) ? false : !this.isAllowedExcelFile(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
    });

    this.watcher.on('add', (filePath: string) => this.handleAdd(filePath));
    this.watcher.on('change', (filePath: string) => this.scheduleFileEvent('excel_file_modified', filePath));
    this.watcher.on('unlink', (filePath: string) => this.handleUnlink(filePath));
    this.watcher.on('error', (error: unknown) => this.emit('error-log', `Error del monitor de archivos: ${String(error)}`));
    this.emit('status', `Monitoreo iniciado en ${folders.length} carpeta(s).`);
  }

  public stop() {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    if (this.watcher) {
      this.watcher.close().catch(() => undefined);
      this.watcher = null;
    }
  }

  private isAllowedExcelFile(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (!this.config.allowedExtensions.map((item) => item.toLowerCase()).includes(ext)) return false;
    const resolved = path.resolve(filePath).toLowerCase();
    return this.config.watchFolders.some((folder) => resolved.startsWith(path.resolve(folder).toLowerCase()));
  }

  private isTemporaryOfficeFile(filePath: string) {
    return path.basename(filePath).startsWith('~$');
  }

  private originalPathFromLockFile(filePath: string) {
    const folder = path.dirname(filePath);
    const baseName = path.basename(filePath).replace(/^~\$/, '');
    return path.join(folder, baseName);
  }

  private handleAdd(filePath: string) {
    if (this.isTemporaryOfficeFile(filePath)) {
      const originalPath = this.originalPathFromLockFile(filePath);
      if (this.isAllowedExcelFile(originalPath)) this.scheduleFileEvent('excel_file_opened', originalPath);
      return;
    }
    if (this.isAllowedExcelFile(filePath)) this.scheduleFileEvent('excel_file_created', filePath);
  }

  private handleUnlink(filePath: string) {
    if (this.isTemporaryOfficeFile(filePath)) {
      const originalPath = this.originalPathFromLockFile(filePath);
      if (this.isAllowedExcelFile(originalPath)) this.scheduleFileEvent('excel_file_closed', originalPath);
      return;
    }
    if (!this.config.allowedExtensions.includes(path.extname(filePath).toLowerCase())) return;

    const deletedAt = new Date().toISOString();
    this.pendingRenames.set(filePath, deletedAt);
    setTimeout(() => {
      if (!this.pendingRenames.has(filePath)) return;
      this.pendingRenames.delete(filePath);
      this.snapshots.delete(path.resolve(filePath));
      this.emitBasicEvent('excel_file_deleted', filePath, 'Se eliminó un archivo Excel autorizado.');
    }, 1200);
  }

  private scheduleFileEvent(eventType: ExcelEventType, filePath: string) {
    const resolved = path.resolve(filePath);
    const existingTimer = this.debounceTimers.get(resolved);
    if (existingTimer) clearTimeout(existingTimer);

    this.debounceTimers.set(resolved, setTimeout(async () => {
      this.debounceTimers.delete(resolved);
      await this.processFileEvent(eventType, resolved);
    }, 900));
  }

  private async processFileEvent(eventType: ExcelEventType, filePath: string) {
    if (!this.isAllowedExcelFile(filePath) || !fs.existsSync(filePath)) return;

    const oldRename = Array.from(this.pendingRenames.keys()).find((deletedPath) => path.dirname(deletedPath) === path.dirname(filePath));
    if (oldRename && eventType === 'excel_file_created') {
      this.pendingRenames.delete(oldRename);
      eventType = 'excel_file_renamed';
    }

    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const analysis = this.config.excelDeepRead && ext !== '.pdf'
      ? await this.analyzeFile(filePath, stats.size, stats.mtime.toISOString())
      : this.emptyAnalysis();

    if (analysis.snapshot) this.snapshots.set(filePath, analysis.snapshot);
    const summary = this.buildSummary(eventType, filePath, analysis);

    this.emit('business-event', {
      eventId: cryptoRandomId(),
      machineId: this.config.machineId,
      machineName: this.config.machineName,
      eventType,
      fileName: path.basename(filePath),
      filePath,
      sheetName: analysis.primarySheet,
      detectedAmount: analysis.detectedAmount,
      currency: this.config.currency,
      actionSummary: summary,
      oldValue: analysis.oldValue,
      newValue: analysis.newValue,
      createdRows: analysis.createdRows,
      updatedRows: analysis.updatedRows,
      deletedRows: analysis.deletedRows,
      totalCollected: analysis.totalCollected,
      totalIncome: analysis.totalIncome,
      totalSales: analysis.totalSales,
      changedSheets: analysis.changedSheets,
      importantCells: analysis.importantCells,
      fileSize: stats.size,
      fileModifiedAt: stats.mtime.toISOString(),
      timestamp: new Date().toISOString(),
      syncStatus: 'pending',
    } satisfies ExcelBusinessEvent);
  }

  private emitBasicEvent(eventType: ExcelEventType, filePath: string, actionSummary: string) {
    this.emit('business-event', {
      eventId: cryptoRandomId(),
      machineId: this.config.machineId,
      machineName: this.config.machineName,
      eventType,
      fileName: path.basename(filePath),
      filePath,
      currency: this.config.currency,
      actionSummary,
      createdRows: 0,
      updatedRows: 0,
      deletedRows: eventType === 'excel_file_deleted' ? 1 : 0,
      totalCollected: 0,
      totalIncome: 0,
      totalSales: 0,
      changedSheets: [],
      importantCells: [],
      fileSize: 0,
      timestamp: new Date().toISOString(),
      syncStatus: 'pending',
    } satisfies ExcelBusinessEvent);
  }

  private async analyzeFile(filePath: string, fileSize: number, fileModifiedAt: string): Promise<FileAnalysis> {
    try {
      const workbook = xlsx.readFile(filePath, { cellDates: true });
      const previous = this.snapshots.get(filePath);
      const snapshot: FileSnapshot = { sheets: {}, fileSize, fileModifiedAt };
      const analysis = this.emptyAnalysis();
      analysis.snapshot = snapshot;

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
        const headers = (rows[0] || []).map((header) => String(header || '').trim());
        const dataRows = rows.slice(1);
        snapshot.sheets[sheetName] = { headers, rows: dataRows };

        const sheetTotals = this.calculateSheetTotals(headers, dataRows);
        analysis.totalCollected += sheetTotals.totalCollected;
        analysis.totalIncome += sheetTotals.totalIncome;
        analysis.totalSales += sheetTotals.totalSales;
        if (sheetTotals.detectedAmount !== undefined) analysis.detectedAmount = sheetTotals.detectedAmount;

        const oldSheet = previous?.sheets[sheetName];
        const diff = this.diffSheet(sheetName, headers, oldSheet?.rows || [], dataRows);
        analysis.createdRows += diff.createdRows;
        analysis.updatedRows += diff.updatedRows;
        analysis.deletedRows += diff.deletedRows;
        analysis.importantCells.push(...diff.importantCells);
        if (diff.changed && !analysis.changedSheets.includes(sheetName)) analysis.changedSheets.push(sheetName);
        if (!analysis.primarySheet && diff.changed) analysis.primarySheet = sheetName;
        if (analysis.oldValue === undefined && diff.oldValue !== undefined) analysis.oldValue = diff.oldValue;
        if (analysis.newValue === undefined && diff.newValue !== undefined) analysis.newValue = diff.newValue;
      }

      analysis.totalCollected = roundMoney(analysis.totalCollected, this.config.decimalPlaces);
      analysis.totalIncome = roundMoney(analysis.totalIncome, this.config.decimalPlaces);
      analysis.totalSales = roundMoney(analysis.totalSales, this.config.decimalPlaces);
      return analysis;
    } catch (error) {
      this.emit('error-log', `No se pudo leer archivo Excel: ${filePath}. ${String(error)}`);
      return this.emptyAnalysis();
    }
  }

  private calculateSheetTotals(headers: string[], rows: unknown[][]) {
    let totalCollected = 0;
    let totalIncome = 0;
    let totalSales = 0;
    let detectedAmount: number | undefined;

    headers.forEach((header, index) => {
      if (!hasBusinessAmountColumn(header)) return;
      for (const row of rows) {
        const amount = toNumber(row[index], this.config.decimalPlaces);
        if (amount === undefined) continue;
        detectedAmount = amount;
        if (isCollectionColumn(header)) totalCollected += amount;
        if (isIncomeColumn(header)) totalIncome += amount;
        if (normalize(header).includes('venta')) totalSales += amount;
      }
    });

    return {
      totalCollected: roundMoney(totalCollected, this.config.decimalPlaces),
      totalIncome: roundMoney(totalIncome, this.config.decimalPlaces),
      totalSales: roundMoney(totalSales || totalIncome, this.config.decimalPlaces),
      detectedAmount,
    };
  }

  private diffSheet(sheetName: string, headers: string[], oldRows: unknown[][], newRows: unknown[][]) {
    const result = {
      createdRows: Math.max(0, newRows.length - oldRows.length),
      updatedRows: 0,
      deletedRows: Math.max(0, oldRows.length - newRows.length),
      changed: false,
      importantCells: [] as Array<{ sheetName: string; row: number; column: string; oldValue?: unknown; newValue?: unknown }>,
      oldValue: undefined as number | undefined,
      newValue: undefined as number | undefined,
    };

    const max = Math.min(oldRows.length, newRows.length);
    for (let rowIndex = 0; rowIndex < max; rowIndex++) {
      if (rowHash(oldRows[rowIndex]) === rowHash(newRows[rowIndex])) continue;
      result.updatedRows += 1;
      result.changed = true;

      for (let colIndex = 0; colIndex < Math.max(oldRows[rowIndex].length, newRows[rowIndex].length); colIndex++) {
        const oldValue = oldRows[rowIndex][colIndex];
        const newValue = newRows[rowIndex][colIndex];
        if (oldValue === newValue) continue;
        const column = headers[colIndex] || `Col_${colIndex + 1}`;
        if (!hasBusinessAmountColumn(column)) continue;
        result.importantCells.push({ sheetName, row: rowIndex + 2, column, oldValue, newValue });
        const oldAmount = toNumber(oldValue, this.config.decimalPlaces);
        const newAmount = toNumber(newValue, this.config.decimalPlaces);
        if (oldAmount !== undefined && newAmount !== undefined) {
          result.oldValue = oldAmount;
          result.newValue = newAmount;
        }
      }
    }

    if (result.createdRows > 0 || result.deletedRows > 0) result.changed = true;
    return result;
  }

  private emptyAnalysis(): FileAnalysis {
    return {
      createdRows: 0,
      updatedRows: 0,
      deletedRows: 0,
      totalCollected: 0,
      totalIncome: 0,
      totalSales: 0,
      changedSheets: [],
      importantCells: [],
    };
  }

  private buildSummary(eventType: ExcelEventType, filePath: string, analysis: FileAnalysis) {
    const fileName = path.basename(filePath);
    if (eventType === 'excel_file_opened') return `Se abrió el archivo Excel ${fileName}.`;
    if (eventType === 'excel_file_closed') return `Se cerró el archivo Excel ${fileName}.`;
    if (eventType === 'excel_file_created') return `Se creó o detectó el archivo Excel ${fileName}.`;
    if (eventType === 'excel_file_renamed') return `Se renombró o movió un archivo Excel a ${fileName}.`;
    const amount = analysis.detectedAmount !== undefined ? ` Monto detectado: ${analysis.detectedAmount.toFixed(this.config.decimalPlaces)}.` : '';
    return `Se modificó ${fileName}: ${analysis.createdRows} filas nuevas, ${analysis.updatedRows} filas editadas, ${analysis.deletedRows} filas eliminadas.${amount}`;
  }
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function roundMoney(value: number, decimalPlaces: number) {
  return Number(value.toFixed(decimalPlaces));
}
