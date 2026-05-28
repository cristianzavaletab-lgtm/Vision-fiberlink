# Notas de Seguridad (Security)

Este sistema tiene capacidades intrusivas por su naturaleza (monitoreo, control remoto). Las prácticas de seguridad deben ser rigurosas para evitar fugas de información o ataques de inyección.

## 1. Autenticación de Agentes

- Los Agentes **no deben** utilizar contraseñas en plano ni usar el sistema de autenticación de los administradores.
- Los Agentes recibirán un **Token de Registro de Dispositivo (Device Token)** asociado a una Sede / Empresa (`companyId`).
- Si el dispositivo se compromete, el token se debe poder revocar inmediatamente desde el Dashboard.

## 2. JWT y Sesiones del Dashboard

- Implementar `Access Tokens` de corta duración (ej. 15 minutos).
- Implementar `Refresh Tokens` de larga duración (rotativos, guardados seguros).
- **HTTP-Only Cookies** fuertemente recomendadas en producción para los tokens, evitando robos por XSS.

## 3. RBAC (Control de Acceso Basado en Roles)

- Todo endpoint en Express y todo evento de Socket.IO debe validar los roles del remitente.
- Eventos críticos como `remote:command` deben requerir un flag explícito de permiso del rol actual (ej. `canExecuteCommands`).
- Aislamiento multi-tenant: Un administrador de la `Company A` nunca podrá ver ni emitir eventos a dispositivos de la `Company B`. (Se valida cruzando el JWT `companyId` con el dispositivo en BD).

## 4. Auditoría (Audit Logs)

Todo cambio de estado o acción crítica debe registrarse de forma inmutable:
- Usuario que ejecutó la acción.
- IP de origen.
- ID del Dispositivo afectado.
- Acción (ej. "Reinicio forzado", "Acceso remoto al terminal").
- Fecha y Hora.

## 5. Prevención General

- Validar todos los payloads (Ej. con `zod`) tanto en backend como a través del canal de sockets.
- Sanitización para prevenir ataques XSS si se inyectan nombres de procesos falsos desde el agente.
- No guardar binarios (`.exe`) expuestos públicamente sin autenticación previa.
- Siempre utilizar WSS (WebSockets sobre TLS) y HTTPS en producción.
