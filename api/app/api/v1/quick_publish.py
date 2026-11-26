"""One-click Quick Publish preparation, dispatch, and step-by-step progress endpoints for SocialRelay V2."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...models.entities import (
    ContentDraft,
    Job,
    MediaAsset,
    PublicationTarget,
    PublishingIntent,
    PublishingPreset,
    SocialAccount,
    SourceMedia,
    User,
)
from ...core.database import get_db
from ...services.imports.service import ImportService, ImportValidationError
from ...services.metadata.engine import metadata_engine
from ...workers.job_queue import JobQueue
from ...workers.state_machine import State

router = APIRouter(prefix="/quick-publish", tags=["Quick Publish"])


class QuickPrepareRequest(BaseModel):
    url: str
    rights_confirmed: bool = True
    preset_id: Optional[int] = None


class QuickPublishExecuteRequest(BaseModel):
    draft_id: int
    account_ids: List[int]
    title: str
    description: str = ""
    caption: str = ""
    hashtags: List[str] = []
    privacy: str = "private"
    made_for_kids: bool = False
    synthetic_content: bool = False
    rights_confirmed: bool = True
    scheduled_at: Optional[datetime] = None


def _get_active_preset(db: Session, preset_id: Optional[int] = None) -> Optional[PublishingPreset]:
    if preset_id:
        p = db.execute(select(PublishingPreset).where(PublishingPreset.id == preset_id)).scalars().first()
        if p:
            return p
    return db.execute(
        select(PublishingPreset).order_by(desc(PublishingPreset.is_default), desc(PublishingPreset.id))
    ).scalars().first()


@router.post("/prepare")
def quick_prepare(
    body: QuickPrepareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-import URL, optimize video, generate metadata, and apply saved publishing preset."""
    if not body.rights_confirmed:
        raise HTTPException(status_code=400, detail="Please confirm content rights before importing.")

    service = ImportService(db)
    try:
        res = service.import_from_url(
            raw_url=body.url.strip(),
            user_id=current_user.id,
            rights_confirmed=body.rights_confirmed,
        )
    except ImportValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not import URL automatically: {e}. Use the file upload fallback if media is restricted.",
        )

    draft_id = res.get("draft_id")
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == draft_id)).scalars().first()
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == res.get("media_asset_id"))).scalars().first()
    source = db.execute(select(SourceMedia).where(SourceMedia.id == res.get("source_media_id"))).scalars().first()

    preset = _get_active_preset(db, body.preset_id)

    # Apply deterministic metadata engine if caption exists
    if draft and source:
        mode_map = {
            "mode_a": "first_sentence",
            "mode_b": "clean_title",
            "mode_c": "exact_copy",
            "mode_d": "ai_generated",
        }
        raw_mode = preset.title_mode if preset else "mode_a"
        mode = mode_map.get(raw_mode, "first_sentence")
        attribution = (source.source_attribution or "") if (preset is None or preset.source_attribution) else ""
        conv = metadata_engine.convert_metadata(
            original_caption=source.original_caption or draft.caption or "",
            mode=mode,
            attribution_credit=attribution,
        )
        draft.title = conv.get("youtube_title") or draft.title
        draft.description = conv.get("youtube_description") or draft.description
        draft.hashtags = json.dumps(conv.get("instagram_hashtags") or [])
        if preset:
            draft.category_id = preset.youtube_category
        db.commit()
        db.refresh(draft)

    hashtags = []
    if draft and draft.hashtags:
        try:
            hashtags = json.loads(draft.hashtags)
        except Exception:
            hashtags = []

    return {
        "draft_id": draft.id if draft else draft_id,
        "source_media_id": source.id if source else None,
        "media_asset_id": asset.id if asset else None,
        "title": draft.title if draft else "",
        "description": draft.description if draft else "",
        "caption": draft.caption if draft else "",
        "hashtags": hashtags,
        "original_caption": source.original_caption if source else "",
        "source_attribution": source.source_attribution if source else "",
        "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail" if asset else None,
        "video_url": f"/api/v1/media/{asset.id}/stream" if asset else None,
        "duration": asset.duration if asset else 0,
        "width": asset.width if asset else 1080,
        "height": asset.height if asset else 1920,
        "is_vertical": asset.is_vertical if asset else True,
        "preset_applied": {
            "id": preset.id if preset else None,
            "name": preset.name if preset else "Default",
            "visibility": preset.visibility if preset else "private",
            "made_for_kids": preset.made_for_kids if preset else False,
            "synthetic_content": preset.synthetic_content if preset else False,
            "youtube_account_id": preset.youtube_account_id if preset else None,
            "instagram_account_id": preset.instagram_account_id if preset else None,
        },
    }


