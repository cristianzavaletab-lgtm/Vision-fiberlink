# VisionControl (FiberlinkDesk) - Estado del Proyecto y Roadmap Tecnico

> Ultima actualizacion: 2026-06-06

---

## Estado Actual del Proyecto

### Stack Tecnologico

| Capa | Tecnologia |
|------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Socket.IO-client |
| UI | Glassmorphism dark theme, Lucide React, Recharts |
| PWA | vite-plugin-pwa, Web Push (VAPID), Service Workers, Haptics API |
| Backend | Node.js, Express 4, Socket.IO 4, TypeScript 5 |
| Base de datos | PostgreSQL 15 (Prisma 7 ORM) + modo in-memory con persistencia JSON |
| Agente | Electron 34, koffi (Win32 FFI), screenshot-desktop |
| Auth | JWT (access + refresh), bcrypt, RBAC, WebAuthn/biometrico |
| Exportacion | jsPDF, docx, xlsx (cargados bajo demanda) |
| Email | Nodemailer + node-cron (reportes programados) |
| Push | web-push (VAPID) |
| Deploy | Docker Compose, Render.com |

---

### Funcionalidades Implementadas por Modulo

#### War Room (Monitoreo en Tiempo Real)
- Streaming de screenshots en vivo de todos los dispositivos conectados
- Control remoto completo: mouse (click, dblclick, rightclick, drag, scroll), teclado (todas las teclas + modificadores)
- Terminal remota interactiva (PowerShell persistente con stdin/stdout)
- Audio bidireccional (microfono del admin -> parlante del PC remoto via MSE + Web Audio API)
- Comandos de sistema: Ctrl+Alt+Del, Shutdown, Restart, Lock, Sleep
- Toggle HD en tiempo real (calidad 60% ↔ 95%)
- Soporte multi-monitor (seleccion de pantalla)
- Touch gestures movil: tap=click, long-press=right-click, double-tap=dblclick, pinch-to-zoom (1x-3x), two-finger scroll
- Ripple visual + haptic feedback en gestos tactiles
- Reconexion automatica de sesion al perder conexion
- Feed de actividad en tiempo real (ultimas 30 acciones)
- Timeline de capturas historicas
- Indicadores: CPU, RAM, app activa, tiempo de sesion

#### Dashboard (Centro de Control)
- Tarjetas resumen: dispositivos online, CPU promedio, RAM promedio, alertas activas
- Grafico de area CPU/RAM en tiempo real (30 puntos, refresh cada 5s)
- Pie chart de distribucion de apps en uso
- Bar chart de salud del cluster (rangos de uso)
- Feed de actividad en vivo via socket
- Grid de estado rapido de dispositivos (hasta 12)

#### Productividad (Analytics)
- Score de productividad (0-100%) basado en clasificacion de apps
- Categorizacion automatica: productivo (IDE, Office), improductivo (streaming, redes), neutral
- Graficos: area apilada productivo/improductivo, pie por categoria
- Rankings top 8 apps productivas e improductivas
- Tabla por dispositivo con score y horas
- Filtros: rango de fecha, dispositivo especifico

#### Reportes y Exportacion
- Vista diaria: resumen, uso de apps, desglose por hora, sesiones boot
- Vista timeline: sesiones de apps cronologicas
- Vista tabla: log filtrable con busqueda y paginacion
- Exportacion PDF (branded con tablas profesionales)
- Exportacion Word/DOCX (documento estructurado con tablas)
- Exportacion Excel/XLSX (workbook multi-hoja)
- Filtros por fecha y dispositivo

#### Gestion de Usuarios (RBAC)
- CRUD completo de usuarios
- 4 roles: SuperAdmin, Admin, Operator, Viewer
- Activar/desactivar usuarios
- Busqueda y filtros por rol/estado
- Tarjetas de estadisticas

#### Gestion de Sedes (Sites)
- CRUD con color personalizado (8 colores)
- Asignacion de dispositivos (individual + masiva)
- Estadisticas por sede: dispositivos, online, CPU/RAM promedio
- Filtro global por sede (aplica a todo el dashboard)
- Cache offline en LocalStorage

#### Configuracion del Sistema
- Control de streaming: FPS (1-30), calidad (30-100%)
- Intervalo de heartbeat del agente
- Reglas de alerta configurables (CPU/RAM threshold + duracion + accion)
- Apps bloqueadas (patron + accion: kill/notify/log)
- Configuracion SMTP para reportes por email
- Horarios de envio (presets + custom cron)
- Autenticacion biometrica (WebAuthn)
- Toggle push notifications

