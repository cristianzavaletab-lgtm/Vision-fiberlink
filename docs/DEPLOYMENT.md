
## Despliegue con Docker Compose (Recomendado)

En la FASE 8 se incluirá un archivo `docker-compose.yml` en la raíz del proyecto.

### Arquitectura de Contenedores

1. **`db`**: Contenedor oficial de PostgreSQL.
2. **`server`**: Imagen de Node.js ejecutando el backend (incluye Prisma Client y servidor Socket.IO).
3. **`frontend`**: Imagen de Nginx sirviendo los archivos estáticos de React compilados (`dist`). Este contenedor actúa también como Reverse Proxy.

### Pasos Generales (Futuro)

```bash
# 1. Clonar repositorio
git clone <url>
cd VisionControl

# 2. Configurar variables
cp .env.example .env

# 3. Levantar servicios
docker-compose up -d --build

# 4. Migrar base de datos
docker-compose exec server npx prisma migrate deploy
```

## Consideraciones para Render (Despliegue Actual)

- El Backend requiere configurar `CORS` de forma estricta.
- Se debe asegurar que las variables de entorno de Supabase se migren correctamente si se decide cambiar a una BD provisionada manualmente.
- Los WebSockets en Render mantienen conexiones persistentes sin problemas, pero escalar a múltiples instancias requerirá integrar el adaptador de Redis de Socket.IO.
