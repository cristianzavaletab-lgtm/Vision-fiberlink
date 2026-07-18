import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { compareSnapshots } from './finance/snapshotComparer';
import { hashValue, normalizeRows, normalizeText } from './finance/normalization';

type PrismaLike = PrismaClient;
type EmitFn = (event: string, payload: unknown) => void;

const KNOWN_DOCUMENT_IDS = [
  '17J6zkObI_G0GM0tckYcHzSuzMCGW9wdGswxAMc18bi4',
  '1FPBM5eBUaVXmr6hNlF9_N62zG5AO-jg7jDv6RtgmxSo',
  '1I_Z8UC68XA1bzfhdpOdCfCTBjqauH9CkD-L4kzf1sIc',
  '1UHASFjCtjQtJsGneKqkPtUqimo4GHOQrWYQQ61QhkBQ',
  '1ZhWizNrlBksZ2LLdMeBDAcTHWc9IDnkW7RzcAIyLd2A',
  '1aulFjNRRoVccN3dBbz2UWg-Cy7vfr2I6Pw9CLnuyZ0w',
  '1mSe3XGlPnsO0jb557ssAjUKVJFn42yzBHOdE9_kUAac',
  '1nB7iojRy5j-IAmPeUbH25ejFBbZX0iAtsPTYDnxx1YE',
  '1nONP4TMK8SPVyPV6gR3aYFP_AFhZwAMXWsCoqcxPpfc',
  '1ziAsqPagtD6wqU6ciCZ_Um8jNgoTjVyK-GtnmuIyVuc',
];

function configuredPublicSheetIds() {
  return (process.env.GOOGLE_PUBLIC_SHEET_IDS || '')
    .split(/[\s,;]+/)
    .map((value) => extractFileId(value.trim()))
    .filter(Boolean);
}

export class DriveSyncService {
  private running = false;
  private timer?: NodeJS.Timeout;
  private readonly mode = process.env.GOOGLE_SYNC_MODE || 'public';
  private readonly intervalMinutes = Math.max(Number(process.env.GOOGLE_SYNC_INTERVAL_MINUTES || 5), 1);
  private readonly folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1WQBpwMqhCtLf3T5ca4s48yTjKyLVwUB2';

  constructor(private readonly prisma: PrismaLike, private readonly emit: EmitFn = () => undefined) {}

