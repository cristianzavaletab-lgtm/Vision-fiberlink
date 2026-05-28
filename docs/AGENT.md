# Arquitectura del Agente (VisionControl / FiberlinkDesk)

El Agente es la pieza de software que reside en los endpoints (Windows PC) y se comunica con el backend central.

## Tecnologías Base

- **Framework:** Electron (Permite compilación de instaladores y acceso a APIs nativas vía Node.js).
- **Lenguaje:** TypeScript.
- **Acceso a SO:** `koffi` (FFI robusto para llamadas a la API de Windows como `user32.dll`), `robotjs` (Control de mouse y teclado).
- **Comunicación:** `socket.io-client`.

## Ciclo de Vida del Agente

1. **Instalación:** El agente se instala (idealmente con permisos de Administrador usando `.msi` o `.exe`).
2. **Registro:** El instalador inyecta un archivo de configuración (`config.json`) o un token temporal. El Agente lo lee y realiza un llamado a la API REST de registro.
3. **Persistencia del Token:** El Agente recibe su ID único y su token permanente, guardándolos en el Keytar o registro seguro local.
4. **Arranque:** El Agente arranca silenciosamente en background (`Tray` icon oculto opcional) y se conecta vía WSS a `/agent`.
5. **Telemetría:** Un intervalo (ej. cada 5000ms) empieza a medir CPU/RAM y aplicación en foco (vía `user32.dll`) y emite `agent:heartbeat`.

## Transparencia y Legalidad (Empresarial)

El Agente **no** debe actuar como Malware:
- Se documenta en el manual de TI de la empresa.
- Debe tener opciones (para ciertas configuraciones) que permitan al empleado ver que está siendo administrado, aunque no puedan cerrar el proceso.
- En la FASE Avanzada, la recolección de capturas de pantalla debe poder desactivarse temporalmente desde el dashboard si el empleado entra en modo de "privacidad".

## Preparación Futura (Actualizaciones y Servicios)

- Convertir la lógica central del agente en un **Servicio de Windows (Windows Service)** para garantizar que inicie incluso antes de que el usuario inicie sesión.
- Implementar **Electron Updater** para desplegar parches de seguridad a los agentes sin intervención manual de TI.
