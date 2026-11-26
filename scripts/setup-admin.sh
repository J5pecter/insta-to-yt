#!/usr/bin/env bash
set -euo pipefail

if [ ! -f ".env.production" ]; then
  echo "ERROR: .env.production not found. Run ./scripts/install-production.sh first."
  exit 1
fi

read -rp "Enter Administrator Email [admin@skypatrol.online]: " ADMIN_EMAIL
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@skypatrol.online}"

read -rsp "Enter Strong Administrator Password (min 12 chars): " ADMIN_PASS
echo ""
if [ "${#ADMIN_PASS}" -lt 12 ]; then
  echo "ERROR: Password must be at least 12 characters."
  exit 1
fi

sed -i "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=${ADMIN_EMAIL}|g" .env.production
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASS}|g" .env.production
chmod 600 .env.production

echo "[SocialRelay] Administrator credentials configured securely in .env.production."
