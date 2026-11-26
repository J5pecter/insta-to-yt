#!/usr/bin/env bash
set -euo pipefail

echo "[SocialRelay] Running repository security & hygiene audit..."
if git ls-files | grep -E '^(\.env$|\.env\.production$|data/|storage/|client_secret)'; then
  echo "FAIL: Sensitive or runtime files tracked in Git!"
  exit 1
fi

if grep -rn "admin1234" apps/web/src/ >/dev/null 2>&1; then
  echo "FAIL: Default password reference found in frontend source!"
  exit 1
fi

if grep -rn "localhost:8000" apps/web/src/ >/dev/null 2>&1; then
  echo "FAIL: Hardcoded localhost:8000 reference found in frontend source!"
  exit 1
fi

echo "PASS: Security & production hygiene audit clean."
