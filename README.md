# Centro de Documentación

Bienvenido a la carpeta de documentación de **VisionControl**.

- Guía Técnica de Arquitectura
- Estado Actual del Proyecto

## VisionControl Empresarial

El sistema ahora incluye monitoreo financiero y operativo sobre Google Sheets en modo solo lectura.

### Variables de entorno principales

```env
DATABASE_URL="postgresql://user:password@host:5432/visioncontrol?schema=public"
DASHBOARD_ACCESS_TOKEN="token-interno-seguro"
JWT_ACCESS_SECRET="cambia-esto"
JWT_REFRESH_SECRET="cambia-esto"
GOOGLE_DRIVE_FOLDER_ID="1WQBpwMqhCtLf3T5ca4s48yTjKyLVwUB2"
GOOGLE_SYNC_MODE="public"
GOOGLE_SYNC_INTERVAL_MINUTES="5"
GOOGLE_DRIVE_READ_ONLY="true"
```

### Comandos

```bash
pnpm install
pnpm --filter server test
pnpm --filter server build
pnpm --filter frontend build
pnpm --filter server prisma migrate deploy --schema=prisma/schema.prisma
pnpm dev
```

### Seguridad Google

VisionControl no escribe, borra, crea ni cambia permisos en Google Drive o Google Sheets. En `GOOGLE_SYNC_MODE=public` descarga temporalmente cada Sheet público como XLSX, lo analiza, elimina la copia temporal y guarda resultados internos en PostgreSQL. El modo `drive_api` queda preparado para OAuth 2.0 de solo lectura.

### Rutas nuevas

```text
GET  /api/drive/status
POST /api/drive/sync
GET  /api/drive/documents
POST /api/drive/documents
GET  /api/drive/documents/:id
GET  /api/drive/documents/:id/sheets
GET  /api/drive/changes
GET  /api/finance/summary
GET  /api/finance/incomes
GET  /api/finance/expenses
GET  /api/finance/purchases
GET  /api/finance/categories
GET  /api/finance/providers
GET  /api/finance/comparison
GET  /api/notifications/enterprise
GET  /api/reports
POST /api/reports/generate
GET  /api/reports/:id/download
```
