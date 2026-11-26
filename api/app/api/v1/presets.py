"""Saved publishing presets (profiles) endpoints for SocialRelay V2."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select, update
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.database import get_db
from ...models.entities import PublishingPreset, User

router = APIRouter(prefix="/presets", tags=["Publishing Presets"])


class PresetPayload(BaseModel):
    name: str
    youtube_account_id: Optional[int] = None
    instagram_account_id: Optional[int] = None
    title_mode: str = "mode_a"
    preserve_caption: bool = True
    description_mode: str = "full_with_attribution"
    hashtag_handling: str = "preserve_and_limit"
    video_profile: str = "vertical_blur_1080x1920"
    source_attribution: bool = True
    youtube_category: str = "24"
    visibility: str = "private"
    made_for_kids: bool = False
    synthetic_content: bool = False
    duplicate_detection: bool = True
    schedule_preference: str = "immediate"
    retry_policy: str = "exponential_backoff"
    rights_confirmation_required: bool = True
    is_default: bool = False


def _serialize_preset(p: PublishingPreset) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "youtube_account_id": p.youtube_account_id,
        "instagram_account_id": p.instagram_account_id,
        "title_mode": p.title_mode,
        "preserve_caption": p.preserve_caption,
        "description_mode": p.description_mode,
        "hashtag_handling": p.hashtag_handling,
        "video_profile": p.video_profile,
        "source_attribution": p.source_attribution,
        "youtube_category": p.youtube_category,
        "visibility": p.visibility,
        "made_for_kids": p.made_for_kids,
        "synthetic_content": p.synthetic_content,
        "duplicate_detection": p.duplicate_detection,
        "schedule_preference": p.schedule_preference,
        "retry_policy": p.retry_policy,
        "rights_confirmation_required": p.rights_confirmation_required,
        "is_default": p.is_default,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
def list_presets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all saved publishing presets."""
    presets = db.execute(
        select(PublishingPreset).order_by(desc(PublishingPreset.is_default), desc(PublishingPreset.updated_at))
    ).scalars().all()
    return {"items": [_serialize_preset(p) for p in presets]}


@router.post("")
def create_preset(
    body: PresetPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new publishing preset."""
    if body.is_default:
        db.execute(update(PublishingPreset).values(is_default=False))

    preset = PublishingPreset(
        user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return _serialize_preset(preset)


@router.patch("/{id}")
def update_preset(
    id: int,
    body: PresetPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing publishing preset."""
    preset = db.execute(select(PublishingPreset).where(PublishingPreset.id == id)).scalars().first()
    if not preset:
        raise HTTPException(status_code=404, detail="Publishing preset not found.")

    if body.is_default:
        db.execute(update(PublishingPreset).where(PublishingPreset.id != id).values(is_default=False))

    for k, v in body.model_dump().items():
        setattr(preset, k, v)
    db.commit()
    db.refresh(preset)
    return _serialize_preset(preset)


@router.delete("/{id}")
def delete_preset(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a non-default publishing preset."""
    preset = db.execute(select(PublishingPreset).where(PublishingPreset.id == id)).scalars().first()
    if not preset:
        raise HTTPException(status_code=404, detail="Publishing preset not found.")
    if preset.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the active default preset.")
    db.delete(preset)
    db.commit()
    return {"status": "success"}
