#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[SocialRelay] Checking prerequisites..."
command -v python3 >/dev/null 2>&1 || { echo "Python 3.11+ is required."; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || echo "Warning: system ffmpeg not found; imageio-ffmpeg fallback will be used if available."

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

mkdir -p data storage/originals storage/processed storage/thumbnails storage/temporary storage/backups

if [ ! -f ".env" ]; then
  cp .env.example .env
  FERNET_KEY=$(.venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  SESSION_KEY=$(.venv/bin/python -c "import secrets; print(secrets.token_hex(32))")
  sed -i "s|CHANGE_ME_GENERATE_WITH_FERNET_KEY|$FERNET_KEY|g" .env
  sed -i "s|change-this-to-a-very-secure-random-string-at-least-32-chars|$SESSION_KEY|g" .env
  chmod 600 .env
  echo "[SocialRelay] Generated .env with unique local encryption keys."
fi

.venv/bin/python -c "from api.app.models import init_db; init_db()"

if command -v npm >/dev/null 2>&1 && [ ! -f "apps/web/dist/index.html" ]; then
  (cd apps/web && npm install && npm run build)
fi

echo "[SocialRelay] Setup complete! Run ./infrastructure/scripts/start-linux.sh to launch."
