# Estructura de WebSockets

Para asegurar que la plataforma pueda manejar docenas o cientos de dispositivos sin colapsar y manteniendo la seguridad, Socket.IO se reestructurará con Namespaces y Salas (Rooms).

## 1. Namespaces

Se crearán dos canales separados para evitar que los Agentes reciban eventos del Dashboard y viceversa.

- `/agent`: Namespace exclusivo para conexiones entrantes desde aplicaciones de escritorio instaladas en las PCs.
- `/dashboard`: Namespace exclusivo para administradores conectados vía navegador web.

## 2. Autenticación en la Conexión

Ninguna conexión se establecerá sin previa validación.
Se utilizará el `auth` payload de Socket.IO en el handshake.

- **Agentes:** Pasan `deviceToken`. El servidor valida el token, extrae el `companyId` y une el socket a la sala `company_<companyId>`.
- **Dashboards:** Pasan `jwt`. El servidor valida, extrae roles, extrae `companyId` y se suscribe a los eventos necesarios.

## 3. Diccionario de Eventos Principales

### Desde Agente a Servidor
- `agent:register`: Envía info base del PC al conectarse.
- `agent:heartbeat`: Envía CPU, RAM, Latencia y App Activa (cada 5s).
- `agent:status`: Notifica inactividad local, hibernación.
- `agent:screenshot`: Envía buffer binario / base64 comprimido periódicamente o bajo demanda.

### Desde Servidor a Agente
- `remote:mouse`: X/Y y tipo de click.
- `remote:keyboard`: Tecla presionada.
- `remote:command`: String o ID de comando a ejecutar. Requiere verificación de firma/permisos locales.
- `remote:disconnect`: Fuerza el cierre del agente.

### Desde Servidor a Dashboard
- `dashboard:update`: Emisión en broadcast a la sala de la empresa con actualizaciones de telemetría de sus agentes.
- `dashboard:alert`: Notificaciones push de alta prioridad (CPU > 90%, desconexión abrupta).

### Desde Dashboard a Servidor
- `dashboard:subscribe`: Para unirse a la sala de un dispositivo específico (para War Room / vista detallada) y no saturar el navegador con capturas que no está viendo.
