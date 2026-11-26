"""Content drafts and metadata preparation endpoints for SocialRelay."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.database import get_db
from ...models.entities import ContentDraft, MediaAsset, SourceMedia, User
from ...schemas.schemas import DraftUpdateRequest, MetadataConvertRequest
from ...services.metadata.engine import metadata_engine

router = APIRouter(prefix="/drafts", tags=["Drafts"])


@router.get("")
def list_drafts(
    approval_status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all content drafts."""
    stmt = select(ContentDraft).order_by(desc(ContentDraft.updated_at))
    if approval_status:
        stmt = stmt.where(ContentDraft.approval_status == approval_status)

    drafts = db.execute(stmt).scalars().all()
    results = []
    for d in drafts:
        asset = db.execute(select(MediaAsset).where(MediaAsset.id == d.media_asset_id)).scalars().first()
        results.append({
            "id": d.id,
            "media_asset_id": d.media_asset_id,
            "title": d.title,
            "caption": d.caption,
            "approval_status": d.approval_status,
            "duration": asset.duration if asset else None,
            "is_vertical": asset.is_vertical if asset else True,
            "thumbnail_url": f"/api/v1/media/{d.media_asset_id}/thumbnail" if asset else None,
            "updated_at": d.updated_at.isoformat(),
        })

    return {"total": len(results), "items": results}


@router.get("/{id}")
def get_draft(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve full details for a draft including original source media."""
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    asset = db.execute(select(MediaAsset).where(MediaAsset.id == draft.media_asset_id)).scalars().first()
    source = db.execute(select(SourceMedia).where(SourceMedia.id == asset.source_media_id)).scalars().first() if asset else None

    tags = []
    if draft.hashtags:
        try:
            tags = json.loads(draft.hashtags)
        except Exception:
            tags = draft.hashtags.split()

    return {
        "id": draft.id,
        "media_asset_id": draft.media_asset_id,
        "title": draft.title,
        "description": draft.description,
        "caption": draft.caption,
        "hashtags": tags,
        "category_id": draft.category_id,
        "language": draft.language,
        "approval_status": draft.approval_status,
        "metadata_version": draft.metadata_version,
        "source": {
            "url": source.source_url if source else None,
            "account": source.source_account if source else None,
            "original_caption": source.original_caption if source else None,
            "attribution": source.source_attribution if source else None,
        },
        "media": {
            "duration": asset.duration if asset else None,
            "width": asset.width if asset else None,
            "height": asset.height if asset else None,
            "is_vertical": asset.is_vertical if asset else True,
            "stream_url": f"/api/v1/media/{draft.media_asset_id}/stream" if asset else None,
            "thumbnail_url": f"/api/v1/media/{draft.media_asset_id}/thumbnail" if asset else None,
        },
        "created_at": draft.created_at.isoformat(),
        "updated_at": draft.updated_at.isoformat(),
    }


@router.patch("/{id}")
def update_draft(
    id: int,
    body: DraftUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update title, description, caption, and hashtags for a draft."""
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    if body.title is not None:
        draft.title = metadata_engine.clean_title_for_youtube(body.title)
    if body.description is not None:
        draft.description = metadata_engine.validate_youtube_description_bytes(body.description)
    if body.caption is not None:
        draft.caption = body.caption[:2200]
    if body.hashtags is not None:
        draft.hashtags = json.dumps(body.hashtags)
    if body.category_id is not None:
        draft.category_id = body.category_id
    if body.language is not None:
        draft.language = body.language

    draft.metadata_version += 1
    db.commit()
    db.refresh(draft)

    return {"status": "success", "message": "Draft updated.", "draft_id": draft.id}


@router.post("/{id}/approve")
def approve_draft(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mark draft as approved and ready for publishing."""
    draft = db.execute(select(ContentDraft).where(ContentDraft.id == id)).scalars().first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    draft.approval_status = "approved"
    db.commit()
    return {"status": "success", "approval_status": "approved"}


@router.post("/convert-metadata")
def convert_metadata_interactive(body: MetadataConvertRequest):
    """Interactive metadata conversion engine supporting all modes (first-sentence, cleanup, exact, local AI)."""
    return metadata_engine.convert_metadata(
        original_caption=body.caption,
        mode=body.mode,
        attribution_credit=body.attribution or "",
        default_tags=body.default_tags,
    )


@router.get("/ai-status")
def get_ai_status():
    """Check availability of local Ollama model and fallback status."""
    return metadata_engine.check_ollama_status()