  start(tenantId: string) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.syncNow(tenantId).catch((error) => console.error('[DriveSync] scheduled sync failed:', safeError(error)));
    }, this.intervalMinutes * 60 * 1000);
    setTimeout(() => this.syncNow(tenantId).catch(() => undefined), 1500);
  }

  getNextSyncAt() {
    return new Date(Date.now() + this.intervalMinutes * 60 * 1000);
  }

  async status(tenantId: string) {
    try {
      const [folder, lastSync, documents, notifications] = await Promise.all([
        this.ensureFolder(tenantId),
        this.prisma.driveSync.findFirst({ where: { tenantId }, orderBy: { startedAt: 'desc' } }),
        this.prisma.driveDocument.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' }, take: 200 }),
        this.prisma.notification.count({ where: { tenantId, read: false } }),
      ]);
      const visibleDocuments = documents.length ? documents : this.configuredDocuments();
      return {
        mode: this.mode,
        readOnly: process.env.GOOGLE_DRIVE_READ_ONLY !== 'false',
        folderId: this.folderId,
        lastSyncAt: folder.lastSyncAt || lastSync?.finishedAt || null,
        nextSyncAt: folder.nextSyncAt || this.getNextSyncAt(),
        running: this.running,
        lastSync,
        filesFound: visibleDocuments.length,
        processed: documents.filter((document) => document.lastSyncAt).length,
        errors: documents.filter((document) => ['ERROR', 'SIN_ACCESO', 'ARCHIVO_NO_DISPONIBLE'].includes(document.status)).length,
        unreadNotifications: notifications,
        documents: visibleDocuments,
      };
    } catch (error) {
      console.error('[DriveSync] status fallback:', safeError(error));
      return this.fallbackStatus(error);
    }
  }

  fallbackStatus(error?: unknown) {
    const documents = this.configuredDocuments();
    return {
      mode: this.mode,
      readOnly: process.env.GOOGLE_DRIVE_READ_ONLY !== 'false',
      folderId: this.folderId,
      lastSyncAt: null,
      nextSyncAt: this.getNextSyncAt(),
      running: this.running,
      filesFound: documents.length,
      processed: 0,
      errors: error ? 1 : 0,
      unreadNotifications: 0,
      documents,
      error: error ? safeError(error) : null,
    };
  }

  configuredDocuments() {
    return knownDocumentIds().map((googleFileId) => ({
      id: `configured:${googleFileId}`,
      googleFileId,
      name: `Google Sheet ${googleFileId.slice(0, 8)}`,
      url: publicSheetUrl(googleFileId),
      mimeType: 'application/vnd.google-apps.spreadsheet',
      status: 'PENDIENTE',
      lastSyncAt: null,
      knownModifiedAt: null,
      updatedAt: null,
      sheets: [],
    }));
  }

  async addDocument(tenantId: string, input: { googleFileId?: string; url?: string; name?: string }) {
    const googleFileId = input.googleFileId || extractFileId(input.url || '');
    if (!googleFileId) throw Object.assign(new Error('googleFileId or valid Google Sheets URL is required'), { statusCode: 400 });
    const folder = await this.ensureFolder(tenantId);
    return this.prisma.driveDocument.upsert({
      where: { tenantId_googleFileId: { tenantId, googleFileId } },
      update: { name: input.name || `Google Sheet ${googleFileId.slice(0, 8)}`, url: input.url || publicSheetUrl(googleFileId), status: 'PENDIENTE', folderId: folder.id },
      create: { tenantId, folderId: folder.id, googleFileId, name: input.name || `Google Sheet ${googleFileId.slice(0, 8)}`, url: input.url || publicSheetUrl(googleFileId), mimeType: 'application/vnd.google-apps.spreadsheet', status: 'PENDIENTE' },
    });
  }

  async syncNow(tenantId: string) {
    if (this.running) return { accepted: false, reason: 'SINCRONIZANDO' };
    this.running = true;
    const startedAt = Date.now();
    const folder = await this.ensureFolder(tenantId);
    const sync = await this.prisma.driveSync.create({ data: { tenantId, folderId: folder.id, mode: this.mode, status: 'SINCRONIZANDO', nextSyncAt: this.getNextSyncAt() } });
    const stats = { foundCount: 0, processedCount: 0, errorCount: 0, newDocuments: 0, changedDocuments: 0, changesDetected: 0 };
    this.emit('drive:sync-started', { syncId: sync.id, tenantId });

    try {
      const documents = await this.discoverDocuments(tenantId, folder.id);
      stats.foundCount = documents.length;
      for (const document of documents) {
        try {
          const result = await this.processDocument(tenantId, document.id);
          stats.processedCount += 1;
          if (result.isNew) stats.newDocuments += 1;
          if (result.changed) stats.changedDocuments += 1;
          stats.changesDetected += result.changes;
        } catch (error) {
          stats.errorCount += 1;
          await this.markDocumentError(document.id, safeError(error));
        }
      }
      const status = stats.changesDetected > 0 || stats.newDocuments > 0 ? 'CON_CAMBIOS' : 'SIN_CAMBIOS';
      const finished = await this.prisma.driveSync.update({ where: { id: sync.id }, data: { ...stats, status, finishedAt: new Date(), durationMs: Date.now() - startedAt, nextSyncAt: this.getNextSyncAt() } });
      await this.prisma.driveFolder.update({ where: { id: folder.id }, data: { lastSyncAt: new Date(), nextSyncAt: this.getNextSyncAt() } });
      this.emit('drive:sync-finished', finished);
      return { accepted: true, sync: finished };
    } catch (error) {
      const message = safeError(error);
      const finished = await this.prisma.driveSync.update({ where: { id: sync.id }, data: { ...stats, status: 'ERROR', errorMessage: message, finishedAt: new Date(), durationMs: Date.now() - startedAt, nextSyncAt: this.getNextSyncAt() } });
      await this.createNotification(tenantId, 'ERROR_DE_SINCRONIZACION', 'Error de sincronización', 'No se pudo leer la fuente de Google. Se realizará otro intento.', 'high', `sync-error:${sync.id}`);
      this.emit('drive:sync-failed', finished);
      return { accepted: true, sync: finished };
    } finally {
      this.running = false;
    }
  }

  private async ensureFolder(tenantId: string) {
    return this.prisma.driveFolder.upsert({
      where: { tenantId_googleFolderId: { tenantId, googleFolderId: this.folderId } },
      update: { syncMode: this.mode, readOnly: true, nextSyncAt: this.getNextSyncAt() },
      create: { tenantId, googleFolderId: this.folderId, name: 'MENSUAL ZONA SIERRA', sourceUrl: `https://drive.google.com/drive/folders/${this.folderId}`, syncMode: this.mode, readOnly: true, nextSyncAt: this.getNextSyncAt() },
    });
  }

  private async discoverDocuments(tenantId: string, folderId: string) {
    const known = new Set(knownDocumentIds());
    const existing = await this.prisma.driveDocument.findMany({ where: { tenantId } });
    existing.forEach((document) => known.add(document.googleFileId));
    if (this.mode === 'drive_api') {
      const discovered = await this.discoverWithDriveApi();
      discovered.forEach((id) => known.add(id));
    }

    const documents = [];
    for (const googleFileId of known) {
      const existed = existing.some((document) => document.googleFileId === googleFileId);
      const document = await this.prisma.driveDocument.upsert({
        where: { tenantId_googleFileId: { tenantId, googleFileId } },
        update: { folderId, url: publicSheetUrl(googleFileId) },
        create: { tenantId, folderId, googleFileId, name: `Google Sheet ${googleFileId.slice(0, 8)}`, url: publicSheetUrl(googleFileId), mimeType: 'application/vnd.google-apps.spreadsheet', status: 'PENDIENTE' },
      });
      if (!existed) await this.createNotification(tenantId, 'NUEVO_DOCUMENTO', 'Nueva hoja mensual detectada', document.name, 'medium', `new-doc:${googleFileId}`);
      documents.push(document);
    }
    return documents;
  }

  private async discoverWithDriveApi() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return [];
    // OAuth read-only architecture is intentionally isolated here. Once refresh-token storage is configured,
    // this method can call Drive API files.list with scope drive.metadata.readonly without changing callers.
    return [] as string[];
  }

  private async processDocument(tenantId: string, documentId: string) {
    const document = await this.prisma.driveDocument.findUniqueOrThrow({ where: { id: documentId } });
    const downloaded = await this.downloadPublicSheet(document.googleFileId);
    if (document.lastContentHash === downloaded.contentHash) {
      await this.prisma.driveDocument.update({ where: { id: document.id }, data: { status: 'SIN_CAMBIOS', lastSyncAt: new Date(), knownModifiedAt: downloaded.modifiedAt, lastError: null } });
      return { isNew: !document.lastSyncAt, changed: false, changes: 0 };
    }

    const workbook = XLSX.read(downloaded.buffer, { type: 'buffer', cellDates: true });
    const hasDetailedIncomeSheet = workbook.SheetNames.some((name) => /^\s*INGRESOS\s*$/i.test(normalizeText(name)));
    const hasDetailedExpenseSheet = workbook.SheetNames.some((name) => /^\s*GASTOS\s*$/i.test(normalizeText(name)));
    let totalChanges = 0;
    let totalRows = 0;
    for (let index = 0; index < workbook.SheetNames.length; index++) {
      const sheetName = workbook.SheetNames[index];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: null });
      const existingSheet = await this.prisma.driveSheet.findUnique({ where: { documentId_name: { documentId: document.id, name: sheetName } } });
      const normalized = normalizeRows(sheetName, rawRows, existingSheet?.manualCategory || undefined, {
        includeLiquidationIncome: !hasDetailedIncomeSheet,
        includeLiquidationExpense: !hasDetailedExpenseSheet,
      });
      const sheet = await this.prisma.driveSheet.upsert({
        where: { documentId_name: { documentId: document.id, name: sheetName } },
        update: { normalizedName: normalizeText(sheetName), category: existingSheet?.manualCategory || normalized.category, sourceIndex: index, headerMapJson: JSON.stringify(normalized.headerMap), lastSyncAt: new Date() },
        create: { tenantId, documentId: document.id, name: sheetName, normalizedName: normalizeText(sheetName), category: normalized.category, sourceIndex: index, headerMapJson: JSON.stringify(normalized.headerMap), lastSyncAt: new Date() },
      });
      if (normalized.category === 'UNCLASSIFIED') await this.createNotification(tenantId, 'DATOS_INCOMPLETOS', 'Hoja no clasificada', `La hoja ${sheetName} requiere clasificación manual.`, 'low', `unclassified:${document.id}:${sheetName}`);

      const previousSnapshot = await this.prisma.driveSnapshot.findFirst({ where: { tenantId, documentId: document.id, sheetId: sheet.id }, orderBy: { createdAt: 'desc' } });
      const previousRows = previousSnapshot ? JSON.parse(previousSnapshot.snapshotJson) : [];
      const diffs = previousSnapshot ? compareSnapshots(previousRows, normalized.rows) : [];
      totalChanges += diffs.length;
      totalRows += normalized.rows.length;
      await this.persistRows(tenantId, document.id, sheet.id, normalized.rows);
      await this.persistDiffs(tenantId, document.id, sheet.id, diffs, document.name, sheetName);
      await this.prisma.driveSnapshot.create({ data: { tenantId, documentId: document.id, sheetId: sheet.id, versionHash: hashValue(normalized.rows), snapshotJson: JSON.stringify(normalized.rows), rowCount: normalized.rows.length, sourceModifiedAt: downloaded.modifiedAt } });
    }

    await this.prisma.driveDocument.update({ where: { id: document.id }, data: { status: totalChanges > 0 ? 'CON_CAMBIOS' : 'ACTUALIZADO', knownModifiedAt: downloaded.modifiedAt, lastContentHash: downloaded.contentHash, lastSyncAt: new Date(), lastError: null, unavailableSinceAt: null } });
    await this.prisma.driveSnapshot.create({ data: { tenantId, documentId: document.id, versionHash: downloaded.contentHash, snapshotJson: JSON.stringify({ sheets: workbook.SheetNames }), rowCount: totalRows, sourceModifiedAt: downloaded.modifiedAt } });
    return { isNew: !document.lastSyncAt, changed: totalChanges > 0, changes: totalChanges };
  }

  private async persistRows(tenantId: string, documentId: string, sheetId: string, rows: ReturnType<typeof normalizeRows>['rows']) {
    const activeKeys = new Set(rows.map((row) => row.rowKey));
    const existing = await this.prisma.financialRecord.findMany({ where: { tenantId, documentId, sheetId, isActive: true }, select: { id: true, rowKey: true } });
    for (const row of rows) {
      const data: any = {
        tenantId, documentId, sheetId, rowKey: row.rowKey, sourceRow: row.sourceRow, type: row.type, date: row.date, originalDate: row.originalDate,
        description: row.description, category: row.category, provider: row.provider, customer: row.customer, amount: row.amount, currency: row.currency,
        status: row.status, paymentMethod: row.paymentMethod, responsible: row.responsible, location: row.location, originalDataJson: JSON.stringify(row.originalData), contentHash: row.contentHash, lastSeenAt: new Date(), isActive: true,
      };
      const saved = await this.prisma.financialRecord.upsert({ where: { tenantId_documentId_sheetId_rowKey: { tenantId, documentId, sheetId, rowKey: row.rowKey } }, update: data, create: data });
      if (row.type === 'INCOME') await this.prisma.incomeRecord.upsert({ where: { financialRecordId: saved.id }, update: { service: row.description, customer: row.customer }, create: { tenantId, financialRecordId: saved.id, service: row.description, customer: row.customer } });
      if (row.type === 'EXPENSE') await this.prisma.expenseRecord.upsert({ where: { financialRecordId: saved.id }, update: { hasReceipt: row.hasReceipt }, create: { tenantId, financialRecordId: saved.id, hasReceipt: row.hasReceipt } });
      if (row.type === 'PURCHASE') await this.prisma.purchaseRecord.upsert({ where: { financialRecordId: saved.id }, update: { product: row.product, quantity: row.quantity, unitPrice: row.unitPrice, expectedDate: row.expectedDate, priority: row.priority, isPending: row.isPendingPurchase }, create: { tenantId, financialRecordId: saved.id, product: row.product, quantity: row.quantity, unitPrice: row.unitPrice, expectedDate: row.expectedDate, priority: row.priority, isPending: row.isPendingPurchase } });
    }
    const inactive = existing.filter((record) => !activeKeys.has(record.rowKey)).map((record) => record.id);
    if (inactive.length) await this.prisma.financialRecord.updateMany({ where: { id: { in: inactive } }, data: { isActive: false, lastSeenAt: new Date() } });
  }

  private async persistDiffs(tenantId: string, documentId: string, sheetId: string, diffs: ReturnType<typeof compareSnapshots>, documentName: string, sheetName: string) {
    for (const diff of diffs) {
      await this.prisma.rowChange.create({ data: { tenantId, documentId, sheetId, rowKey: diff.rowKey, approximateRow: diff.approximateRow, changeType: diff.changeType, fieldName: diff.fieldName, previousValue: diff.previousValue, newValue: diff.newValue, importance: diff.importance } });
      await this.createChangeNotification(tenantId, diff, documentName, sheetName);
    }
  }

  private async createChangeNotification(tenantId: string, diff: ReturnType<typeof compareSnapshots>[number], documentName: string, sheetName: string) {
    const titleByType: Record<string, string> = { FILA_AGREGADA: 'Nuevo registro', FILA_ELIMINADA: 'Fila eliminada', MONTO_CAMBIADO: 'Modificación de monto' };
    const title = titleByType[diff.changeType] || 'Cambio detectado';
    const message = diff.changeType === 'MONTO_CAMBIADO'
      ? `El monto cambió de ${diff.previousValue || 'sin valor'} a ${diff.newValue || 'sin valor'} en ${sheetName}.`
      : `${diff.changeType.replace(/_/g, ' ').toLowerCase()} en ${documentName} / ${sheetName}.`;
    await this.createNotification(tenantId, diff.changeType, title, message, diff.importance, `${diff.changeType}:${diff.rowKey}:${diff.newValue || diff.previousValue || ''}`);
  }

  private async createNotification(tenantId: string, type: string, title: string, message: string, importance: string, dedupeKey: string) {
    try {
      const notification = await this.prisma.notification.create({ data: { tenantId, type, title, message, importance, dedupeKey, payloadJson: JSON.stringify({ source: 'drive-sync' }) } });
      this.emit('notification:new', notification);
      return notification;
    } catch {
      return null;
    }
  }

  private async markDocumentError(documentId: string, message: string) {
    const status = /403|permission|access/i.test(message) ? 'SIN_ACCESO' : /404|not found|no disponible/i.test(message) ? 'ARCHIVO_NO_DISPONIBLE' : 'ERROR';
    await this.prisma.driveDocument.update({ where: { id: documentId }, data: { status, lastError: message, unavailableSinceAt: status === 'ARCHIVO_NO_DISPONIBLE' ? new Date() : undefined } });
  }

  private async downloadPublicSheet(googleFileId: string) {
    const url = `https://docs.google.com/spreadsheets/d/${googleFileId}/export?format=xlsx`;
    let response: Response | null = null;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!response) throw lastError || new Error('No se pudo descargar Google Sheet.');
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) throw new Error(`Google respondió ${response.status}`);
    if (contentType.includes('text/html')) throw new Error('Google devolvió HTML en lugar de XLSX. Verifica que el archivo sea público como Lector.');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 100) throw new Error('Archivo XLSX incompleto o vacío.');
    const tempPath = path.join(os.tmpdir(), `visioncontrol-${googleFileId}-${Date.now()}.xlsx`);
    await fs.writeFile(tempPath, buffer);
    await fs.rm(tempPath, { force: true });
    const modified = response.headers.get('last-modified');
    return { buffer, contentHash: crypto.createHash('sha256').update(buffer).digest('hex'), modifiedAt: modified ? new Date(modified) : new Date() };
  }
}

function knownDocumentIds() {
  return Array.from(new Set([...KNOWN_DOCUMENT_IDS, ...configuredPublicSheetIds()]));
}

export function publicSheetUrl(fileId: string) {
  return `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
}

export function extractFileId(value: string) {
  return value.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || value.match(/^[a-zA-Z0-9_-]{20,}$/)?.[0] || '';
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
