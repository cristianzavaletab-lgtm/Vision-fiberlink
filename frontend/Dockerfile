# Etapa 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Argumentos de build
ARG VITE_SERVER_URL="http://localhost:3001"
ENV VITE_SERVER_URL=$VITE_SERVER_URL

# Instalar pnpm
RUN npm install -g pnpm

# Copiar dependencias
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || npm install

# Copiar código y construir
COPY . .
RUN npm run build

# Etapa 2: Servidor estático (Nginx)
FROM nginx:alpine AS runner

# Copiar config de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los estáticos construidos desde la etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
