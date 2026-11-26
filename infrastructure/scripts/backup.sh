#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../.."

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="storage/backups"
mkdir -p "$BACKUP_DIR"

echo "Creating atomic SQLite backup..."
sqlite3 data/socialrelay.db "VACUUM INTO '$BACKUP_DIR/socialrelay_db_$TIMESTAMP.db'"

echo "Backup created at $BACKUP_DIR/socialrelay_db_$TIMESTAMP.db"
sha256sum "$BACKUP_DIR/socialrelay_db_$TIMESTAMP.db" > "$BACKUP_DIR/socialrelay_db_$TIMESTAMP.db.sha256"
