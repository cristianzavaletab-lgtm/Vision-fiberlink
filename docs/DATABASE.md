# Diseño de Base de Datos

La plataforma migrará a **PostgreSQL** administrado por **Prisma ORM** para ofrecer robustez transaccional y control estricto de esquemas.

## Modelos Principales (Esquema Proyectado)

### 1. Modelos de Multi-Tenant (SaaS)

```prisma
model Company {
  id        String   @id @default(cuid())
  name      String
  plan      PlanType @default(FREE)
  users     User[]
  sites     Site[]
  devices   Device[]
  createdAt DateTime @default(now())
}

model Site {
  id        String   @id @default(cuid())
  name      String
  location  String?
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
  devices   Device[]
}
```

### 2. Modelos de Acceso

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String   // Hashed bcrypt/argon2
  name      String
  role      Role     @default(TECHNICIAN)
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
}

enum Role {
  SUPER_ADMIN
  ADMIN
  TECHNICIAN
  READ_ONLY
}
```

### 3. Modelos de Dispositivos

```prisma
model Device {
  id        String   @id @default(cuid())
  name      String
  os        String
  ip        String?
  macAddress String?
  token     String   @unique // Hash del token del agente
  status    DeviceStatus @default(OFFLINE)
  siteId    String?
  site      Site?    @relation(fields: [siteId], references: [id])
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
  metrics   DeviceMetric[]
  logs      AuditLog[]
}

enum DeviceStatus {
  ONLINE
  OFFLINE
  SUSPENDED
}
```

### 4. Auditoría y Métricas (Data Pesada)

*Nota: Para escalamiento masivo, la tabla `DeviceMetric` y `Screenshot` podrían delegarse a una Base de Datos de series de tiempo (InfluxDB) o Storage Object (S3) respectivamente, pero inicialmente se manejarán en la base relacional o se mantendrán limitadas por retención en días.*

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  action      String
  description String?
  userId      String?
  deviceId    String?
  device      Device?  @relation(fields: [deviceId], references: [id])
  createdAt   DateTime @default(now())
}
```
