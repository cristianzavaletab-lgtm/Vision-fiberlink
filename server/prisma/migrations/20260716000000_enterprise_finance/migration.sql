CREATE TYPE "DriveSyncStatus" AS ENUM ('PENDIENTE','SINCRONIZANDO','ACTUALIZADO','CON_CAMBIOS','SIN_CAMBIOS','ERROR','SIN_ACCESO','ARCHIVO_NO_DISPONIBLE');
CREATE TYPE "FinancialRecordType" AS ENUM ('INCOME','EXPENSE','PURCHASE','OTHER');

CREATE TABLE "DriveFolder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "googleFolderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "syncMode" TEXT NOT NULL DEFAULT 'public',
  "readOnly" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "nextSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DriveDocument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "folderId" TEXT,
  "googleFileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "mimeType" TEXT,
  "status" "DriveSyncStatus" NOT NULL DEFAULT 'PENDIENTE',
  "knownModifiedAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastContentHash" TEXT,
  "lastError" TEXT,
  "unavailableSinceAt" TIMESTAMP(3),
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DriveFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DriveSheet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  "manualCategory" TEXT,
  "sourceIndex" INTEGER NOT NULL DEFAULT 0,
  "headerMapJson" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveSheet_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DriveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DriveSync" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "folderId" TEXT,
  "status" "DriveSyncStatus" NOT NULL DEFAULT 'PENDIENTE',
  "mode" TEXT NOT NULL DEFAULT 'public',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "foundCount" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "newDocuments" INTEGER NOT NULL DEFAULT 0,
  "changedDocuments" INTEGER NOT NULL DEFAULT 0,
  "changesDetected" INTEGER NOT NULL DEFAULT 0,
  "nextSyncAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveSync_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DriveFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DriveSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "sheetId" TEXT,
  "versionHash" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "sourceModifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DriveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DriveSnapshot_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "DriveSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FinancialRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "sheetId" TEXT NOT NULL,
  "rowKey" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "type" "FinancialRecordType" NOT NULL DEFAULT 'OTHER',
  "date" TIMESTAMP(3),
  "originalDate" TEXT,
  "description" TEXT,
  "category" TEXT,
  "provider" TEXT,
  "customer" TEXT,
  "amount" DECIMAL(18,2),
  "currency" TEXT NOT NULL DEFAULT 'PEN',
  "status" TEXT,
  "paymentMethod" TEXT,
  "responsible" TEXT,
  "location" TEXT,
  "originalDataJson" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "reviewedAt" TIMESTAMP(3),
  "internalCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DriveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FinancialRecord_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "DriveSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "IncomeRecord" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"financialRecordId" TEXT NOT NULL UNIQUE,"service" TEXT,"sector" TEXT,"customer" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "IncomeRecord_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "ExpenseRecord" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"financialRecordId" TEXT NOT NULL UNIQUE,"hasReceipt" BOOLEAN NOT NULL DEFAULT false,"isRecurring" BOOLEAN NOT NULL DEFAULT false,"isExtraordinary" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "ExpenseRecord_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "PurchaseRecord" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"financialRecordId" TEXT NOT NULL UNIQUE,"product" TEXT,"quantity" DECIMAL(18,2),"unitPrice" DECIMAL(18,2),"expectedDate" TIMESTAMP(3),"priority" TEXT,"isPending" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PurchaseRecord_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "DocumentChange" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"documentId" TEXT NOT NULL,"type" TEXT NOT NULL,"importance" TEXT NOT NULL DEFAULT 'medium',"previousValue" TEXT,"newValue" TEXT,"message" TEXT NOT NULL,"detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "DocumentChange_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DriveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "RowChange" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"documentId" TEXT NOT NULL,"sheetId" TEXT,"rowKey" TEXT NOT NULL,"approximateRow" INTEGER,"changeType" TEXT NOT NULL,"fieldName" TEXT,"previousValue" TEXT,"newValue" TEXT,"importance" TEXT NOT NULL DEFAULT 'medium',"detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"modifiedByLabel" TEXT NOT NULL DEFAULT 'Modificado en Google Sheets; usuario no disponible',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "RowChange_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DriveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "RowChange_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "DriveSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE "Notification" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"type" TEXT NOT NULL,"title" TEXT NOT NULL,"message" TEXT NOT NULL,"importance" TEXT NOT NULL DEFAULT 'medium',"dedupeKey" TEXT,"read" BOOLEAN NOT NULL DEFAULT false,"payloadJson" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"readAt" TIMESTAMP(3));
CREATE TABLE "Report" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"type" TEXT NOT NULL,"periodStart" TIMESTAMP(3) NOT NULL,"periodEnd" TIMESTAMP(3) NOT NULL,"title" TEXT NOT NULL,"summaryJson" TEXT NOT NULL,"sourceJson" TEXT,"format" TEXT NOT NULL DEFAULT 'json',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ReportSchedule" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"type" TEXT NOT NULL,"frequency" TEXT NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT true,"nextRunAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "InternalNote" ("id" TEXT NOT NULL PRIMARY KEY,"tenantId" TEXT NOT NULL,"documentId" TEXT,"sheetId" TEXT,"financialRecordId" TEXT,"note" TEXT NOT NULL,"createdBy" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "InternalNote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DriveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "InternalNote_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "DriveSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE,CONSTRAINT "InternalNote_financialRecordId_fkey" FOREIGN KEY ("financialRecordId") REFERENCES "FinancialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE);

