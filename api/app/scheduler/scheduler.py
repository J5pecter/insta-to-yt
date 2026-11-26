"""Persistent scheduler service for SocialRelay.
Uses APScheduler to evaluate scheduled publishing intents, recurring automations, and retention maintenance.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from zoneinfo import ZoneInfo

from ..core.config import settings
from ..core.database import db_session
from ..models.entities import Job, PublicationTarget, PublishingIntent
from ..services.storage.manager import storage_manager
from ..workers.job_queue import JobQueue
from ..workers.state_machine import State

logger = logging.getLogger("socialrelay.scheduler")


class RelayScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler(timezone=ZoneInfo(settings.USER_TIMEZONE))
        self.is_running = False

    def check_scheduled_publishing(self):
        """Find approved publishing intents whose scheduled_at has arrived, and queue publication targets."""
        now = datetime.now(timezone.utc)
        with db_session() as session:
            stmt = select(PublishingIntent).where(
                PublishingIntent.status == State.SCHEDULED.value,
                PublishingIntent.scheduled_at <= now,
            )
            intents = session.execute(stmt).scalars().all()
            queue = JobQueue(session)

            for intent in intents:
                logger.info(f"Scheduled time reached for intent {intent.id}. Enqueuing targets.")
                intent.status = State.QUEUED.value

                targets = session.execute(
                    select(PublicationTarget).where(PublicationTarget.publishing_intent_id == intent.id)
                ).scalars().all()

                for target in targets:
                    target.status = State.QUEUED.value
                    queue.enqueue(
                        job_type="publish_target",
                        target_id=target.id,
                        payload={"intent_id": intent.id, "target_id": target.id},
                    )

    def maintenance_task(self):
        """Perform periodic cleanup of temporary files and expired logs."""
        try:
            cleaned = storage_manager.cleanup_temporary_files(settings.TEMP_RETENTION_HOURS)
            if cleaned > 0:
                logger.info(f"Scheduler maintenance cleaned {cleaned} temporary files.")
        except Exception as e:
            logger.error(f"Maintenance task error: {e}")

    def start(self):
        """Start the background scheduler."""
        if self.is_running:
            return
        self.scheduler.add_job(
            self.check_scheduled_publishing,
            trigger=IntervalTrigger(seconds=15),
            id="check_scheduled_publishing",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.maintenance_task,
            trigger=IntervalTrigger(hours=1),
            id="maintenance_task",
            replace_existing=True,
        )
        self.scheduler.start()
        self.is_running = True
        logger.info("SocialRelay scheduler started successfully.")

    def shutdown(self):
        """Stop scheduler safely."""
        if self.is_running:
            self.scheduler.shutdown(wait=False)
            self.is_running = False
            logger.info("SocialRelay scheduler shut down.")


relay_scheduler = RelayScheduler()
