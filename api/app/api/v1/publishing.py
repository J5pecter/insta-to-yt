"""Publishing management endpoints for SocialRelay."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.config import settings
from ...core.database import get_db
from ...models.entities import ContentDraft, MediaAsset, PublicationTarget, PublishingIntent, SocialAccount, User
from ...providers.instagram.adapter import instagram_adapter
from ...schemas.schemas import PublishingCreateRequest
from ...services.storage.manager import storage_manager
from ...workers.job_queue import JobQueue
from ...workers.state_machine import State, StateMachine

router = APIRouter(prefix="/publishing", tags=["Publishing"])


@router.post("/preview")
def preview_publication(
    draft_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate platform-specific card previews for YouTube Shorts and Instagram Reels."""
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == draft_id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    asset = db.execute(select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)).scalars().first()

    tags = []
    if draft.hashtags:
        try:
            tags = json.loads(draft.hashtags)
        except Exception:
            tags = draft.hashtags.split()

    return {
        "draft_id": draft.id,
        "media_asset_id": draft.media_asset_id,
        "is_vertical": asset.is_vertical if asset else True,
        "duration": asset.duration if asset else 0,
        "thumbnail_url": f"/api/v1/media/{draft.media_asset_id}/thumbnail",
        "youtube": {
            "title": draft.title[:100],
            "title_length": len(draft.title[:100]),
            "description": draft.description or "",
            "description_bytes": len((draft.description or "").encode("utf-8")),
            "tags": tags,
            "badge": "SHORTS" if (asset and asset.is_vertical and (asset.duration or 0) <= 60) else "VIDEO",
        },
        "instagram": {
            "caption": draft.caption or draft.title,
            "caption_length": len(draft.caption or draft.title),
            "hashtags": tags[:30],
            "badge": "REELS",
        },
    }


