#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../.."

echo "Starting SocialRelay on http://localhost:8000"
if [ ! -f .env ]; then
    cp .env.example .env
fi

python -m uvicorn api.app.main:app --host 0.0.0.0 --port 8000