#### Centro de Notificaciones
- Notificaciones en tiempo real via socket
- Tipos: alerta, dispositivo online/offline, sesion, sistema, app bloqueada
- Filtros por categoria
- Marcar como leidas (individual + masivo)
- Limpiar leidas

#### Inventario de Dispositivos
- Grid con estado, CPU, RAM, app activa, OS
- Filtros: busqueda, estado (online/offline), OS
- Panel de detalle con acciones rapidas

#### Agente de Escritorio (Windows)
- Captura de pantalla adaptativa (2 FPS idle → 20+ FPS remoto)
- Control nativo Win32 (<1ms latencia): SetCursorPos, mouse_event, keybd_event
- Bloqueo de input local durante sesion remota (BlockInput)
- Terminal PowerShell persistente
- Reproduccion de audio (MSE + Web Audio)
- Deteccion de app activa (GetForegroundWindow)
- Metricas: CPU, RAM, uptime
- Comandos: shutdown, restart, lock, sleep, taskkill
- Auto-inicio con Windows, instancia unica
- Reconexion infinita con backoff

#### PWA y Movil
- Instalable como app nativa (manifest + service worker)
- Push notifications (VAPID)
- Autenticacion biometrica (WebAuthn ECDSA P-256)
- Deteccion offline/online
- Background sync
- Haptic feedback configurable
- Banner de instalacion

#### Seguridad
- JWT access/refresh tokens
- bcrypt hashing de contrasenas (incluyendo modo MVP)
- Middleware auth en WebSocket /dashboard
- RBAC con permisos granulares
- WebAuthn challenge-response
- Migracion automatica de passwords plaintext

---

## Historial de Cambios

### [2026-06-06] Code Splitting + Seguridad + UX Movil + Calidad Adaptativa

| Mejora | Antes | Despues |
|--------|-------|---------|
| Bundle principal | 1984 KB | 334 KB (-83%) |
| ReportesView chunk | 1101 KB | 27 KB (libs on-demand) |
| Boton HD | No funcional | Toggle 60% ↔ 95% en tiempo real |
| Reconexion sesion | Se perdia | Auto-restaura con overlay visual |
| Touch mobile | Solo tap/scroll | Pinch-zoom + ripple + haptics |
| Auth WebSocket | Abierto a todos | JWT validado antes de conectar |
| Passwords MVP | Plaintext en disco | bcrypt hash + migracion auto |

**Detalle tecnico:**
1. `React.lazy()` + `Suspense` para todas las vistas
2. Dynamic `import()` para jsPDF/docx/xlsx (cargados solo al exportar)
3. Evento `stream:quality` servidor→agente para cambio dinamico
4. Listener `socket.on('connect')` restaura sesion si estaba activa
5. `dashboardNs.use()` middleware valida JWT en handshake
6. `bcrypt.hash()` en creacion + `bcrypt.compare()` en login MVP
7. Migracion on-startup: detecta passwords sin `$2b$` y las hashea

### [2026-06-05] Fix: Cursor desalineado en War Room
- `position: fixed` → `position: absolute` relativo al container
- Funcion `getImageBounds()` para calcular area real con letterboxing
- `getNormalizedPos()` usa bounds reales de la imagen

### [2026-06-05] Fix: Pantalla pequena en movil
- `w-auto h-auto max-w-full max-h-full` → `w-full h-full object-contain`

---

## Propuestas de Mejora Tecnica

### Criticas (hacer antes de produccion)

| # | Mejora | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | **Configurar JWT_ACCESS_SECRET y JWT_REFRESH_SECRET en Render** | Sin esto el auth de sockets es "permitir todo" | 5 min |
| 2 | **Rate limiting en /api/auth/login** | Previene brute force de passwords | 30 min |
| 3 | **HTTPS forzado + CORS restrictivo** | Sin CORS restrictivo cualquier dominio puede hacer requests | 15 min |
| 4 | **Validar input del agente (sanitize)** | Un agente malicioso podria inyectar payloads en actividades | 1-2 hrs |

### Alta Prioridad (rendimiento y escalabilidad)

