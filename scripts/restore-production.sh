#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path-to-backup.db>"
  exit 1
fi

BACKUP_FILE="$1"
DATA_DIR="${SOCIALRELAY_DATA_DIR:-/var/lib/socialrelay/data}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -f "${BACKUP_FILE}.sha256" ]; then
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

echo "[SocialRelay] Stopping API and Worker for safe restore..."
docker compose -f docker-compose.prod.yml stop api worker

cp "$BACKUP_FILE" "$DATA_DIR/socialrelay.db"
sqlite3 "$DATA_DIR/socialrelay.db" "PRAGMA integrity_check;"

echo "[SocialRelay] Restarting services..."
docker compose -f docker-compose.prod.yml up -d
./scripts/health-check.sh