@router.post("/publish")
def quick_publish_execute(
    body: QuickPublishExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Freeze approved metadata, prevent duplicate submissions, and dispatch real publishing jobs."""
    if not body.rights_confirmed:
        raise HTTPException(status_code=400, detail="Content rights confirmation is required before publishing.")

    draft = db.execute(select(ContentDraft).where(ContentDraft.id == body.draft_id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Prepared draft not found.")

    asset = db.execute(select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)).scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found.")

    accounts = db.execute(select(SocialAccount).where(SocialAccount.id.in_(body.account_ids))).scalars().all()
    if not accounts:
        raise HTTPException(status_code=400, detail="Select at least one connected destination account.")

    # Persist final edited metadata on draft
    draft.title = body.title[:100]
    draft.description = body.description
    draft.caption = body.caption or body.description
    draft.hashtags = json.dumps(body.hashtags[:30])
    draft.approval_status = "approved"

    now = datetime.now(timezone.utc)
    is_scheduled = body.scheduled_at is not None and body.scheduled_at > now

    snapshot = json.dumps({
        "title": draft.title,
        "description": draft.description,
        "caption": draft.caption,
        "hashtags": body.hashtags[:30],
        "category_id": draft.category_id,
        "privacy": body.privacy,
        "made_for_kids": body.made_for_kids,
        "synthetic_content": body.synthetic_content,
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
    targets_out = []

    for acc in accounts:
        # Deterministic idempotency key per (asset, account, schedule_bucket)
        bucket = (body.scheduled_at.isoformat() if is_scheduled and body.scheduled_at else now.strftime("%Y%m%d%H%M"))
        raw_key = f"{asset.file_hash}:{acc.id}:{draft.id}:{bucket}"
        idempotency_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:48]

        existing = db.execute(
            select(PublicationTarget).where(PublicationTarget.idempotency_key == idempotency_key)
        ).scalars().first()
        if existing:
            targets_out.append({
                "target_id": existing.id,
                "platform": existing.platform,
                "account_name": acc.account_name,
                "status": existing.status,
                "deduplicated": True,
            })
            continue

        target = PublicationTarget(
            intent_id=intent.id,
            social_account_id=acc.id,
            platform=acc.platform,
            status=State.SCHEDULED.value if is_scheduled else State.QUEUED.value,
            idempotency_key=idempotency_key,
        )
        db.add(target)
        db.flush()

        if not is_scheduled:
            queue.enqueue(
                job_type="publish_target",
                payload={"target_id": target.id, "intent_id": intent.id},
            )

        targets_out.append({
            "target_id": target.id,
            "platform": acc.platform,
            "account_name": acc.account_name,
            "status": target.status,
            "deduplicated": False,
        })

    db.commit()
    return {
        "intent_id": intent.id,
        "status": intent.status,
        "scheduled_at": intent.scheduled_at.isoformat() if intent.scheduled_at else None,
        "targets": targets_out,
    }


@router.get("/progress/{intent_id}")
def get_publish_progress(
    intent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return user-friendly step-by-step publishing progress and verified platform links."""
    intent = db.execute(select(PublishingIntent).where(PublishingIntent.id == intent_id)).scalars().first()
    if not intent:
        raise HTTPException(status_code=404, detail="Publishing intent not found.")

    draft = db.execute(select(ContentDraft).where(ContentDraft.id == intent.draft_id)).scalars().first()
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)).scalars().first() if draft else None
    targets = db.execute(select(PublicationTarget).where(PublicationTarget.intent_id == intent.id)).scalars().all()

    accounts_map = {}
    for t in targets:
        acc = db.execute(select(SocialAccount).where(SocialAccount.id == t.social_account_id)).scalars().first()
        if acc:
            accounts_map[t.id] = acc.account_name

    yt_target = next((t for t in targets if t.platform == "youtube"), None)
    ig_target = next((t for t in targets if t.platform == "instagram"), None)

    def _target_step_status(t: Optional[PublicationTarget]) -> str:
        if not t:
            return "skipped"
        if t.status == State.PUBLISHED.value:
            return "complete"
        if t.status in (State.FAILED.value, State.RECONCILIATION_REQUIRED.value):
            return "failed"
        if t.status in (State.UPLOADING.value, State.PLATFORM_PROCESSING.value, State.PROCESSING.value):
            return "processing"
        return "pending"

    all_done = all(t.status in (State.PUBLISHED.value, State.FAILED.value, State.RECONCILIATION_REQUIRED.value) for t in targets)
    any_published = any(t.status == State.PUBLISHED.value for t in targets)
    any_failed = any(t.status in (State.FAILED.value, State.RECONCILIATION_REQUIRED.value) for t in targets)

    steps = [
        {"key": "source_validated", "label": "Validate source URL", "status": "complete"},
        {"key": "video_imported", "label": "Import video and original caption", "status": "complete"},
        {"key": "video_optimized", "label": "Optimize video format", "status": "complete"},
        {"key": "metadata_generated", "label": "Generate platform metadata", "status": "complete"},
        {"key": "accounts_verified", "label": "Check destination accounts", "status": "complete"},
    ]
    if yt_target:
        steps.append({"key": "youtube_upload", "label": "Upload to YouTube", "status": _target_step_status(yt_target)})
    if ig_target:
        steps.append({"key": "instagram_upload", "label": "Upload to Instagram", "status": _target_step_status(ig_target)})

    verify_status = "complete" if all_done and any_published else ("failed" if all_done and any_failed else "pending")
    steps.append({"key": "verify", "label": "Verify final publication", "status": verify_status})

    completed_steps = sum(1 for s in steps if s["status"] == "complete")
    percent = int(round((completed_steps / max(len(steps), 1)) * 100))

    if intent.status == State.SCHEDULED.value:
        summary_status = "scheduled"
    elif all_done and any_published and not any_failed:
        summary_status = "published"
    elif all_done and any_published and any_failed:
        summary_status = "partial_success"
    elif all_done and any_failed:
        summary_status = "failed"
    else:
        summary_status = "processing"

    return {
        "intent_id": intent.id,
        "status": summary_status,
        "percent": percent,
        "title": draft.title if draft else "Untitled Video",
        "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail" if asset else None,
        "steps": steps,
        "targets": [
            {
                "id": t.id,
                "platform": t.platform,
                "account_name": accounts_map.get(t.id, t.platform),
                "status": t.status,
                "platform_post_id": t.platform_post_id,
                "platform_url": t.platform_url,
                "error_message": t.error_message,
                "published_at": t.published_at.isoformat() if t.published_at else None,
            }
            for t in targets
        ],
    }
