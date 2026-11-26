# SocialRelay V4 — Zero-Cost Control & Resource Enforcement

SocialRelay enforces free-tier resource boundaries in [cost_control.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/services/cost_control.py) and [infrastructure/oci/variables.tf](file:///d:/Claude%20Apps/Insta%20to%20YT/infrastructure/oci/variables.tf):

## Enforced Configuration Flags
- `CLOUD_PROVIDER=oci`
- `FREE_TIER_ONLY=true`
- `ALLOW_PAID_RESOURCES=false`
- `ALLOW_AUTOMATIC_PLAN_UPGRADE=false`
- `MAX_CONCURRENT_VIDEO_JOBS=1`
- `ENABLE_LOCAL_AI=false` (deterministic metadata engine runs with zero extra RAM/CPU)
- `STORAGE_QUOTA_GB=40` / `DISK_FREE_MIN_MB=2048`

## Live Inspection
- API Endpoint: `GET /api/v1/system/cost-control`
- UI View: **Settings → System, Storage & Backups → API & Health**
- Note: Host CPU, disk, and app storage are measured directly; cloud provider billing APIs are not polled or fabricated.
