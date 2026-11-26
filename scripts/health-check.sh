#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-socialrelay.skypatrol.online}"
echo "[SocialRelay] Checking internal API health..."
docker compose -f docker-compose.prod.yml exec -T api curl -sf http://localhost:8000/api/v1/system/health

echo "[SocialRelay] Checking Worker container..."
docker compose -f docker-compose.prod.yml ps worker | grep -q "Up"

echo "[SocialRelay] Checking public HTTPS endpoint ($DOMAIN)..."
curl -sfI "https://${DOMAIN}/api/v1/system/health" | head -n 5
echo "[SocialRelay] All health checks passed!"
