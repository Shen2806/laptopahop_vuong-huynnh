#!/bin/sh
set -e

echo "[ENTRYPOINT] Waiting for database to be ready..."
TRIES=0
MAX_TRIES=120

# Dùng chính DATABASE_URL trong container để ping DB
until node -e "require('mysql2/promise').createConnection(process.env.DATABASE_URL).then(c=>c.end())" >/dev/null 2>&1
do
  TRIES=$((TRIES+1))
  if [ "$TRIES" -gt "$MAX_TRIES" ]; then
    echo "[ENTRYPOINT] Database is not reachable. Exiting."
    exit 1
  fi
  sleep 2
done

echo "[ENTRYPOINT] DB is reachable. Running prisma generate..."
npx prisma generate

echo "[ENTRYPOINT] Applying migrations (deploy)..."
npx prisma migrate deploy || true

# Nếu bạn seed bằng script riêng, bật biến SEED_ON_BOOT để chạy
if [ "$SEED_ON_BOOT" = "true" ]; then
  echo "[ENTRYPOINT] Seeding data..."
  # ví dụ: node dist/config/seed.js (tuỳ dự án của bạn)
  node -e "try{require('./dist/config/seed.js')}catch(e){console.log('[SEED] skip:', e.message)}" || true
fi

echo "[ENTRYPOINT] Starting app..."
node dist/app.js
