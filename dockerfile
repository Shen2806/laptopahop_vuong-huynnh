# ================
# 1) Builder stage
# ================
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Dùng cho bcrypt/native module & để Prisma detect OpenSSL
RUN apt-get update && apt-get install -y python3 build-essential openssl && rm -rf /var/lib/apt/lists/*

# Cài deps (prisma generate sẽ chạy ở postinstall)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Copy source và build TypeScript
COPY . .
RUN npm run build

# EJS views không được tsc build -> copy sang dist
RUN mkdir -p dist/views && cp -r src/views/* dist/views/ || true

# ================
# 2) Runtime stage
# ================
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL (và libgomp1 nếu bạn chạy onnxruntime)
RUN apt-get update && apt-get install -y openssl libgomp1 && rm -rf /var/lib/apt/lists/*

# Copy từ stage builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Thư mục uploads (gắn volume khi chạy)
RUN mkdir -p /app/uploads

EXPOSE 3000

# Migrate schema rồi start app
CMD sh -c "npx prisma migrate deploy --schema=./prisma/schema.prisma && node --enable-source-maps dist/app.js"
