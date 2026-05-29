# Etapa 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm install

# Generar Prisma Client (si DATABASE_URL esta configurada)
RUN npx prisma generate || true

# Copiar el código fuente
COPY . .

# Construir aplicación
RUN npm run build

# Etapa 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3001

# Copiar desde el builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Exponer puerto
EXPOSE 3001

# Comando por defecto para iniciar en producción
CMD ["npm", "start"]
