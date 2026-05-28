# Etapa 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar pnpm (usamos npm global)
RUN npm install -g pnpm

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Instalar dependencias
RUN pnpm install --frozen-lockfile || npm install

# Generar Prisma Client
RUN npx prisma generate

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
COPY --from=builder /app/prisma.config.ts ./

# Exponer puerto
EXPOSE 3001

# Comando por defecto para iniciar en producción
CMD ["npm", "start"]
