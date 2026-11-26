#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

./infrastructure/scripts/backup.sh
git pull --ff-only
.venv/bin/python -m pip install -r requirements.txt
if command -v npm >/dev/null 2>&1; then
  (cd apps/web && npm install && npm run build)
fi
echo "[SocialRelay] Update complete!"
