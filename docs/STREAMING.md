# Arquitectura de Streaming (Fase 9 y Futuro)

## Estado Actual (WebSockets + JPEG)
Actualmente, VisionControl implementa un sistema de streaming basado en **WebSockets (Socket.IO)** transmitiendo frames en formato JPEG codificados en Base64. 

### Optimizaciones Recientes
- **Metadata en vivo:** El agente ahora envía FPS, Calidad de codificación y soporte multi-monitor.
- **Eficiencia Dinámica:** El agente no transmite la pantalla si los bytes no han cambiado (cero tráfico en pantallas estáticas).
- **Targeting Dirigido:** El backend ya no hace broadcast global de la pantalla, solo envía los frames a los clientes web que se hayan suscrito al `deviceId` específico mediante un Socket.IO Room.

---

## El Futuro: WebRTC (Fase 10)

Para alcanzar fluidez absoluta de 60 FPS con latencia casi nula y poder capturar audio estéreo de forma nativa, la evolución lógica es abandonar la transmisión pesada de imágenes sobre TCP y utilizar **WebRTC**.

### Propuesta Arquitectónica WebRTC

1. **Señalización (Signaling):** Socket.IO (que ya existe y funciona perfecto) se usará exclusivamente como servidor de señalización para intercambiar SDP Offers/Answers e ICE Candidates.
2. **Peer-to-Peer:** Si el administrador y el agente están en la misma red o el NAT lo permite, WebRTC establecerá conexión directa reduciendo el ancho de banda del servidor a cero.
3. **Servidor TURN/STUN:** Será necesario para entornos de producción donde ambos estén detrás de firewalls restrictivos.
4. **MediaSoup / SFU (Opcional):** Si varios administradores necesitan ver la misma pantalla simultáneamente, un servidor SFU retransmitirá el stream WebRTC.
5. **Agente Desktop:** Utilizará `desktopCapturer` combinado con `navigator.mediaDevices.getUserMedia` para generar un `MediaStream` real, en lugar de generar JPEGs manualmente en un loop.

### ¿Por qué no implementamos WebRTC todavía?
WebRTC requiere una gestión profunda de red y fallos, que puede romper el despliegue monolítico actual en producción y demanda servidores TURN. Al estabilizar primero el esquema de Socket.IO, garantizamos que siempre hay un fallback estable que funciona 100% detrás de cualquier proxy (ej. Render o Nginx corporativos).
