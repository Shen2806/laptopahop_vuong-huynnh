# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Cần toolchain để build bcrypt trên Alpine (musl)
RUN apk add --no-cache python3 make g++

# Copy trước để postinstall (prisma generate) có schema
COPY package*.json ./
COPY prisma ./prisma

# QUAN TRỌNG: KHÔNG dùng --ignore-scripts để bcrypt được build
RUN npm ci

# (Prisma đã generate ở postinstall; có thể chạy lại cũng không sao)
RUN npx prisma generate

# Build TS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Đóng gói views/static vào dist để Express tìm thấy
RUN mkdir -p dist/views  && cp -R src/views/*  dist/views/
RUN [ -d src/public ] && mkdir -p dist/public && cp -R src/public/* dist/public || true

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/prisma      ./prisma
COPY docker ./docker

RUN sed -i 's/\r$//' ./docker/entrypoint.sh && chmod +x ./docker/entrypoint.sh

EXPOSE 8080
CMD ["/bin/sh", "/app/docker/entrypoint.sh"]
