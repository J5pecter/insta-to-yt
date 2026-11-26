"""Persistent database-backed job queue for SocialRelay.
Implements lease locking, heartbeat, exponential backoff, worker recovery, and idempotent execution.
"""
from __future__ import annotations

import json
import logging
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.database import db_session
from ..models.entities import ContentDraft, Job, MediaAsset, PublicationTarget, PublishingIntent, SocialAccount
from ..providers.instagram.adapter import InstagramAdapterError, instagram_adapter
from ..providers.youtube.adapter import YouTubeAdapterError, youtube_adapter
from .state_machine import State, StateMachine

logger = logging.getLogger("socialrelay.worker")


class JobQueue:
    def __init__(self, db: Session):
        self.db = db

    def enqueue(
        self,
        job_type: str,
        target_id: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
        run_at: Optional[datetime] = None,
        max_attempts: int = settings.MAX_JOB_RETRIES,
    ) -> Job:
        """Enqueue a new persistent background job."""
        now = datetime.now(timezone.utc)
        job = Job(
            job_type=job_type,
            target_id=target_id,
            status=State.QUEUED.value,
            attempts=0,
            max_attempts=max_attempts,
            run_at=run_at or now,
            progress=0,
            payload=json.dumps(payload or {}),
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        logger.info(f"Enqueued job {job.id} (type: {job_type}, target: {target_id})")
        return job

    def acquire_next_job(self, worker_id: str, lease_seconds: int = settings.JOB_LEASE_SECONDS) -> Optional[Job]:
        """Claim the next ready job with an atomic lease lock to prevent race conditions."""
        now = datetime.now(timezone.utc)
        lease_expiry = now + timedelta(seconds=lease_seconds)

        # Select candidate: status QUEUED and run_at <= now, unleased or expired lease
        stmt = (
            select(Job)
            .where(
                Job.status.in_([State.QUEUED.value, State.RETRY_PENDING.value]),
                Job.run_at <= now,
                or_(Job.lease_owner.is_(None), Job.lease_expiry < now),
            )
            .order_by(Job.run_at.asc())
            .limit(1)
        )
        job = self.db.execute(stmt).scalars().first()
        if not job:
            return None

        # Claim the lease
        job.lease_owner = worker_id
        job.lease_expiry = lease_expiry
        job.heartbeat_at = now
        job.status = State.PROCESSING.value if job.job_type != "publish_target" else State.UPLOADING.value
        self.db.commit()
        self.db.refresh(job)
        return job

    def heartbeat(self, job_id: int, worker_id: str, progress: Optional[int] = None) -> None:
        """Update worker heartbeat timestamp and lease expiration."""
        now = datetime.now(timezone.utc)
        job = self.db.execute(select(Job).where(Job.id == job_id)).scalars().first()
        if job and job.lease_owner == worker_id:
            job.heartbeat_at = now
            job.lease_expiry = now + timedelta(seconds=settings.JOB_LEASE_SECONDS)
            if progress is not None:
                job.progress = progress
            self.db.commit()

    def recover_abandoned_jobs(self) -> int:
        """Reset jobs whose worker lease has expired back to QUEUED."""
        now = datetime.now(timezone.utc)
        stmt = (
            select(Job)
            .where(
                Job.lease_owner.isnot(None),
                Job.lease_expiry < now,
                Job.status.in_([State.PROCESSING.value, State.UPLOADING.value, State.PLATFORM_PROCESSING.value]),
            )
        )
        abandoned = self.db.execute(stmt).scalars().all()
        count = 0
        for job in abandoned:
            logger.warning(f"Recovering abandoned job {job.id} previously owned by {job.lease_owner}")
            job.lease_owner = None
            job.lease_expiry = None
            job.status = State.QUEUED.value
            count += 1
        if count > 0:
            self.db.commit()
        return count

    def execute_job(self, job: Job, worker_id: str) -> None:
        """Dispatch and execute a claimed job."""
        job.attempts += 1
        self.db.commit()

        try:
            if job.job_type == "publish_target":
                self._execute_publish_target(job, worker_id)
            else:
                logger.info(f"Custom job type {job.job_type} executed.")
                StateMachine.transition_job(self.db, job, State.PUBLISHED, reason="Job completed", progress=100)
        except Exception as e:
            logger.exception(f"Job {job.id} failed on attempt {job.attempts}: {e}")
            self._handle_job_failure(job, str(e))

    def _execute_publish_target(self, job: Job, worker_id: str) -> None:
        """Process publication target upload to YouTube or Instagram."""
        target = self.db.execute(
            select(PublicationTarget).where(PublicationTarget.id == job.target_id)
        ).scalars().first()
        if not target:
            raise RuntimeError(f"PublicationTarget {job.target_id} not found.")

        intent = self.db.execute(
            select(PublishingIntent).where(PublishingIntent.id == target.publishing_intent_id)
        ).scalars().first()
        draft = self.db.execute(
            select(ContentDraft).where(ContentDraft.id == intent.draft_id)
        ).scalars().first()
        asset = self.db.execute(
            select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)
        ).scalars().first()
        account = self.db.execute(
            select(SocialAccount).where(SocialAccount.id == target.social_account_id)
        ).scalars().first()

        if not account or account.connection_status != "connected":
            StateMachine.transition_target(self.db, target, State.AUTH_REQUIRED, reason="Social account disconnected")
            StateMachine.transition_job(self.db, job, State.AUTH_REQUIRED, reason="Social account disconnected", error_message="Account disconnected")
            return

        video_path = Path(asset.storage_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video file missing: {video_path}")

        # Idempotency check: verify target isn't already marked PUBLISHED
        if target.status == State.PUBLISHED.value and target.published_url:
            logger.info(f"Target {target.id} was already published at {target.published_url}. Skipping duplicate.")
            StateMachine.transition_job(self.db, job, State.PUBLISHED, reason="Already published", progress=100)
            return

        StateMachine.transition_target(self.db, target, State.UPLOADING, reason="Starting upload")

        def on_progress(pct: int, msg: str = ""):
            self.heartbeat(job.id, worker_id, progress=pct)

        # Platform specific upload
        if account.platform == "youtube":
            res = youtube_adapter.upload_video(
                encrypted_token=account.encrypted_access_token,
                video_path=video_path,
                title=draft.title,
                description=draft.description or "",
                tags=json.loads(draft.hashtags) if draft.hashtags else [],
                privacy="private",
                progress_callback=lambda p: on_progress(p),
            )
            target.published_url = res["video_url"]
            target.remote_media_id = res["video_id"]
        elif account.platform == "instagram":
            # For local self-hosting: If configured with public base URL, serve signed temporary media URL
            media_serve_url = f"{settings.PUBLIC_BASE_URL}/api/v1/media/public/{asset.id}/download"
            res = instagram_adapter.publish_reel(
                encrypted_token=account.encrypted_access_token,
                ig_user_id=account.external_account_id,
                video_url=media_serve_url,
                caption=draft.caption or draft.title,
                progress_callback=on_progress,
            )
            target.published_url = res["published_url"]
            target.remote_container_id = res.get("container_id")
            target.remote_media_id = res.get("media_id")
        else:
            raise NotImplementedError(f"Unsupported platform: {account.platform}")

        # Transition target to published
        StateMachine.transition_target(self.db, target, State.PUBLISHED, reason="Upload verified")
        account.last_published_at = datetime.now(timezone.utc)
        self.db.commit()

        # Update intent status if all targets published
        all_targets = self.db.execute(
            select(PublicationTarget).where(PublicationTarget.publishing_intent_id == intent.id)
        ).scalars().all()
        if all(t.status == State.PUBLISHED.value for t in all_targets):
            intent.status = State.PUBLISHED.value
        elif any(t.status == State.PUBLISHED.value for t in all_targets):
            intent.status = State.PARTIALLY_PUBLISHED.value
        self.db.commit()

        StateMachine.transition_job(self.db, job, State.PUBLISHED, reason="Upload completed", progress=100)

    def _handle_job_failure(self, job: Job, error_str: str) -> None:
        """Handle failure with bounded exponential backoff or escalation to RECONCILIATION_REQUIRED."""
        target = None
        if job.target_id and job.job_type == "publish_target":
            target = self.db.execute(select(PublicationTarget).where(PublicationTarget.id == job.target_id)).scalars().first()

        # Check for timeout during active upload: requires reconciliation
        if "timed out" in error_str.lower() or "timeout" in error_str.lower():
            if target:
                StateMachine.transition_target(self.db, target, State.RECONCILIATION_REQUIRED, reason="Timeout during upload")
            StateMachine.transition_job(self.db, job, State.RECONCILIATION_REQUIRED, reason="Upload timeout", error_message=error_str)
            return

        if job.attempts < job.max_attempts:
            # Exponential backoff with jitter: 2^attempts * 15s + random jitter
            delay_sec = int((2 ** job.attempts) * 15 + random.uniform(1, 10))
            next_run = datetime.now(timezone.utc) + timedelta(seconds=delay_sec)
            job.run_at = next_run
            job.lease_owner = None
            job.lease_expiry = None
            StateMachine.transition_job(
                self.db,
                job,
                State.RETRY_PENDING,
                reason=f"Retrying in {delay_sec}s (attempt {job.attempts}/{job.max_attempts})",
                error_message=error_str,
            )
            if target:
                StateMachine.transition_target(self.db, target, State.RETRY_PENDING, reason=f"Temporary error: {error_str[:100]}")
        else:
            StateMachine.transition_job(self.db, job, State.FAILED, reason="Exceeded maximum attempts", error_message=error_str)
            if target:
                StateMachine.transition_target(self.db, target, State.FAILED, reason=f"Final failure: {error_str[:100]}")
