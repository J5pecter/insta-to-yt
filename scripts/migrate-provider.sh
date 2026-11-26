#!/usr/bin/env bash
set -euo pipefail

# SocialRelay V4 — Provider-Neutral Cloud Migration Exporter
EXPORT_DIR="${1:-/tmp/socialrelay_migration_$(date +%Y%m%d_%H%M%S)}"
DATA_DIR="${SOCIALRELAY_DATA_DIR:-/var/lib/socialrelay/data}"
STORAGE_DIR="${SOCIALRELAY_STORAGE_DIR:-/var/lib/socialrelay/storage}"

mkdir -p "$EXPORT_DIR"
echo "[SocialRelay] Step 1: Creating atomic SQLite snapshot..."
./scripts/backup-production.sh

echo "[SocialRelay] Step 2: Copying latest DB backup, media, and encrypted config..."
LATEST_DB=$(ls -t "${STORAGE_DIR}/backups"/socialrelay_db_*.db | head -n 1)
cp "$LATEST_DB" "$EXPORT_DIR/socialrelay.db"
tar -czf "$EXPORT_DIR/media_storage.tar.gz" -C "$STORAGE_DIR" originals processed thumbnails

if [ -f ".env.production" ]; then
  cp .env.production "$EXPORT_DIR/.env.production"
  chmod 600 "$EXPORT_DIR/.env.production"
fi

echo "[SocialRelay] Migration bundle ready at: $EXPORT_DIR"
echo "Transfer securely via rsync/scp to your new Linux VM, update DNS, and run ./scripts/deploy-production.sh."