@router.post("/create")
def create_publishing_intent(
    body: PublishingCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a publishing intent and targets across selected accounts with idempotency protection."""
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == body.draft_id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    asset = db.execute(select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)).scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found.")

    accounts = db.execute(select(SocialAccount).where(SocialAccount.id.in_(body.account_ids))).scalars().all()
    if not accounts:
        raise HTTPException(status_code=400, detail="No valid destination accounts selected.")

    now = datetime.now(timezone.utc)
    is_scheduled = body.scheduled_at is not None and body.scheduled_at > now

    snapshot = json.dumps({
        "title": draft.title,
        "description": draft.description,
        "caption": draft.caption,
        "hashtags": draft.hashtags,
        "category_id": draft.category_id,
        "privacy": body.privacy,
        "made_for_kids": body.made_for_kids,
    })

    intent = PublishingIntent(
        draft_id=draft.id,
        approved_metadata_snapshot=snapshot,
        scheduled_at=body.scheduled_at if is_scheduled else None,
        approval_timestamp=now,
        status=State.SCHEDULED.value if is_scheduled else State.QUEUED.value,
    )
    db.add(intent)
    db.flush()

    queue = JobQueue(db)
    targets_created = []

    for acc in accounts:
        # Generate unique idempotency key
        idempotency_key = f"pub_{draft.id}_{acc.id}_{uuid.uuid4().hex[:8]}"

        target = PublicationTarget(
            publishing_intent_id=intent.id,
            social_account_id=acc.id,
            idempotency_key=idempotency_key,
            platform_settings=json.dumps({"privacy": body.privacy, "made_for_kids": body.made_for_kids}),
            status=State.SCHEDULED.value if is_scheduled else State.QUEUED.value,
        )
        db.add(target)
        db.flush()

        # If immediate execution, enqueue background job now
        if not is_scheduled:
            queue.enqueue(
                job_type="publish_target",
                target_id=target.id,
                payload={"intent_id": intent.id, "target_id": target.id},
            )

        targets_created.append({"target_id": target.id, "account": acc.account_name, "platform": acc.platform})

    db.commit()
    db.refresh(intent)

    return {
        "status": "success",
        "publishing_intent_id": intent.id,
        "scheduled_at": intent.scheduled_at.isoformat() if intent.scheduled_at else None,
        "state": intent.status,
        "targets": targets_created,
    }


@router.post("/{id}/execute")
def execute_intent_immediately(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Trigger immediate publishing of a scheduled or approved intent."""
    intent = db.execute(select(PublishingIntent).where(PublishingIntent.id == id)).scalars().first()
    if not intent:
        raise HTTPException(status_code=404, detail="Publishing intent not found.")

    intent.status = State.QUEUED.value
    intent.scheduled_at = None

    targets = db.execute(
        select(PublicationTarget).where(PublicationTarget.publishing_intent_id == intent.id)
    ).scalars().all()

    queue = JobQueue(db)
    for t in targets:
        if t.status in (State.SCHEDULED.value, State.QUEUED.value, State.FAILED.value):
            t.status = State.QUEUED.value
            queue.enqueue(
                job_type="publish_target",
                target_id=t.id,
                payload={"intent_id": intent.id, "target_id": t.id},
            )

    db.commit()
    return {"status": "success", "message": "Publishing jobs queued."}


@router.post("/{id}/cancel")
def cancel_intent(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cancel a scheduled or queued publishing intent."""
    intent = db.execute(select(PublishingIntent).where(PublishingIntent.id == id)).scalars().first()
    if not intent:
        raise HTTPException(status_code=404, detail="Publishing intent not found.")

    if intent.status == State.PUBLISHED.value:
        raise HTTPException(status_code=400, detail="Cannot cancel an already published intent.")

    intent.status = State.CANCELLED.value
    targets = db.execute(
        select(PublicationTarget).where(PublicationTarget.publishing_intent_id == intent.id)
    ).scalars().all()
    for t in targets:
        if t.status != State.PUBLISHED.value:
            t.status = State.CANCELLED.value

    db.commit()
    return {"status": "success", "message": "Publishing intent cancelled."}


@router.get("/{id}/status")
def get_intent_status(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve detailed publishing status across every destination target."""
    intent = db.execute(select(PublishingIntent).where(PublishingIntent.id == id)).scalars().first()
    if not intent:
        raise HTTPException(status_code=404, detail="Publishing intent not found.")

    targets = db.execute(
        select(PublicationTarget).where(PublicationTarget.publishing_intent_id == intent.id)
    ).scalars().all()

    target_details = []
    for t in targets:
        acc = db.execute(select(SocialAccount).where(SocialAccount.id == t.social_account_id)).scalars().first()
        target_details.append({
            "target_id": t.id,
            "account_id": t.social_account_id,
            "account_name": acc.account_name if acc else "Unknown",
            "platform": acc.platform if acc else "Unknown",
            "status": t.status,
            "published_url": t.published_url,
            "published_at": t.published_at.isoformat() if t.published_at else None,
            "error_message": t.error_message,
        })

    return {
        "intent_id": intent.id,
        "overall_status": intent.status,
        "scheduled_at": intent.scheduled_at.isoformat() if intent.scheduled_at else None,
        "targets": target_details,
    }


@router.get("/manual-export/{draft_id}")
def manual_export_package(draft_id: int, db: Session = Depends(get_db)):
    """Download a ZIP package containing the video, thumbnail, and caption for manual posting."""
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == draft_id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    asset = db.execute(select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)).scalars().first()
    if not asset or not Path(asset.storage_path).exists():
        raise HTTPException(status_code=404, detail="Video file not found.")

    zip_path = storage_manager.allocate_path("temporary", extension="zip")
    instagram_adapter.generate_manual_export_package(
        video_path=Path(asset.storage_path),
        thumbnail_path=Path(asset.thumbnail_path) if asset.thumbnail_path else None,
        caption=draft.caption or draft.title,
        title=draft.title,
        output_zip_path=zip_path,
    )

    return FileResponse(zip_path, media_type="application/zip", filename=f"export_{draft.title[:30]}.zip")
