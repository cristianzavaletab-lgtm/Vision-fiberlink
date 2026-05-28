# 🚀 Checklist de Producción (Release)

Antes de pasar a Producción, verifica que todos los puntos de esta lista se cumplan.

## 1. Variables de Entorno y Seguridad
- [ ] El archivo `.env` NO está bajo control de versiones (verificado en `.gitignore` y `.dockerignore`).
- [ ] Existe un archivo `.env.example` con variables dummy claras.
- [ ] `NODE_ENV` está seteado a `production` en Docker.
- [ ] Las contraseñas en `DATABASE_URL` son seguras.
- [ ] `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` son tokens aleatorios fuertes (mínimo 64 caracteres).
- [ ] No se ha expuesto el puerto `5432` de Postgres al exterior del VPS de forma innecesaria (Remover el binding de ports en `docker-compose.yml` si solo el backend necesita acceso).

## 2. Base de Datos
- [ ] Los modelos base están listos y no hay cambios pendientes en `schema.prisma`.
- [ ] Has ejecutado exitosamente `npx prisma migrate deploy` al menos una vez en el servidor de producción.
- [ ] El fallback a *Legacy Mode* funciona si no hay BD configurada.

## 3. Pruebas Funcionales
- [ ] **Sockets:** Los Agentes pueden conectarse y enviar heartbeats/screenshots.
- [ ] **RBAC (Role Based Access Control):** Usuarios con permisos insuficientes no ven los botones de "Control Remoto" o "Terminal".
- [ ] **Frontend Auth:** El guardado del JWT en LocalStorage y el auto-refresh con `interceptors` de Axios funcionan correctamente tras la expiración del token (15m).
- [ ] **PWA:** La aplicación Frontend es instalable, carga el Service Worker, muestra el icono offline y esquiva la caché en las llamadas `/api` y WebSockets.
- [ ] **Docker:** El comando `docker-compose up -d --build` levanta todo el stack sin errores.

## 4. Pruebas de QA y Salud (Health Checks)
Verifica que estos endpoints devuelven `200 OK`:
- [ ] `GET /api/health` -> (Debe indicar `db: connected` o `db: legacy_mode (no_db)`).
- [ ] `GET /api/version` -> (Debe devolver AppName, Versión, y Entorno).
- [ ] No existen mensajes excesivos de error por tamaño de screenshots en los logs (el Server limita por defecto a 5MB el payload por seguridad).

## 5. Pruebas de Carga de Streaming
- [ ] El agente en Windows soporta estar encendido 24h.
- [ ] La configuración de FPS y Quality se respetan (recomendado: `fps: 2, quality: 60`).
- [ ] El backend solo envía el streaming de video (broadcast) hacia los cuartos (`room_ID`) suscritos, protegiendo el ancho de banda del VPS.

---

### Comandos Frecuentes para Operaciones:
**Subir Producción:**
```bash
docker-compose up -d --build
```
**Migrar DB (Solo la primera vez o tras updates):**
```bash
docker exec -it visioncontrol_server npx prisma migrate deploy
```
**Revisar Logs del Server:**
```bash
docker-compose logs -f server
```
**Revisar Logs de Nginx (PWA):**
```bash
docker-compose logs -f frontend
```
