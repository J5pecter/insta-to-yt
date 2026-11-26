#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${SOCIALRELAY_DATA_DIR:-/var/lib/socialrelay/data}"
BACKUP_DIR="${SOCIALRELAY_STORAGE_DIR:-/var/lib/socialrelay/storage}/backups"
TS=$(date +"%Y%m%d_%H%M%S")
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DATA_DIR/socialrelay.db" ]; then
  echo "[SocialRelay] No database file found yet at $DATA_DIR/socialrelay.db — skipping backup."
  exit 0
fi

OUT_DB="$BACKUP_DIR/socialrelay_db_${TS}.db"
sqlite3 "$DATA_DIR/socialrelay.db" "VACUUM INTO '$OUT_DB'"
sha256sum "$OUT_DB" > "${OUT_DB}.sha256"
chmod 600 "$OUT_DB" "${OUT_DB}.sha256"

# Prune backups older than 30 days
find "$BACKUP_DIR" -name "socialrelay_db_*.db*" -mtime +30 -delete
echo "[SocialRelay] Atomic backup created: $OUT_DB"
