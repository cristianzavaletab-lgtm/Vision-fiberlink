import * as fs from 'fs';
import * as chokidar from 'chokidar';
import * as xlsx from 'xlsx';
import { EventEmitter } from 'events';
import * as path from 'path';

interface SchemaConfig {
  sheets: {
    [key: string]: {
      amountColumn: string;
    }
  }
}

export class ExcelMonitor extends EventEmitter {
  private filePath: string;
  private watcher: chokidar.FSWatcher | null = null;
  private lastState: Record<string, any[][]> = {};
  private isProcessing = false;
  private schema: SchemaConfig | null = null;

  constructor(filePath: string) {
    super();
    this.filePath = path.resolve(filePath);
    this.loadSchema();
  }

  private loadSchema() {
    const schemaPath = path.join(__dirname, 'schema.json');
    if (fs.existsSync(schemaPath)) {
      try {
        this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        console.log('[ExcelMonitor] Schema cargado correctamente');
      } catch (err) {
        console.error('[ExcelMonitor] Error leyendo schema.json', err);
      }
    } else {
      console.warn('[ExcelMonitor] No se encontró schema.json. Usando convenciones por defecto.');
      this.schema = {
        sheets: {
          "Ventas": { amountColumn: "Monto" },
          "Gastos": { amountColumn: "Importe" }
        }
      };
    }
  }

  private async readExcelWithRetry(retries = 3, backoffMs = 500): Promise<xlsx.WorkBook | null> {
    for (let i = 0; i < retries; i++) {
      try {
        return xlsx.readFile(this.filePath, { cellDates: true });
      } catch (err: any) {
        if (err.code === 'EBUSY' || err.message.includes('EBUSY') || err.message.includes('locked')) {
          console.warn(`[ExcelMonitor] Archivo bloqueado (intento ${i+1}/${retries}). Reintentando en ${backoffMs}ms...`);
          await new Promise(r => setTimeout(r, backoffMs));
          backoffMs *= 2; // Exponential backoff
        } else {
          throw err;
        }
      }
    }
    console.error('[ExcelMonitor] Fallo al leer el archivo después de múltiples reintentos. Está permanentemente bloqueado.');
    return null;
  }

  public async start() {
    if (!fs.existsSync(this.filePath)) {
      console.warn(`[ExcelMonitor] Archivo no existe, monitoreando directorio: ${this.filePath}`);
    }

    try {
      await this.captureState();
    } catch (err) {
      console.error('[ExcelMonitor] Error en la captura inicial', err);
    }

    this.watcher = chokidar.watch(this.filePath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2s for file size to stabilize (important for large Excels)
        pollInterval: 250
      }
    });

    this.watcher.on('change', async () => {
      console.log(`[ExcelMonitor] Cambio detectado en ${this.filePath}`);
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        await this.processChanges();
      } catch (err) {
        console.error('[ExcelMonitor] Error procesando cambios', err);
      } finally {
        this.isProcessing = false;
      }
    });

    console.log(`[ExcelMonitor] Monitoreo iniciado en ${this.filePath}`);
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
    }
  }

  private async captureState() {
    if (!fs.existsSync(this.filePath)) return;
    const wb = await this.readExcelWithRetry();
    if (!wb) return;
    
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });
      this.lastState[sheetName] = data;
    }
  }

  private async processChanges() {
    if (!fs.existsSync(this.filePath)) return;
    
    const wb = await this.readExcelWithRetry();
    if (!wb) {
      // Could not read file, drop event or buffer? We just drop for now, 
      // the next save will trigger another change event anyway.
      return;
    }

    const newState: Record<string, any[][]> = {};
    const changes: any[] = [];

    // --- SCHEMA VALIDATION ---
    if (this.schema) {
      const requiredSheets = Object.keys(this.schema.sheets);
      for (const reqSheet of requiredSheets) {
        if (!wb.SheetNames.includes(reqSheet)) {
          changes.push({
            sheetName: reqSheet,
            action: 'schema_error',
            details: `La hoja requerida "${reqSheet}" no existe en el archivo.`,
          });
        }
      }
    }

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const newData = xlsx.utils.sheet_to_json<any[]>(ws, { header: 1 });
      newState[sheetName] = newData;

      const oldData = this.lastState[sheetName] || [];
      const headers = newData[0] || [];
      
      // Determine if this sheet is strictly validated
      const sheetSchema = this.schema?.sheets[sheetName];
      let amountColIndex = -1;
      
      if (sheetSchema) {
        amountColIndex = headers.findIndex((h: any) => h === sheetSchema.amountColumn);
        if (amountColIndex === -1 && newData.length > 1) {
          changes.push({
            sheetName,
            action: 'data_warning',
            details: `La columna requerida "${sheetSchema.amountColumn}" no se encontró en la hoja "${sheetName}".`,
          });
        }
      }

      // Simple diffing: Look for new rows at the bottom
      if (newData.length > oldData.length) {
        for (let i = Math.max(oldData.length, 1); i < newData.length; i++) { // Start at 1 to skip headers
          const newRow = newData[i];
          if (newRow && newRow.length > 0 && newRow.some((cell: any) => cell !== undefined && cell !== null && cell !== '')) {
            
            // STRICT VALIDATION
            if (sheetSchema && amountColIndex !== -1) {
              const val = newRow[amountColIndex];
              if (val === undefined || val === null || isNaN(Number(val))) {
                console.warn(`[ExcelMonitor] Ignorando fila ${i} en ${sheetName}: Valor no numérico en columna ${sheetSchema.amountColumn}`);
                changes.push({
                  sheetName,
                  action: 'data_warning',
                  details: `Fila ignorada en ${sheetName}. El valor de la columna de dinero no es numérico.`,
                });
                continue; // Ignore this row
              }
            }

            // Map array back to object using headers for standardized output
            const rowObject: any = {};
            headers.forEach((h: string, idx: number) => {
              if (h) rowObject[h] = newRow[idx];
            });

            changes.push({
              sheetName,
              action: 'add_row',
              rowIndex: i,
              data: rowObject
            });
          }
        }
      }

      // Check for modifications in existing rows (skip headers)
      for (let i = 1; i < Math.min(oldData.length, newData.length); i++) {
        const oldRow = oldData[i] || [];
        const newRow = newData[i] || [];
        
        let rowModified = false;
        const modifiedCells = [];

        for (let j = 0; j < Math.max(oldRow.length, newRow.length); j++) {
          if (oldRow[j] !== newRow[j]) {
            rowModified = true;
            modifiedCells.push({
              col: headers[j] || `Col_${j}`,
              oldValue: oldRow[j],
              newValue: newRow[j]
            });
          }
        }

        if (rowModified) {
          const rowObject: any = {};
          headers.forEach((h: string, idx: number) => {
            if (h) rowObject[h] = newRow[idx];
          });

          changes.push({
            sheetName,
            action: 'update_row',
            rowIndex: i,
            modifications: modifiedCells,
            data: rowObject
          });
        }
      }

      // Check for deleted rows
      if (oldData.length > newData.length) {
        changes.push({
          sheetName,
          action: 'delete_row',
          details: `Se eliminaron ${oldData.length - newData.length} filas.`
        });
      }
    }

    this.lastState = newState;

    if (changes.length > 0) {
      this.emit('changes', changes);
    }
  }
}
