# Progressive Web App (PWA)

El Frontend será configurado como una PWA para ofrecer una experiencia nativa a los administradores de TI en dispositivos móviles y de escritorio.

## Componentes Clave

### 1. Web App Manifest
El archivo `manifest.json` definirá la identidad de la aplicación:
- Nombre y descripción (VisionControl / FiberlinkDesk).
- Iconos de alta resolución (192x192, 512x512).
- Colores de tema y fondo.
- Modo de visualización `standalone` (sin barra de navegador).

### 2. Service Workers
Scripts en segundo plano interceptarán las peticiones de red.
- **Estrategia Cache-First:** Para assets estáticos (JS, CSS, imágenes).
- **Estrategia Network-First:** Para las llamadas a la API REST (listado de dispositivos, logs).
- **Soporte Offline básico:** Mostrar una pantalla de "Sin Conexión" estilizada en caso de pérdida de red, mientras se reintenta conectar el WebSocket.

### 3. Notificaciones Push (Fase Posterior)
Integrar la API de Notificaciones Push Web para recibir alertas críticas incluso cuando la pestaña de la aplicación esté cerrada:
- Servidor caído.
- Dispositivo crítico desconectado.
- CPU/RAM en zona de riesgo prolongado.

## Instalación

En la Fase 7, se incluirán los plugins de Vite (`vite-plugin-pwa`) para auto-generar los workers y facilitar la opción de "Instalar Aplicación" directamente desde la barra de direcciones del navegador.
