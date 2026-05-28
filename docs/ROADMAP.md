# Roadmap del Proyecto

Esta es la ruta de evolución para convertir la plataforma en un producto SaaS de grado empresarial (Multiempresa, seguro, de baja latencia).

## FASE 1: Bases y Documentación (Actual)
- [x] Actualización de `.gitignore` para limpieza de repositorios.
- [x] Documentación fundacional (Arquitectura, Seguridad, WebSockets, BD, SaaS, PWA, Deployment, Agent).
- [x] Preparación del terreno sin romper el código existente.

## FASE 2: Estructura Monorepo
- [ ] Implementación de `pnpm workspaces`.
- [ ] Configuración básica de `turborepo` para optimizar compilaciones.
- [ ] Docker Compose local sin afectar flujos de despliegue en la nube.
- [ ] Carpeta `shared/` para sincronizar interfaces entre Agent, Web y Server.

## FASE 3: Refactorización de WebSockets
- [ ] Separación clara de namespaces (`/agent`, `/dashboard`).
- [ ] Implementar Heartbeat dinámico con detección de desconexión abrupta.
- [ ] Manejo de salas (rooms) por `companyId` y validación de tokens en conexión.

## FASE 4: Base de Datos & Prisma
- [ ] Integración de PostgreSQL usando Prisma ORM.
- [ ] Definición estricta de Modelos (User, Company, Device, AuditLog, etc.).
- [ ] Scripts de migración iniciales (sin romper datos en Supabase / MongoDB existentes durante transición).

## FASE 5: Autenticación, Seguridad y RBAC
- [ ] Migración completa a JWT con Refresh Tokens.
- [ ] Autenticación de Agentes vía token por dispositivo.
- [ ] Middleware y directivas de permisos basadas en Roles (SuperAdmin, Admin, Técnico, ReadOnly).

## FASE 6: Dashboard Realtime & Optimización
- [ ] Eliminación progresiva de `mockData`.
- [ ] Consolidación de gráficos en tiempo real usando telemetría verdadera.
- [ ] Renderizado reactivo condicionado a `companyId` del usuario.

## FASE 7: PWA
- [ ] Integración de Service Workers.
- [ ] Configuración `manifest.json`.
- [ ] Optimización móvil del panel y preparación para notificaciones.

## FASE 8: Producción con Docker
- [ ] Dockerfiles multi-stage para web y backend.
- [ ] Documentación extensa para self-hosting o escalado en VPS/Cloud.

## FASE 9: Control Remoto Avanzado & Streaming
- [ ] Migración o complemento de polling de capturas hacia un modelo en base a eventos.
- [ ] Evaluación técnica de WebRTC / WebSocket Binario para baja latencia.
- [ ] CMD Remoto y opciones avanzadas (bloqueo, apagado) fuertemente auditadas.
