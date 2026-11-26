"""Job and publication target state machine for SocialRelay.
Enforces explicit validated transitions, records timestamps, reasons, and audit log entries.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Set

from sqlalchemy.orm import Session

from ..models.entities import AuditLog, Job, PublicationTarget, PublishingIntent

logger = logging.getLogger("socialrelay.state_machine")


class State(str, Enum):
    CREATED = "CREATED"
    VALIDATING = "VALIDATING"
    IMPORTING = "IMPORTING"
    IMPORTED = "IMPORTED"
    PROCESSING = "PROCESSING"
    METADATA_READY = "METADATA_READY"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    APPROVED = "APPROVED"
    SCHEDULED = "SCHEDULED"
    QUEUED = "QUEUED"
    UPLOADING = "UPLOADING"
    PLATFORM_PROCESSING = "PLATFORM_PROCESSING"
    VERIFYING = "VERIFYING"
    PUBLISHED = "PUBLISHED"
    PARTIALLY_PUBLISHED = "PARTIALLY_PUBLISHED"
    RETRY_PENDING = "RETRY_PENDING"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    FAILED = "FAILED"
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"
    CANCELLED = "CANCELLED"


# Valid state transitions graph
VALID_TRANSITIONS: dict[State, Set[State]] = {
    State.CREATED: {State.VALIDATING, State.FAILED, State.CANCELLED},
    State.VALIDATING: {State.IMPORTING, State.FAILED, State.CANCELLED},
    State.IMPORTING: {State.IMPORTED, State.FAILED, State.CANCELLED},
    State.IMPORTED: {State.PROCESSING, State.FAILED, State.CANCELLED},
    State.PROCESSING: {State.METADATA_READY, State.FAILED, State.CANCELLED},
    State.METADATA_READY: {State.AWAITING_APPROVAL, State.APPROVED, State.FAILED, State.CANCELLED},
    State.AWAITING_APPROVAL: {State.APPROVED, State.CANCELLED, State.FAILED},
    State.APPROVED: {State.SCHEDULED, State.QUEUED, State.CANCELLED},
    State.SCHEDULED: {State.QUEUED, State.CANCELLED},
    State.QUEUED: {State.UPLOADING, State.AUTH_REQUIRED, State.FAILED, State.CANCELLED},
    State.UPLOADING: {State.PLATFORM_PROCESSING, State.VERIFYING, State.PUBLISHED, State.RECONCILIATION_REQUIRED, State.FAILED, State.RETRY_PENDING},
    State.PLATFORM_PROCESSING: {State.VERIFYING, State.PUBLISHED, State.RECONCILIATION_REQUIRED, State.FAILED, State.RETRY_PENDING},
    State.VERIFYING: {State.PUBLISHED, State.RECONCILIATION_REQUIRED, State.FAILED},
    State.PUBLISHED: set(),  # Terminal state
    State.PARTIALLY_PUBLISHED: {State.QUEUED, State.RETRY_PENDING, State.FAILED},
    State.RETRY_PENDING: {State.QUEUED, State.FAILED, State.CANCELLED},
    State.AUTH_REQUIRED: {State.QUEUED, State.CANCELLED},
    State.RECONCILIATION_REQUIRED: {State.PUBLISHED, State.FAILED, State.RETRY_PENDING, State.QUEUED},
    State.FAILED: {State.RETRY_PENDING, State.QUEUED, State.CANCELLED},  # Can be manually retried
    State.CANCELLED: set(),  # Terminal state
}


class InvalidStateTransitionError(ValueError):
    pass


class StateMachine:
    @staticmethod
    def transition_target(
        db: Session,
        target: PublicationTarget,
        to_state: State,
        reason: str,
        user_id: Optional[int] = None,
        details: Optional[dict] = None,
    ) -> PublicationTarget:
        """Execute a validated transition on a publication target with an audit trail."""
        from_state = State(target.status) if target.status in State.__members__ else State.QUEUED

        allowed = VALID_TRANSITIONS.get(from_state, set())
        if to_state not in allowed and from_state != to_state:
            raise InvalidStateTransitionError(
                f"Illegal state transition from {from_state.value} to {to_state.value} for target {target.id}."
            )

        now = datetime.now(timezone.utc)
        target.status = to_state.value
        target.updated_at = now
        if to_state == State.PUBLISHED:
            target.published_at = now

        # Record audit log
        audit = AuditLog(
            user_id=user_id,
            event_type="STATE_TRANSITION",
            entity_type="publication_target",
            entity_id=str(target.id),
            sanitized_details=json.dumps({
                "from_state": from_state.value,
                "to_state": to_state.value,
                "reason": reason,
                "details": details or {},
                "timestamp": now.isoformat(),
            }),
        )
        db.add(audit)
        db.commit()
        db.refresh(target)
        logger.info(f"Target {target.id} transitioned {from_state.value} -> {to_state.value} ({reason})")
        return target

    @staticmethod
    def transition_job(
        db: Session,
        job: Job,
        to_state: State,
        reason: str,
        progress: Optional[int] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Job:
        """Execute a state transition on a queue Job."""
        now = datetime.now(timezone.utc)
        job.status = to_state.value
        job.updated_at = now
        if progress is not None:
            job.progress = progress
        if error_code:
            job.error_code = error_code
        if error_message:
            job.error_message = error_message
        if to_state in (State.PUBLISHED, State.FAILED, State.CANCELLED):
            job.lease_owner = None
            job.lease_expiry = None

        db.commit()
        db.refresh(job)
        return job
