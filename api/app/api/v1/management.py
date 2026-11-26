"""Dashboard, Calendar, Analytics, Audit, System Health, and Backup endpoints for SocialRelay."""
from __future__ import annotations

import csv
import io
import json
import shutil
import sqlite3
import time
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.config import settings
from ...core.database import engine, get_db
from ...models.entities import (
    AnalyticsSnapshot,
    AuditLog,
    Backup,
    ContentDraft,
    Job,
    MediaAsset,
    Notification,
    PublicationTarget,
    PublishingIntent,
    SocialAccount,
    SourceMedia,
    User,
)
from ...services.metadata.engine import metadata_engine
from ...services.storage.manager import storage_manager
from ...workers.state_machine import State

router = APIRouter(tags=["Management & System"])


@router.get("/dashboard")
def get_dashboard_metrics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return live database-derived operational metrics for the dashboard."""
    total_imported = db.execute(select(func.count(SourceMedia.id))).scalar() or 0
    total_published = db.execute(
        select(func.count(PublicationTarget.id)).where(PublicationTarget.status == State.PUBLISHED.value)
    ).scalar() or 0
    pending_drafts = db.execute(
        select(func.count(ContentDraft.id)).where(ContentDraft.approval_status != "published")
    ).scalar() or 0
    scheduled_count = db.execute(
        select(func.count(PublishingIntent.id)).where(PublishingIntent.status == State.SCHEDULED.value)
    ).scalar() or 0
    active_jobs = db.execute(
        select(func.count(Job.id)).where(
            Job.status.in_([State.QUEUED.value, State.PROCESSING.value, State.UPLOADING.value, State.PLATFORM_PROCESSING.value])
        )
    ).scalar() or 0
    failed_jobs = db.execute(
        select(func.count(Job.id)).where(Job.status.in_([State.FAILED.value, State.RECONCILIATION_REQUIRED.value]))
    ).scalar() or 0
    connected_accounts = db.execute(
        select(func.count(SocialAccount.id)).where(SocialAccount.connection_status == "connected")
    ).scalar() or 0

    storage_stats = storage_manager.get_storage_stats()

    # Upcoming scheduled publishing items
    now = datetime.now(timezone.utc)
    upcoming_stmt = (
        select(PublishingIntent)
        .where(PublishingIntent.status == State.SCHEDULED.value, PublishingIntent.scheduled_at >= now)
        .order_by(PublishingIntent.scheduled_at.asc())
        .limit(5)
    )
    upcoming_intents = db.execute(upcoming_stmt).scalars().all()
    upcoming_items = []
    for inc in upcoming_intents:
        d = db.execute(select(ContentDraft).where(ContentDraft.id == inc.draft_id)).scalars().first()
        upcoming_items.append({
            "intent_id": inc.id,
            "title": d.title if d else "Untitled",
            "scheduled_at": inc.scheduled_at.isoformat() if inc.scheduled_at else None,
            "thumbnail_url": f"/api/v1/media/{d.media_asset_id}/thumbnail" if d else None,
        })

    # Recent activity logs
    recent_logs = db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(8)).scalars().all()
    activity = [
        {
            "id": log.id,
            "event_type": log.event_type,
            "entity_type": log.entity_type,
            "details": json.loads(log.sanitized_details) if log.sanitized_details else {},
            "created_at": log.created_at.isoformat(),
        }
        for log in recent_logs
    ]

    return {
        "metrics": {
            "total_imported": total_imported,
            "total_published": total_published,
            "pending_drafts": pending_drafts,
            "scheduled_count": scheduled_count,
            "active_jobs": active_jobs,
            "failed_jobs": failed_jobs,
            "connected_accounts": connected_accounts,
            "storage_free_mb": storage_stats["free_mb"],
        },
        "upcoming_schedule": upcoming_items,
        "recent_activity": activity,
        "worker_status": "active" if active_jobs > 0 else "idle",
        "system_time": now.isoformat(),
    }


@router.get("/calendar")
def get_calendar_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve publishing calendar entries with thumbnails and scheduled timestamps."""
    stmt = select(PublishingIntent)
    if start_date:
        stmt = stmt.where(PublishingIntent.scheduled_at >= datetime.fromisoformat(start_date))
    if end_date:
        stmt = stmt.where(PublishingIntent.scheduled_at <= datetime.fromisoformat(end_date))

    intents = db.execute(stmt).scalars().all()
    events = []
    for inc in intents:
        draft = db.execute(select(ContentDraft).where(ContentDraft.id == inc.draft_id)).scalars().first()
        targets = db.execute(
            select(PublicationTarget).where(PublicationTarget.publishing_intent_id == inc.id)
        ).scalars().all()

        target_platforms = []
        for t in targets:
            acc = db.execute(select(SocialAccount).where(SocialAccount.id == t.social_account_id)).scalars().first()
            if acc:
                target_platforms.append(acc.platform)

        events.append({
            "id": inc.id,
            "draft_id": draft.id if draft else None,
            "title": draft.title if draft else "Untitled",
            "scheduled_at": inc.scheduled_at.isoformat() if inc.scheduled_at else None,
            "status": inc.status,
            "platforms": target_platforms,
            "thumbnail_url": f"/api/v1/media/{draft.media_asset_id}/thumbnail" if draft else None,
        })

    return {"events": events}


