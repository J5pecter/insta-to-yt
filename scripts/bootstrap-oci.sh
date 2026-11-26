#!/usr/bin/env bash
set -euo pipefail

# SocialRelay V4 — OCI Always Free Terraform/OpenTofu Bootstrap
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCI_DIR="${SCRIPT_DIR}/../infrastructure/oci"

cd "$OCI_DIR"

if ! command -v tofu >/dev/null 2>&1 && ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: Install OpenTofu (tofu) or Terraform (terraform) first."
  exit 1
fi

TF_BIN=$(command -v tofu || command -v terraform)

echo "[SocialRelay] Initializing OCI Always Free IaC..."
$TF_BIN init

echo "[SocialRelay] Generating Always Free plan (validates free_tier_only=true and eligible shapes)..."
$TF_BIN plan -out=oci_free.plan

read -rp "Review the plan above. Type 'APPLY' to provision Always Free resources: " CONFIRM
if [ "$CONFIRM" != "APPLY" ]; then
  echo "Aborted without provisioning."
  exit 0
fi

$TF_BIN apply oci_free.plan
echo "[SocialRelay] OCI VM provisioned! Point your domain A record to the public_ip output above."
