"""Source import endpoints for SocialRelay."""
from __future__ import annotations

import io
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.database import get_db
from ...models.entities import ContentDraft, MediaAsset, SourceMedia, User
from ...schemas.schemas import BulkImportRequest, ImportUrlRequest
from ...services.imports.service import DuplicateMediaError, ImportService, ImportValidationError

router = APIRouter(prefix="/imports", tags=["Imports"])


@router.post("/url")
def import_url(
    body: ImportUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import an authorized Instagram Reel or video post from URL."""
    service = ImportService(db)
    try:
        res = service.import_from_url(
            raw_url=body.url,
            user_id=current_user.id,
            rights_confirmed=body.rights_confirmed,
        )
        return res
    except ImportValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Import failed: {e}. If the video is restricted, please upload the file manually.",
        )


@router.post("/file")
async def import_file(
    file: UploadFile = File(...),
    caption: str = Form(default=""),
    uploader: str = Form(default=""),
    rights_confirmed: bool = Form(default=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a creator-authorized MP4 or MOV video file directly."""
    service = ImportService(db)
    content = await file.read()
    stream = io.BytesIO(content)

    try:
        res = service.import_from_upload(
            file_stream=stream,
            filename=file.filename or "uploaded_video.mp4",
            caption=caption,
            uploader=uploader,
            user_id=current_user.id,
            rights_confirmed=rights_confirmed,
        )
        return res
    except ImportValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File import failed: {e}")


@router.post("/bulk")
def import_bulk(
    body: BulkImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parse batch text or CSV links and import each authorized media item."""
    service = ImportService(db)
    links = service.parse_batch_links(body.links)
    if not links:
        raise HTTPException(status_code=400, detail="No valid Instagram links found in input.")

    results = []
    for link in links:
        try:
            r = service.import_from_url(link, user_id=current_user.id, rights_confirmed=body.rights_confirmed)
            results.append({"url": link, "status": "success", "data": r})
        except Exception as e:
            results.append({"url": link, "status": "failed", "error": str(e)})

    return {"total": len(links), "results": results}


@router.get("/{id}")
def get_import_status(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve import details for a specific SourceMedia record."""
    source = db.execute(select(SourceMedia).where(SourceMedia.id == id)).scalars().first()
    if not source:
        raise HTTPException(status_code=404, detail="Import record not found.")

    asset = db.execute(select(MediaAsset).where(MediaAsset.source_media_id == source.id)).scalars().first()
    draft = db.execute(select(ContentDraft).where(ContentDraft.media_asset_id == asset.id)).scalars().first() if asset else None

    return {
        "id": source.id,
        "provider": source.provider,
        "source_url": source.source_url,
        "external_media_id": source.external_media_id,
        "source_account": source.source_account,
        "original_caption": source.original_caption,
        "media_asset_id": asset.id if asset else None,
        "draft_id": draft.id if draft else None,
        "created_at": source.created_at.isoformat(),
    }
