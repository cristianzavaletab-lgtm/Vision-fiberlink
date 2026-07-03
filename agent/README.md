# VisionControl Excel Audit & Remote Support Agent

Agente local empresarial para auditoría autorizada de archivos Excel y soporte remoto visible en laptops o computadoras de la empresa.

## Enfoque

Este ejecutable no es una herramienta de control remoto. Su función es registrar actividad empresarial relacionada con Excel en carpetas autorizadas:

- Archivos Excel creados, abiertos, modificados, cerrados o eliminados.
- Máquina autorizada donde ocurrió el evento.
- Fecha y hora del evento.
- Archivo, hoja, filas creadas, filas editadas y filas eliminadas.
- Montos detectados con decimales exactos.
- Total ingresado, cobrado y vendido cuando las columnas lo permiten.
- Estado de sincronización con el servidor.

También puede habilitar soporte remoto empresarial con aviso visible y trazabilidad:

- Ver pantalla en vivo solo durante una sesión de soporte.
- Solicitar control remoto según configuración.
- Mostrar aviso visible mientras la sesión está activa.
- Enviar alertas empresariales a la laptop.
- Solicitar comunicación de soporte.
- Registrar sesiones, aceptaciones, rechazos y cierre.

## Lo que no hace

- No captura pantalla general.
- No registra teclas.
- No controla mouse ni teclado sin modo de soporte autorizado.
- No abre programas privados.
- No ejecuta terminal remota libre.
- No bloquea la laptop.
- No accede a carpetas fuera de las autorizadas.

## Configuración

El archivo `config.json` define el comportamiento inicial del agente:

```json
{
  "serverUrl": "https://mi-servidor.com",
  "accessToken": "TOKEN_INTERNO",
  "machineName": "Laptop Ventas 01",
  "companyArea": "Ventas",
  "watchFolders": [
    "C:/Empresa/Ventas",
    "C:/Empresa/Cobros"
  ],
  "allowedExtensions": [".xlsx", ".xls", ".xlsm", ".csv"],
  "currency": "PEN",
  "decimalPlaces": 2,
  "syncIntervalSeconds": 30,
  "excelDeepRead": true,
  "monitoringEnabled": true
}
```

Opciones de soporte remoto:

```json
{
  "remoteSupportEnabled": true,
  "screenViewEnabled": true,
  "remoteControlEnabled": true,
  "remoteControlMode": "request_permission",
  "showRemoteSessionIndicator": true,
  "alertsEnabled": true,
  "alertRequiresConfirmation": true,
  "voiceSupportEnabled": true,
  "voiceRequiresPermission": true,
  "audioRecordingEnabled": false
}
```

Modos de control remoto:

- `disabled`: no permite control.
- `request_permission`: solicita permiso al usuario.
- `company_managed`: permite soporte en equipo administrado, siempre con aviso visible y registro.

El token debe coincidir con `DASHBOARD_ACCESS_TOKEN` configurado en el backend.

## Interfaz local

El agente se ejecuta en segundo plano con icono de bandeja del sistema. Desde ahí se puede:

- Ver estado de conexión.
- Ver última sincronización.
- Ver eventos pendientes.
- Sincronizar ahora.
- Pausar o activar monitoreo.
- Activar o desactivar soporte remoto.
- Abrir configuración.
- Ver registros locales.

## Archivos locales

Los datos operativos se guardan en la carpeta de datos del usuario de Electron:

- `config.json`
- `agent.log`
- `errors.log`
- `excel-events.jsonl`
- `sync-queue.json`
- `remote-sessions.jsonl`
- `alerts.jsonl`

Si no hay conexión, los eventos quedan en `sync-queue.json` y se sincronizan automáticamente cuando vuelve el servidor.

## Compilar instalador

```bash
pnpm --filter agent build
```

El instalador se genera en:

```text
agent/build/VisionControlAgent Setup 1.0.0.exe
```
