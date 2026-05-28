# Visión SaaS Multiempresa

Transformar VisionControl de una herramienta de acceso remoto genérica a una plataforma Software as a Service B2B.

## Aislamiento de Datos (Multi-Tenant)

El pilar de un SaaS B2B es el modelo de datos. Todas las consultas a la base de datos y eventos de WebSockets deben aislarse estrictamente mediante el `companyId`.

- **Lógica de BD:** Toda consulta de Prisma desde un controlador debe tener `where: { companyId: req.user.companyId }`.
- **Lógica de Sockets:** Al conectar, el usuario se une a `room:company_${companyId}`. Los agentes envían datos al servidor, y el servidor hace un broadcast **únicamente** a esa sala.

## Facturación y Planes (Futuro)

Se deben preparar entidades en la base de datos para manejar límites:

- **FREE:** Hasta 5 dispositivos. No control remoto interactivo, solo métricas.
- **PRO:** Hasta 50 dispositivos. Control remoto. Historial de 7 días.
- **ENTERPRISE:** Dispositivos ilimitados. Historial de 30 días, marcas blancas y exportación de logs.

Estos límites se aplicarán a nivel de middleware:
- *¿Puede registrar agente nuevo?* -> Contar dispositivos de la empresa vs Límite del plan.

## Branding (Marca Blanca)

Para clientes Enterprise, el frontend debe soportar tematización dinámica (Logo, Colores de la marca) basados en la configuración de la tabla `Company`.