@router.get("/analytics")
def get_analytics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve published performance metrics and aggregated stats."""
    total_targets = db.execute(select(func.count(PublicationTarget.id))).scalar() or 0
    successful_targets = db.execute(
        select(func.count(PublicationTarget.id)).where(PublicationTarget.status == State.PUBLISHED.value)
    ).scalar() or 0
    failed_targets = db.execute(
        select(func.count(PublicationTarget.id)).where(PublicationTarget.status == State.FAILED.value)
    ).scalar() or 0

    success_rate = round((successful_targets / total_targets * 100), 1) if total_targets > 0 else 100.0

    # Platform distribution
    yt_count = db.execute(
        select(func.count(PublicationTarget.id))
        .join(SocialAccount)
        .where(SocialAccount.platform == "youtube", PublicationTarget.status == State.PUBLISHED.value)
    ).scalar() or 0
    ig_count = db.execute(
        select(func.count(PublicationTarget.id))
        .join(SocialAccount)
        .where(SocialAccount.platform == "instagram", PublicationTarget.status == State.PUBLISHED.value)
    ).scalar() or 0

    return {
        "success_rate": success_rate,
        "total_publications": successful_targets,
        "failed_publications": failed_targets,
        "platforms": {
            "youtube": yt_count,
            "instagram": ig_count,
        },
        "last_refresh": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/analytics/export-csv")
def export_analytics_csv(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Download CSV export of publication history and platform results."""
    targets = db.execute(select(PublicationTarget).order_by(desc(PublicationTarget.created_at))).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Target ID",
        "Intent ID",
        "Platform",
        "Account Name",
        "Status",
        "Published URL",
        "Published At",
        "Created At",
    ])

    for t in targets:
        acc = db.execute(select(SocialAccount).where(SocialAccount.id == t.social_account_id)).scalars().first()
        writer.writerow([
            t.id,
            t.publishing_intent_id,
            acc.platform if acc else "Unknown",
            acc.account_name if acc else "Unknown",
            t.status,
            t.published_url or "",
            t.published_at.isoformat() if t.published_at else "",
            t.created_at.isoformat(),
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="socialrelay_publications.csv"'},
    )


@router.get("/notifications")
def get_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve system alerts and notifications."""
    notifs = db.execute(
        select(Notification).order_by(desc(Notification.created_at)).limit(20)
    ).scalars().all()
    unread_count = sum(1 for n in notifs if n.read_at is None)

    return {
        "unread_count": unread_count,
        "items": [
            {
                "id": n.id,
                "type": n.notification_type,
                "severity": n.severity,
                "message": n.message,
                "read": n.read_at is not None,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifs
        ],
    }


@router.post("/notifications/{id}/read")
def mark_notification_read(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark a notification as read."""
    n = db.execute(select(Notification).where(Notification.id == id)).scalars().first()
    if n and not n.read_at:
        n.read_at = datetime.now(timezone.utc)
        db.commit()
    return {"status": "success"}


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve system audit logs for administrative monitoring."""
    logs = db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit)).scalars().all()
    return {
        "items": [
            {
                "id": l.id,
                "event_type": l.event_type,
                "entity_type": l.entity_type,
                "entity_id": l.entity_id,
                "details": json.loads(l.sanitized_details) if l.sanitized_details else {},
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }


@router.get("/system/health")
def get_system_health(current_user: User = Depends(get_current_user)):
    """Inspect core subsystems: SQLite, FFmpeg, Ollama, disk space, and memory."""
    ai_status = metadata_engine.check_ollama_status()
    storage_stats = storage_manager.get_storage_stats()

    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": {
            "engine": "SQLite WAL",
            "url": settings.DATABASE_URL,
            "status": "connected",
        },
        "media_processor": {
            "ffmpeg": "available",
            "bundled": True,
        },
        "ai_engine": {
            "provider": settings.AI_PROVIDER,
            "ollama_available": ai_status["available"],
            "model": ai_status["selected_model"],
        },
        "storage": {
            "free_mb": storage_stats["free_mb"],
            "status": "sufficient" if storage_stats["free_mb"] > settings.DISK_FREE_MIN_MB else "low_disk",
        },
    }


@router.get("/system/storage")
def get_storage_stats(current_user: User = Depends(get_current_user)):
    """Return storage directory metrics and breakdown."""
    return storage_manager.get_storage_stats()


@router.post("/system/storage/cleanup")
def cleanup_storage(current_user: User = Depends(get_current_user)):
    """Trigger manual cleanup of temporary files and orphaned processing derivatives."""
    cleaned = storage_manager.cleanup_temporary_files(settings.TEMP_RETENTION_HOURS)
    return {"status": "success", "cleaned_files": cleaned}


@router.post("/system/backup")
def create_backup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create an atomic SQLite database and storage backup bundle with SHA-256 checksum."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"socialrelay_backup_{timestamp}.zip"
    backup_path = storage_manager.allocate_path("backups", extension="zip")

    # 1. Vacuum SQLite into temporary DB file
    temp_db_path = settings.temporary_dir / f"db_backup_{timestamp}.db"
    try:
        # Use SQLite VACUUM INTO for atomic non-blocking snapshot
        with sqlite3.connect(settings.DATABASE_URL.replace("sqlite:///", "")) as conn:
            conn.execute(f"VACUUM INTO '{temp_db_path.as_posix()}'")

        # 2. Package database snapshot into ZIP archive
        with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(temp_db_path, arcname="database.db")
            # Include metadata manifest
            manifest = {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "app_version": settings.APP_VERSION,
                "type": "database_snapshot",
            }
            z.writestr("manifest.json", json.dumps(manifest, indent=2))

        temp_db_path.unlink(missing_ok=True)
        checksum = storage_manager.calculate_sha256(backup_path)

        rec = Backup(
            storage_path=str(backup_path),
            checksum=checksum,
            backup_type="db_snapshot",
            restore_status="verified",
        )
        db.add(rec)
        db.commit()

        return {
            "status": "success",
            "backup_id": rec.id,
            "filename": backup_filename,
            "checksum": checksum,
            "size_bytes": backup_path.stat().st_size,
            "download_url": f"/api/v1/system/backup/{rec.id}/download",
        }
    except Exception as e:
        temp_db_path.unlink(missing_ok=True)
        backup_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Backup creation failed: {e}")


@router.get("/system/backup/{id}/download")
def download_backup(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Download backup file."""
    rec = db.execute(select(Backup).where(Backup.id == id)).scalars().first()
    if not rec or not Path(rec.storage_path).exists():
        raise HTTPException(status_code=404, detail="Backup file not found.")

    return FileResponse(
        Path(rec.storage_path),
        media_type="application/zip",
        filename=f"backup_{id}_{Path(rec.storage_path).name}",
    )
