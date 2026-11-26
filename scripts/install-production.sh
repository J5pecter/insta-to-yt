#!/usr/bin/env bash
set -euo pipefail

# SocialRelay V3 — Oracle Cloud / Ubuntu Production Installer (ARM64 & x86_64)
DATA_ROOT="${SOCIALRELAY_DATA_DIR:-/var/lib/socialrelay/data}"
STORAGE_ROOT="${SOCIALRELAY_STORAGE_DIR:-/var/lib/socialrelay/storage}"

echo "[SocialRelay] Verifying OS and architecture..."
uname -a
ARCH=$(uname -m)
echo "[SocialRelay] Architecture: $ARCH"

MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
DISK_GB=$(df -BG / | awk 'NR==2 {gsub("G","",$4); print $4}')
echo "[SocialRelay] Available RAM: ${MEM_MB}MB | Free Disk: ${DISK_GB}GB"

if [ "$DISK_GB" -lt 10 ]; then
  echo "ERROR: At least 10GB free disk space is required."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[SocialRelay] Installing Docker Engine & Compose plugin..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg sqlite3
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "[SocialRelay] Creating private persistent runtime directories..."
sudo mkdir -p "$DATA_ROOT" "$STORAGE_ROOT"/{originals,processed,thumbnails,temporary,backups}
sudo chown -R "$USER":"$USER" /var/lib/socialrelay
chmod 700 /var/lib/socialrelay "$DATA_ROOT"

if [ ! -f ".env.production" ]; then
  cp .env.production.example .env.production
  SESSION_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  FERNET_KEY=$(python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
  sed -i "s|CHANGE_ME_GENERATE_64_HEX_CHARS|$SESSION_SECRET|g" .env.production
  sed -i "s|CHANGE_ME_GENERATE_FERNET_KEY|$FERNET_KEY|g" .env.production
  chmod 600 .env.production
  echo "[SocialRelay] Created .env.production with unique cryptographic secrets."
fi

echo "[SocialRelay] Next step: run ./scripts/setup-admin.sh to set a strong administrator password, then ./scripts/deploy-production.sh"
