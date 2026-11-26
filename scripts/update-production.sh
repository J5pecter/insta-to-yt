#!/usr/bin/env bash
set -euo pipefail

echo "[SocialRelay] Step 1: Backing up production database before update..."
./scripts/backup-production.sh

PREV_COMMIT=$(git rev-parse HEAD)
echo "$PREV_COMMIT" > /var/lib/socialrelay/last_good_commit

echo "[SocialRelay] Step 2: Pulling approved release from origin/main..."
git fetch origin main
git pull --ff-only origin main

echo "[SocialRelay] Step 3: Rebuilding and restarting containers..."
if ! docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build; then
  echo "ERROR: Build failed. Rolling back to $PREV_COMMIT..."
  ./scripts/rollback-production.sh
  exit 1
fi

sleep 8
if ! ./scripts/health-check.sh; then
  echo "ERROR: Health check failed after update. Rolling back..."
  ./scripts/rollback-production.sh
  exit 1
fi

echo "[SocialRelay] Update completed and verified!"
