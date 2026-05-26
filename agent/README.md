# FiberlinkDesk - Agente de Monitoreo y Control Remoto

## ¿Qué es esto?
Este agente se instala en cada laptop que quieras monitorear y controlar remotamente desde el panel web de FiberlinkDesk.

## Instalación Rápida (Windows)

### Paso 1: Copiar esta carpeta
Copia toda la carpeta `agent` a la laptop que quieras monitorear.  
Puedes usar un USB, carpeta compartida, o lo que prefieras.

### Paso 2: Configurar la IP del servidor
Abre el archivo `config.json` con el Bloc de Notas y cambia la IP:

```json
{
  "serverIP": "192.168.1.100",   ← Pon aquí la IP de tu PC principal
  "serverPort": 3001,
  "screenshotInterval": 2000
}
```

**¿Cómo saco la IP de mi PC principal?**  
En tu PC principal (donde corre el servidor), abre CMD y escribe:
```
ipconfig
```
Busca la línea que dice `IPv4 Address` — esa es tu IP (ejemplo: `192.168.1.50`).

### Paso 3: Instalar
Haz **doble clic** en `instalar.bat` y espera a que termine.

### Paso 4: ¡Listo!
El agente se conectará automáticamente y la laptop aparecerá en tu panel web.

---

## Archivos importantes

| Archivo | Qué hace |
|---------|----------|
| `config.json` | La IP y puerto del servidor. **Solo edita esto.** |
| `instalar.bat` | Instala todo automáticamente. Doble clic. |
| `src/main.ts` | Código del agente (no tocar). |
| `package.json` | Dependencias de Node.js (no tocar). |

## Requisitos
- **Node.js** instalado en la laptop (descargar de https://nodejs.org)
- La laptop y tu PC principal deben estar en la **misma red WiFi/LAN**
