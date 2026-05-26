# Guía de Instalación y Despliegue del Agente

Para que las laptops puedan ser controladas, deben tener ejecutando el "Agente". Aquí explicamos cómo generar un ejecutable `.exe` para Windows.

## 1. Requisitos previos
En la máquina de desarrollo, asegúrate de tener instaladas las herramientas de compilación para que `robotjs` (la librería de control) funcione:
```bash
npm install --global windows-build-tools
```

## 2. Generar el archivo .exe
Utilizaremos la librería `pkg` para empaquetar el código de Node.js en un solo binario.

1. Ve a la carpeta del agente: `cd agent`
2. Instala `pkg` si no lo tienes: `npm install -g pkg`
3. Compila el proyecto: `npm run build`
4. Genera el ejecutable:
   ```bash
   pkg . --targets node18-win-x64 --output VisionControlAgent.exe
   ```

## 3. Despliegue en Laptops
1. Copia el archivo `VisionControlAgent.exe` y el archivo `config.json` a la laptop destino.
2. Edita `config.json` y pon la dirección IP de tu servidor central.
3. Ejecuta el `.exe`. El equipo aparecerá automáticamente en el panel de administración.

## 4. Probar desde el Teléfono
Como el servidor es una Web App:
1. Asegúrate de que tu laptop/servidor y tu teléfono estén en la misma red Wi-Fi.
2. En el navegador de tu teléfono, ingresa la IP de tu laptop y el puerto del frontend (ej: `http://192.168.1.15:5173`).
3. ¡Listo! Podrás ver la lista de sedes y laptops desde tu móvil.