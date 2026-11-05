#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ">> git pull"
git pull --ff-only origin main

echo ">> npm ci"
npm ci --omit=dev

echo ">> pm2"
if pm2 describe birja >/dev/null 2>&1; then
  pm2 restart birja --update-env
else
  pm2 start server.js --name birja
fi
pm2 save

PORT=$(grep -E '^PORT=' .env | cut -d= -f2)
sleep 2
curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3000}/" && echo ">> OK: ishlayapti (port ${PORT:-3000})"