| # | Mejora | Descripcion | Beneficio |
|---|--------|-------------|-----------|
| 5 | **WebRTC para streaming** | Reemplazar screenshots base64 por video stream P2P | -90% ancho de banda, <50ms latencia |
| 6 | **Delta encoding de screenshots** | Enviar solo regiones que cambian (alternativa rapida a WebRTC) | -60% trafico socket |
| 7 | **Compresion WebP en agente** | WebP es 30% mas ligero que JPEG a misma calidad | Menos trafico sin perder calidad |
| 8 | **Base de datos PostgreSQL full** | Migrar de in-memory+JSON a Prisma completo | Persistencia real, queries, escalabilidad |
| 9 | **Descomponer MonitoreoView** | 1400+ lineas → componentes: RemoteToolbar, DeviceGrid, TouchHandler, TerminalPanel | Mantenibilidad |
| 10 | **Descomponer ReportesView** | 877 lineas → ReportFilters, ReportCharts, ExportService, ActivityTable | Mantenibilidad |

### Media Prioridad (UX y funcionalidad)

| # | Mejora | Descripcion |
|---|--------|-------------|
| 11 | **Pan cuando zoom > 1x** | Mover la vista con un dedo cuando esta con pinch-zoom activo |
| 12 | **Sesion sobrevive refresh** | Guardar estado en sessionStorage para no perder sesion al recargar pagina |
| 13 | **Preview multi-monitor** | Thumbnails de todos los monitores del dispositivo para seleccion rapida |
| 14 | **Grabacion de sesion** | MediaRecorder API sobre el stream de screenshots para auditoria en video |
| 15 | **Atajos de teclado rapidos** | Botones configurables: Ctrl+C, Win+D, Ctrl+Z, etc. en la toolbar |
| 16 | **File transfer** | Arrastrar archivos al escritorio remoto (upload via socket chunked) |
| 17 | **Clipboard sync** | Compartir portapapeles entre admin y PC remoto |
| 18 | **Idle detection** | Detectar inactividad del usuario en el PC remoto (sin teclado/mouse por X min) |
| 19 | **Dashboard de multi-tenant** | Separar datos por companyId para modelo SaaS |

### Baja Prioridad (nice-to-have)

| # | Mejora | Descripcion |
|---|--------|-------------|
| 20 | **Dark/Light mode para screenshots** | Filtro de brillo para reducir fatiga visual nocturna |
| 21 | **Wake-on-LAN** | Encender equipos apagados desde el dashboard |
| 22 | **Agent auto-update** | Electron autoUpdater con releases de GitHub |
| 23 | **Audit log exportable** | Historial completo de quien hizo que y cuando (compliance) |
| 24 | **Soporte Linux/macOS agent** | Actualmente solo Windows (user32.dll) → xdotool/AppleScript |
| 25 | **2FA (TOTP)** | Autenticacion de dos factores con Google Authenticator |
| 26 | **API rate limiting global** | express-rate-limit en todos los endpoints (proteccion DDoS basica) |
| 27 | **Metricas de red** | Ping, download speed, packet loss por dispositivo |
| 28 | **Geofencing** | Alerta si dispositivo se conecta desde IP/ubicacion inusual |

---

## Arquitectura Actual

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React PWA)                      │
│  App.tsx → Lazy-loaded views → Socket.IO client → API service   │
│  Tailwind + Glassmorphism │ Recharts │ Lucide │ PWA hooks       │
└────────────────┬────────────────────────────────┬───────────────┘
                 │ WebSocket (/dashboard)          │ REST API
                 │ + JWT auth                      │ + Bearer token
┌────────────────▼────────────────────────────────▼───────────────┐
│                         SERVER (Express + Socket.IO)             │
│  /agent namespace ← Agentes                                     │
│  /dashboard namespace ← Admins (JWT validated)                  │
│  In-memory store + JSON persistence │ Prisma/PostgreSQL (opt.)  │
│  Alert engine │ Blocked apps │ Push │ Email │ Cron              │
└────────────────┬────────────────────────────────────────────────┘
                 │ WebSocket (/agent)
┌────────────────▼────────────────────────────────────────────────┐
│                    AGENT (Electron + Win32 FFI)                  │
│  Screen capture (desktopCapturer) → JPEG base64 → socket       │
│  koffi → user32.dll (SetCursorPos, mouse_event, keybd_event)   │
│  PowerShell terminal │ Audio MSE │ System commands              │
│  Multi-monitor │ Auto-reconnect │ Single instance              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Credenciales por Defecto (MVP)

- **Email**: `admin@visioncontrol.app`
- **Password**: `admin123`
- **Rol**: SuperAdmin
- (Password hasheada con bcrypt al primer inicio)

---

## Como Ejecutar

```bash
# Instalar dependencias
pnpm install

# Desarrollo (todos los servicios)
pnpm dev

# Solo frontend
pnpm dev:frontend

# Solo servidor
pnpm dev:server

# Solo agente
pnpm dev:agent

# Build produccion
pnpm build
```
