#!/usr/bin/env bash
set -euo pipefail

if [ ! -f ".env.production" ]; then
  echo "ERROR: .env.production not found. Run ./scripts/install-production.sh first."
  exit 1
fi

if grep -q "CHANGE_ME_" .env.production; then
  echo "ERROR: .env.production still contains CHANGE_ME placeholders. Run ./scripts/setup-admin.sh and set strong secrets."
  exit 1
fi

echo "[SocialRelay] Building and starting production stack (Caddy + Web + API + Worker)..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo "[SocialRelay] Waiting for services to become healthy..."
sleep 8
./scripts/health-check.sh
