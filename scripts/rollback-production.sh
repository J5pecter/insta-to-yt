#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "/var/lib/socialrelay/last_good_commit" ]; then
  echo "ERROR: No previous commit recorded for rollback."
  exit 1
fi

PREV_COMMIT=$(cat /var/lib/socialrelay/last_good_commit)
echo "[SocialRelay] Rolling back repository to $PREV_COMMIT..."
git checkout "$PREV_COMMIT"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
./scripts/health-check.sh
