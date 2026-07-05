import { ExcelMonitor } from './src/excelMonitor';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== Iniciando Prueba de ExcelMonitor ===');

  const testDir = path.join(__dirname, 'tmp-excel-test');
  const testFile = path.join(testDir, 'test_ventas.xlsx');
  fs.mkdirSync(testDir, { recursive: true });
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

  const events: unknown[] = [];
  const monitor = new ExcelMonitor({
    machineId: 'test-machine',
    machineName: 'Equipo de prueba',
    watchFolders: [testDir],
    allowedExtensions: ['.xlsx', '.xls', '.xlsm', '.csv'],
    currency: 'PEN',
    decimalPlaces: 2,
    excelDeepRead: true,
  });

  monitor.on('business-event', (event) => {
    events.push(event);
    console.log('\n[TEST EVENT] Evento detectado por el monitor:');
    console.log(JSON.stringify(event, null, 2));
  });
  monitor.on('error-log', (message) => console.error('[ERROR]', message));
  monitor.on('status', (message) => console.log('[STATUS]', message));

  monitor.start();
  await wait(1000);

  // 1. Crear archivo Excel inicial vacío con cabeceras correctas.
  const wb = xlsx.utils.book_new();
  const wsVentas = xlsx.utils.aoa_to_sheet([['ID', 'Monto', 'Cliente']]);
  const wsGastos = xlsx.utils.aoa_to_sheet([['ID', 'Importe', 'Concepto']]);

  xlsx.utils.book_append_sheet(wb, wsVentas, 'Ventas');
  xlsx.utils.book_append_sheet(wb, wsGastos, 'Gastos');
  xlsx.writeFile(wb, testFile);

  console.log('1. Archivo Excel inicial creado.');
  await wait(3000);

  // 2. Simular una escritura válida (Venta de 500).
  console.log('\n2. Simulando nueva fila válida en Ventas (Monto: 500)...');
  const wbUpdate1 = xlsx.readFile(testFile, { cellDates: true });
  xlsx.utils.sheet_add_aoa(wbUpdate1.Sheets['Ventas'], [[1, 500, 'Juan Pérez']], { origin: -1 });
  xlsx.writeFile(wbUpdate1, testFile);

  await wait(3000);

  // 3. Simular un dato inválido (Texto en Monto).
  console.log('\n3. Simulando fila con dato inválido en Ventas (Monto: "Mil soles")...');
  const wbUpdate2 = xlsx.readFile(testFile, { cellDates: true });
  xlsx.utils.sheet_add_aoa(wbUpdate2.Sheets['Ventas'], [[2, 'Mil soles', 'María']], { origin: -1 });
  xlsx.writeFile(wbUpdate2, testFile);

  await wait(3000);

  // 4. Simular eliminación de hoja.
  console.log('\n4. Simulando eliminación de la hoja Gastos...');
  const wbUpdate3 = xlsx.readFile(testFile, { cellDates: true });
  delete wbUpdate3.Sheets['Gastos'];
  wbUpdate3.SheetNames = ['Ventas'];
  xlsx.writeFile(wbUpdate3, testFile);

  await wait(3000);

  monitor.stop();
  if (events.length === 0) throw new Error('No se detectaron eventos Excel.');
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n=== Pruebas finalizadas ===');
}

runTest().catch(console.error);
