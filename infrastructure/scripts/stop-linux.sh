#!/usr/bin/env bash
set -euo pipefail
pkill -f "uvicorn api.app.main:app" || true
echo "[SocialRelay] Stopped SocialRelay server."