CREATE UNIQUE INDEX "DriveFolder_tenantId_googleFolderId_key" ON "DriveFolder"("tenantId", "googleFolderId");
CREATE UNIQUE INDEX "DriveDocument_tenantId_googleFileId_key" ON "DriveDocument"("tenantId", "googleFileId");
CREATE UNIQUE INDEX "DriveSheet_documentId_name_key" ON "DriveSheet"("documentId", "name");
CREATE UNIQUE INDEX "FinancialRecord_tenantId_documentId_sheetId_rowKey_key" ON "FinancialRecord"("tenantId", "documentId", "sheetId", "rowKey");
CREATE UNIQUE INDEX "Notification_tenantId_dedupeKey_key" ON "Notification"("tenantId", "dedupeKey");

CREATE INDEX "DriveFolder_tenantId_idx" ON "DriveFolder"("tenantId");
CREATE INDEX "DriveDocument_tenantId_idx" ON "DriveDocument"("tenantId");
CREATE INDEX "DriveDocument_status_idx" ON "DriveDocument"("status");
CREATE INDEX "DriveDocument_lastContentHash_idx" ON "DriveDocument"("lastContentHash");
CREATE INDEX "DriveSheet_tenantId_idx" ON "DriveSheet"("tenantId");
CREATE INDEX "DriveSheet_documentId_idx" ON "DriveSheet"("documentId");
CREATE INDEX "DriveSheet_category_idx" ON "DriveSheet"("category");
CREATE INDEX "DriveSync_tenantId_idx" ON "DriveSync"("tenantId");
CREATE INDEX "DriveSync_startedAt_idx" ON "DriveSync"("startedAt");
CREATE INDEX "DriveSync_status_idx" ON "DriveSync"("status");
CREATE INDEX "DriveSnapshot_tenantId_idx" ON "DriveSnapshot"("tenantId");
CREATE INDEX "DriveSnapshot_documentId_idx" ON "DriveSnapshot"("documentId");
CREATE INDEX "DriveSnapshot_sheetId_idx" ON "DriveSnapshot"("sheetId");
CREATE INDEX "DriveSnapshot_versionHash_idx" ON "DriveSnapshot"("versionHash");
CREATE INDEX "FinancialRecord_tenantId_idx" ON "FinancialRecord"("tenantId");
CREATE INDEX "FinancialRecord_documentId_idx" ON "FinancialRecord"("documentId");
CREATE INDEX "FinancialRecord_date_idx" ON "FinancialRecord"("date");
CREATE INDEX "FinancialRecord_type_idx" ON "FinancialRecord"("type");
CREATE INDEX "FinancialRecord_category_idx" ON "FinancialRecord"("category");
CREATE INDEX "FinancialRecord_provider_idx" ON "FinancialRecord"("provider");
CREATE INDEX "FinancialRecord_contentHash_idx" ON "FinancialRecord"("contentHash");
CREATE INDEX "FinancialRecord_rowKey_idx" ON "FinancialRecord"("rowKey");
CREATE INDEX "IncomeRecord_tenantId_idx" ON "IncomeRecord"("tenantId");
CREATE INDEX "ExpenseRecord_tenantId_idx" ON "ExpenseRecord"("tenantId");
CREATE INDEX "PurchaseRecord_tenantId_idx" ON "PurchaseRecord"("tenantId");
CREATE INDEX "PurchaseRecord_isPending_idx" ON "PurchaseRecord"("isPending");
CREATE INDEX "DocumentChange_tenantId_idx" ON "DocumentChange"("tenantId");
CREATE INDEX "DocumentChange_documentId_idx" ON "DocumentChange"("documentId");
CREATE INDEX "DocumentChange_detectedAt_idx" ON "DocumentChange"("detectedAt");
CREATE INDEX "DocumentChange_type_idx" ON "DocumentChange"("type");
CREATE INDEX "RowChange_tenantId_idx" ON "RowChange"("tenantId");
CREATE INDEX "RowChange_documentId_idx" ON "RowChange"("documentId");
CREATE INDEX "RowChange_sheetId_idx" ON "RowChange"("sheetId");
CREATE INDEX "RowChange_rowKey_idx" ON "RowChange"("rowKey");
CREATE INDEX "RowChange_changeType_idx" ON "RowChange"("changeType");
CREATE INDEX "RowChange_detectedAt_idx" ON "RowChange"("detectedAt");
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX "Notification_read_idx" ON "Notification"("read");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX "Notification_type_idx" ON "Notification"("type");
CREATE INDEX "Report_tenantId_idx" ON "Report"("tenantId");
CREATE INDEX "Report_type_idx" ON "Report"("type");
CREATE INDEX "Report_periodStart_periodEnd_idx" ON "Report"("periodStart", "periodEnd");
CREATE INDEX "ReportSchedule_tenantId_idx" ON "ReportSchedule"("tenantId");
CREATE INDEX "ReportSchedule_enabled_idx" ON "ReportSchedule"("enabled");
CREATE INDEX "InternalNote_tenantId_idx" ON "InternalNote"("tenantId");
CREATE INDEX "InternalNote_documentId_idx" ON "InternalNote"("documentId");
CREATE INDEX "InternalNote_sheetId_idx" ON "InternalNote"("sheetId");
CREATE INDEX "InternalNote_financialRecordId_idx" ON "InternalNote"("financialRecordId");
