# VisionControl - Mejoras y Tracking

## Completadas

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

1. **Code splitting del bundle principal** (1984 KB)
   - El chunk principal es muy grande (2MB)
   - Usar dynamic import() para lazy-load vistas: ProductivityView, UsersView, NotificationsView, ReportesView
   - Impacto: Carga inicial mas rapida, especialmente en movil 4G

2. **Optimizar frecuencia de screenshots**
   - Actualmente se envian screenshots completos por socket
   - Considerar: enviar solo diffs (delta encoding) o usar JPEG progresivo con menor calidad en movil
   - Considerar WebRTC para streaming real en lugar de screenshots secuenciales

3. **JWT_ACCESS_SECRET missing warning**
   - El log del server muestra "Missing JWT_ACCESS_SECRET in environment"
   - Configurar variable de entorno en Render para seguridad en produccion

### Media Prioridad

4. **Mejorar touch gestures en movil**
   - Agregar gesture de pinch-to-zoom para hacer zoom en area especifica del remote desktop
   - Agregar feedback visual (ripple) al hacer tap
   - Agregar vibracion haptica en todos los gestos, no solo long-press

5. **Session reconnection**
   - Si se pierde la conexion socket momentaneamente, reconectar la sesion remota automaticamente
   - Mostrar indicador de "reconectando..." en vez de perder la sesion

6. **Screenshot quality adaptativa**
   - Detectar ancho de banda y ajustar calidad automaticamente
   - En WiFi: calidad alta / En 4G: calidad reducida
   - Permitir al usuario forzar HD manualmente (boton ya existe pero no funcional)

### Baja Prioridad

7. **Multi-monitor: preview de todos los monitores**
   - Mostrar thumbnails de todos los monitores disponibles para seleccion rapida

8. **Grabar sesion remota**
   - Permitir grabar la sesion completa como video para auditoria
   - Usar MediaRecorder API sobre el stream de screenshots

9. **Atajos de teclado personalizables**
   - Permitir configurar combinaciones frecuentes (Ctrl+C, Win+D, etc.) como botones rapidos

10. **Dark/Light mode para screenshots**
    - Aplicar filtro de brillo al screenshot nocturno para reducir fatiga visual en ambientes oscuros
