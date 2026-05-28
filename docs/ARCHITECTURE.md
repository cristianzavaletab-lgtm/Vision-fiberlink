# Arquitectura del Proyecto (VisionControl / FiberlinkDesk)

Este documento describe la arquitectura global del sistema. El objetivo de la plataforma es permitir el monitoreo, telemetría y control remoto de equipos a través de un ecosistema escalable preparado para SaaS.

## Ecosistema General

1. **Frontend (Dashboard):** 
   - Desarrollado en React, TypeScript y Vite.
   - Provee una interfaz empresarial (Glassmorphism, Tailwind).
   - Punto de acceso central para administradores y técnicos.

2. **Backend (Servidor de Control):**
   - Construido en Node.js, Express y Socket.IO.
   - Encargado de enrutar las conexiones, mantener el estado en vivo y despachar eventos entre agentes y clientes.

3. **Agente (Endpoint):**
   - Aplicación para el dispositivo destino (Windows actualmente) construida con Electron y TypeScript.
   - Integración nativa con SO para métricas, capturas de pantalla, ejecución de comandos (koffi, robotjs, PowerShell).

## Estructura de Directorios (Propuesta Monorepo)

Se implementará progresivamente un esquema basado en `pnpm workspaces` o `TurboRepo`.

```
/
├── .github/          # Acciones de CI/CD (futuro)
├── docs/             # Documentación técnica
├── agent/            # Proyecto del Agente (Electron)
├── frontend/         # Panel de Control Web
├── server/           # Backend (Node.js)
├── shared/           # Tipos de TypeScript e interfaces comunes
├── package.json      # Configuración del workspace raíz
└── turbo.json        # Configuración de caché y pipelines (futuro)
```

## Flujo de Comunicación (Alto Nivel)

1. El **Agente** inicia y autentica contra el **Backend** usando WebSockets / REST.
2. El **Agente** reporta estado (`heartbeat`, capturas periódicas, métricas).
3. El **Usuario** (Frontend) se conecta al **Backend** e interactúa con los Agentes disponibles según sus permisos (RBAC).
4. El **Backend** orquesta los mensajes, verifica permisos (JWT) y guarda registros de auditoría en la **Base de Datos**.

## Persistencia de Datos

- **PostgreSQL (Prisma ORM):** Manejo seguro de relaciones complejas (Usuarios, Empresas, Dispositivos, Roles, Permisos, Logs de Auditoría).
- **Redis (Futuro / Opcional):** Manejo eficiente del estado de los sockets en memoria, pub/sub para escalar el servidor horizontalmente y almacenamiento de sesión temporal.
