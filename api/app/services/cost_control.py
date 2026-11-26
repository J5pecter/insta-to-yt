"""Zero-cost cloud resource enforcement & usage reporting for SocialRelay V4.
Enforces free-tier limits without fabricating provider billing metrics.
"""
from __future__ import annotations

import os
import platform
import shutil
from datetime import datetime, timezone
from typing import Any, Dict

from ..core.config import settings
from .storage.manager import storage_manager


class CostControlError(RuntimeError):
    pass


class CostControlService:
    def validate_zero_cost_policy(self) -> Dict[str, Any]:
        """Verify zero-cost flags are enforced."""
        if settings.FREE_TIER_ONLY and settings.ALLOW_PAID_RESOURCES:
            raise CostControlError("Policy violation: ALLOW_PAID_RESOURCES cannot be True when FREE_TIER_ONLY=True.")
        if settings.FREE_TIER_ONLY and settings.ALLOW_AUTOMATIC_PLAN_UPGRADE:
            raise CostControlError("Policy violation: ALLOW_AUTOMATIC_PLAN_UPGRADE must be False in FREE_TIER_ONLY mode.")

        return {
            "cloud_provider": settings.CLOUD_PROVIDER,
            "free_tier_only": settings.FREE_TIER_ONLY,
            "allow_paid_resources": settings.ALLOW_PAID_RESOURCES,
            "allow_automatic_plan_upgrade": settings.ALLOW_AUTOMATIC_PLAN_UPGRADE,
            "max_concurrent_video_jobs": min(settings.MAX_CONCURRENT_VIDEO_JOBS, 1) if settings.FREE_TIER_ONLY else settings.MAX_CONCURRENT_VIDEO_JOBS,
            "enable_local_ai": settings.ENABLE_LOCAL_AI,
            "media_retention_days": settings.MEDIA_RETENTION_DAYS,
        }

    def check_processing_allowed(self) -> Dict[str, Any]:
        """Check whether disk space and free-tier quotas allow starting a video job."""
        stats = storage_manager.get_storage_stats()
        free_mb = stats.get("free_mb", 0)
        total_used_mb = stats.get("total_used_mb", 0)
        quota_mb = settings.STORAGE_QUOTA_GB * 1024

        if free_mb < settings.DISK_FREE_MIN_MB:
            return {
                "allowed": False,
                "reason": f"Low disk space ({free_mb} MB free < {settings.DISK_FREE_MIN_MB} MB minimum). Run storage cleanup or increase retention.",
            }
        if total_used_mb >= quota_mb:
            return {
                "allowed": False,
                "reason": f"Configured storage quota reached ({total_used_mb} MB / {quota_mb} MB). Clean up old media first.",
            }
        return {"allowed": True, "reason": "Within free-tier storage and concurrency limits."}

    def get_resource_report(self) -> Dict[str, Any]:
        """Return measured host metrics alongside configured free-tier limits."""
        policy = self.validate_zero_cost_policy()
        storage = storage_manager.get_storage_stats()
        gate = self.check_processing_allowed()

        disk_usage = shutil.disk_usage(str(settings.STORAGE_DIR))
        load_avg = os.getloadavg() if hasattr(os, "getloadavg") else (0.0, 0.0, 0.0)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "policy": policy,
            "processing_gate": gate,
            "measured_host": {
                "architecture": platform.machine(),
                "cpu_count": os.cpu_count() or 1,
                "load_average_1m": round(load_avg[0], 2),
                "disk_total_gb": round(disk_usage.total / (1024 ** 3), 2),
                "disk_used_gb": round(disk_usage.used / (1024 ** 3), 2),
                "disk_free_gb": round(disk_usage.free / (1024 ** 3), 2),
                "app_storage_used_mb": storage.get("total_used_mb", 0),
            },
            "configured_limits": {
                "storage_quota_gb": settings.STORAGE_QUOTA_GB,
                "disk_free_min_mb": settings.DISK_FREE_MIN_MB,
                "temp_retention_hours": settings.TEMP_RETENTION_HOURS,
                "media_retention_days": settings.MEDIA_RETENTION_DAYS,
                "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
            },
            "provider_billing_api": "unavailable (zero-cost local enforcement active; inspect OCI Console for provider-side metering)",
        }


cost_control = CostControlService()
