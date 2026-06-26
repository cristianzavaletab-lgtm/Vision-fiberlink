import { ExcelMonitor } from './src/excelMonitor';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  console.log('=== Iniciando Prueba de ExcelMonitor ===');
  
  const testFile = path.join(__dirname, 'test_ventas.xlsx');
  
  // 1. Crear archivo Excel inicial vacío con cabeceras correctas
  const wb = xlsx.utils.book_new();
  const wsVentas = xlsx.utils.aoa_to_sheet([['ID', 'Monto', 'Cliente']]);
  const wsGastos = xlsx.utils.aoa_to_sheet([['ID', 'Importe', 'Concepto']]);
  
  xlsx.utils.book_append_sheet(wb, wsVentas, 'Ventas');
  xlsx.utils.book_append_sheet(wb, wsGastos, 'Gastos');
  xlsx.writeFile(wb, testFile);
  
  console.log('1. Archivo Excel inicial creado.');

  // 2. Iniciar el monitor
  const monitor = new ExcelMonitor(testFile);
  
  monitor.on('changes', (changes) => {
    console.log('\n[TEST EVENT] Cambios detectados por el Monitor:');
    console.log(JSON.stringify(changes, null, 2));
  });

  await monitor.start();
  
  console.log('2. Monitor iniciado. Esperando 2 segundos antes de escribir datos...');
  await new Promise(r => setTimeout(r, 2000));
  
  // 3. Simular una escritura válida (Venta de 500)
  console.log('\n3. Simulando nueva fila válida en Ventas (Monto: 500)...');
  const wbUpdate1 = xlsx.readFile(testFile, { cellDates: true });
  xlsx.utils.sheet_add_aoa(wbUpdate1.Sheets['Ventas'], [[1, 500, 'Juan Pérez']], { origin: -1 });
  xlsx.writeFile(wbUpdate1, testFile);
  
  await new Promise(r => setTimeout(r, 3000));
  
  // 4. Simular un dato inválido (Texto en Monto)
  console.log('\n4. Simulando fila con dato inválido en Ventas (Monto: "Mil soles")...');
  const wbUpdate2 = xlsx.readFile(testFile, { cellDates: true });
  xlsx.utils.sheet_add_aoa(wbUpdate2.Sheets['Ventas'], [[2, 'Mil soles', 'María']], { origin: -1 });
  xlsx.writeFile(wbUpdate2, testFile);

  await new Promise(r => setTimeout(r, 3000));
  
  // 5. Simular eliminación de hoja (Schema Error)
  console.log('\n5. Simulando eliminación de la hoja Gastos (Schema Error)...');
  const wbUpdate3 = xlsx.readFile(testFile, { cellDates: true });
  delete wbUpdate3.Sheets['Gastos'];
  wbUpdate3.SheetNames = ['Ventas'];
  xlsx.writeFile(wbUpdate3, testFile);

  await new Promise(r => setTimeout(r, 3000));

  monitor.stop();
  fs.unlinkSync(testFile);
  console.log('\n=== Pruebas finalizadas ===');
}

runTest().catch(console.error);
