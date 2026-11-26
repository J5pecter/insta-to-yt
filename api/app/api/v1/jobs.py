"""Background jobs management and real-time SSE streaming for SocialRelay."""
from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.database import get_db
from ...models.entities import Job, PublicationTarget, User
from ...schemas.schemas import JobRetryRequest
from ...workers.state_machine import State, StateMachine

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("")
def list_jobs(
    status_filter: Optional[str] = None,
    limit: int = Query(default=30, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List background processing and publishing jobs."""
    stmt = select(Job).order_by(desc(Job.updated_at)).limit(limit)
    if status_filter:
        stmt = stmt.where(Job.status == status_filter)

    jobs = db.execute(stmt).scalars().all()
    results = []
    for j in jobs:
        results.append({
            "id": j.id,
            "job_type": j.job_type,
            "target_id": j.target_id,
            "status": j.status,
            "attempts": j.attempts,
            "max_attempts": j.max_attempts,
            "progress": j.progress,
            "error_code": j.error_code,
            "error_message": j.error_message,
            "run_at": j.run_at.isoformat(),
            "updated_at": j.updated_at.isoformat(),
        })

    return {"total": len(results), "items": results}


@router.get("/{id}")
def get_job(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve full details of a specific job."""
    job = db.execute(select(Job).where(Job.id == id)).scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    return {
        "id": job.id,
        "job_type": job.job_type,
        "target_id": job.target_id,
        "status": job.status,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "progress": job.progress,
        "lease_owner": job.lease_owner,
        "lease_expiry": job.lease_expiry.isoformat() if job.lease_expiry else None,
        "error_code": job.error_code,
        "error_message": job.error_message,
        "payload": json.loads(job.payload) if job.payload else {},
        "run_at": job.run_at.isoformat(),
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


@router.post("/{id}/retry")
def retry_job(
    id: int,
    body: Optional[JobRetryRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually re-queue a failed job."""
    job = db.execute(select(Job).where(Job.id == id)).scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    job.status = State.QUEUED.value
    job.attempts = 0
    job.lease_owner = None
    job.lease_expiry = None
    job.error_message = None

    if job.target_id and job.job_type == "publish_target":
        target = db.execute(select(PublicationTarget).where(PublicationTarget.id == job.target_id)).scalars().first()
        if target:
            target.status = State.QUEUED.value

    db.commit()
    return {"status": "success", "message": "Job re-queued successfully."}


@router.post("/{id}/cancel")
def cancel_job(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cancel a pending or stalled job."""
    job = db.execute(select(Job).where(Job.id == id)).scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    job.status = State.CANCELLED.value
    job.lease_owner = None
    job.lease_expiry = None
    db.commit()
    return {"status": "success", "message": "Job cancelled."}


@router.post("/{id}/reconcile")
def reconcile_job(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reconcile an ambiguous job by checking remote platform status or resetting safely."""
    job = db.execute(select(Job).where(Job.id == id)).scalars().first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    target = None
    if job.target_id and job.job_type == "publish_target":
        target = db.execute(select(PublicationTarget).where(PublicationTarget.id == job.target_id)).scalars().first()

    # If target has a published URL, reconcile to PUBLISHED
    if target and target.published_url:
        StateMachine.transition_target(db, target, State.PUBLISHED, reason="Reconciled: remote URL confirmed")
        StateMachine.transition_job(db, job, State.PUBLISHED, reason="Reconciled successfully", progress=100)
        return {"status": "success", "reconciled_state": "PUBLISHED", "url": target.published_url}

    # Otherwise safely reset to QUEUED for clean re-attempt
    job.status = State.QUEUED.value
    job.lease_owner = None
    job.lease_expiry = None
    if target:
        target.status = State.QUEUED.value
    db.commit()

    return {"status": "success", "reconciled_state": "QUEUED", "message": "Safely re-queued for processing"}


@router.get("/stream/events")
async def stream_job_events(request: Request, db: Session = Depends(get_db)):
    """Server-Sent Events (SSE) endpoint providing live status updates for running jobs."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            # Query active jobs
            jobs = db.execute(
                select(Job)
                .where(Job.status.in_([State.QUEUED.value, State.PROCESSING.value, State.UPLOADING.value, State.PLATFORM_PROCESSING.value]))
                .order_by(desc(Job.updated_at))
                .limit(10)
            ).scalars().all()

            data = [
                {"id": j.id, "type": j.job_type, "status": j.status, "progress": j.progress}
                for j in jobs
            ]

            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(2.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
