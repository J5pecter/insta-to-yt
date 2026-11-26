#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "[SocialRelay] Starting FastAPI, Embedded Worker, and Scheduler on http://127.0.0.1:8000 ..."
exec .venv/bin/python -m uvicorn api.app.main:app --host 127.0.0.1 --port 8000
