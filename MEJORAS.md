# VisionControl - Mejoras y Tracking

## Completadas

### [2026-06-06] Mega-mejora: Code Splitting + Seguridad + UX Movil + Calidad Adaptativa

#### 1. Code Splitting (Bundle de 1984 KB → 334 KB principal)
- **Problema**: El chunk principal era de 2 MB, carga lenta en movil/4G
- **Solucion**:
  - Todas las vistas ahora usan `React.lazy()` + `Suspense` en `App.tsx`
  - Las librerias de exportacion (jsPDF, docx, xlsx) se cargan **bajo demanda** solo cuando el usuario exporta
  - Spinner de carga elegante mientras se cargan modulos
- **Resultado**: 
  - Chunk principal: 1984 KB → 334 KB (**-83%**)
  - ReportesView: 1101 KB → 27 KB (libs separadas, cargadas on-demand)
  - Cada vista es un chunk independiente (MonitoreoView=45KB, DashboardView=33KB, etc.)

#### 2. Boton HD Funcional (Calidad adaptativa en tiempo real)
- **Problema**: Boton "HD" en la toolbar del War Room no hacia nada
- **Solucion**:
  - Nuevo evento socket `stream:quality` en servidor que reenvia al agente
  - Estado `isHD` en MonitoreoView con toggle visual (boton cambia de color)
  - HD ON: quality=95, fps=10 (mas nitido, menor fluidez)
  - HD OFF: quality=60, fps=15 (mas fluido, menos detalle)
- **Archivos**: `MonitoreoView.tsx`, `server/src/index.ts`

#### 3. Reconexion Automatica de Sesion Remota
- **Problema**: Al perder la conexion socket, la sesion remota se perdia
- **Solucion**:
  - Listener en evento `connect` del socket que detecta si habia sesion activa
  - Re-suscribe al room del dispositivo + re-inicia sesion remota/terminal
  - Overlay visual "Reconectando sesion..." con spinner amarillo
  - Se oculta automaticamente despues de 2 segundos
- **Archivos**: `MonitoreoView.tsx`

#### 4. Touch Gestures Mejorados (Movil)
- **Pinch-to-zoom**: Dos dedos para hacer zoom en el escritorio remoto (scale 1x-3x)
  - Transform CSS con origin en el punto medio de los dedos
  - Double-tap alterna entre zoom 1x y 2x
  - Snap-back a 1x cuando el zoom es minimo
- **Tap ripple**: Efecto visual de onda al tocar (feedback inmediato)
  - Circulo animado con `animate-ping` en la posicion del tap
  - Desaparece despues de 500ms
- **Haptic feedback mejorado**:
  - Tap simple: vibracion suave (10ms)
  - Right-click (long press): patron de vibracion [30, 50, 30]ms
  - Double-tap: patron [10, 30, 10]ms
- **Archivos**: `MonitoreoView.tsx`

#### 5. Seguridad: Autenticacion JWT en WebSocket Dashboard
- **Problema**: Cualquiera podia conectarse al namespace `/dashboard` sin token
- **Solucion**:
  - Middleware `dashboardNs.use()` que valida JWT antes de permitir conexion
  - Frontend envia token via `auth: { token }` al conectar el socket
  - Graceful fallback: si no hay `JWT_ACCESS_SECRET` configurado (dev mode), permite conexion con warning
  - Rechaza conexiones con tokens invalidos/expirados en produccion
- **Archivos**: `server/src/index.ts`, `frontend/src/App.tsx`

#### 6. Seguridad: Eliminacion de Contrasenas en Texto Plano
- **Problema**: Usuarios MVP se guardaban con password en plaintext en disco JSON
- **Solucion**:
  - Todas las contrasenas ahora se hashean con bcrypt (rounds=10) antes de guardar
  - Migracion automatica al iniciar: detecta passwords sin prefijo `$2b$`/`$2a$` y las hashea
  - El login MVP ahora valida con `bcrypt.compare()` en vez de comparacion directa
  - Endpoint `/auth/me` devuelve info real del usuario en modo MVP
  - Default admin: `admin@visioncontrol.app` / `admin123` (hasheado en primer inicio)
- **Archivos**: `server/src/index.ts`, `server/src/routes/auth.routes.ts`

### [2026-06-05] Fix: Punteros no coinciden en War Room
- **Problema**: El cursor visual en la vista remota no coincide con la posicion real del click en el PC remoto
- **Causa**: `position: fixed` se desalinea cuando `backdrop-filter` del modal padre crea un nuevo containing block. Ademas la normalizacion de coordenadas no consideraba el letterboxing de `object-contain`
- **Solucion**:
  - Cambio de `position: fixed` a `position: absolute` relativo al container de pantalla
  - Calculo de posicion del cursor relativa al container (`getCursorRelativePos`)
  - Nueva funcion `getImageBounds()` que calcula el area real de la imagen dentro del elemento considerando aspect ratio y letterboxing
  - `getNormalizedPos()` ahora usa los bounds reales de la imagen para convertir coordenadas pixel a 0-1 correctamente

### [2026-06-05] Fix: Mini pantalla en movil
- **Problema**: El screenshot del PC remoto se veia muy pequeno en la vista movil (portrait)
- **Causa**: La imagen usaba `w-auto h-auto max-w-full max-h-full` que en portrait solo usa el ancho disponible sin expandir verticalmente
- **Solucion**: Cambio a `w-full h-full object-contain` que llena todo el espacio del container manteniendo aspect ratio correcto

---

## Pendientes / Propuestas de Mejora

### Alta Prioridad

1. **JWT_ACCESS_SECRET en produccion (Render)**
   - Configurar variable de entorno `JWT_ACCESS_SECRET` en Render dashboard
   - Sin ella, el auth de sockets funciona en modo "permitir todo" (dev)
   - Tambien configurar `JWT_REFRESH_SECRET` para refresh tokens

2. **Optimizar frecuencia de screenshots (WebRTC)**
   - Actualmente se envian screenshots completos por socket (base64 JPEG)
   - Siguiente paso: evaluar WebRTC para streaming real de video
   - Alternativa intermedia: delta encoding (enviar solo pixeles que cambian)

3. **Separar ReportesView en sub-componentes**
   - El archivo tiene 877 lineas, candidato a descomposicion
   - Separar: ReportFilters, ReportCharts, ExportButtons, ActivityTable

### Media Prioridad

4. **Session reconnection mas robusta**
   - Guardar estado de sesion en sessionStorage para sobrevivir refresh de pagina
   - Timeout configurable para abandonar reconexion si falla (>30s)

5. **Mejorar pinch-to-zoom**
   - Agregar pan (mover) cuando zoom > 1x con un dedo
   - Reset automatico de zoom al cambiar de dispositivo

6. **Multi-monitor: preview de todos los monitores**
   - Mostrar thumbnails de todos los monitores disponibles para seleccion rapida
   - El agente ya soporta seleccion por monitorId

### Baja Prioridad

7. **Grabar sesion remota**
   - Permitir grabar la sesion completa como video para auditoria
   - Usar MediaRecorder API sobre el stream de screenshots

8. **Atajos de teclado personalizables**
   - Permitir configurar combinaciones frecuentes (Ctrl+C, Win+D, etc.) como botones rapidos

9. **Dark/Light mode para screenshots**
   - Aplicar filtro de brillo al screenshot nocturno para reducir fatiga visual

10. **Rate limiting en endpoints publicos**
    - Agregar express-rate-limit para /api/auth/login (prevenir brute force)
    - Limitar intentos de login fallidos por IP
