"""Media assets and video processing endpoints for SocialRelay."""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.database import get_db
from ...models.entities import MediaAsset, MediaVariant, SourceMedia, User
from ...schemas.schemas import MediaProcessRequest, ThumbnailExtractRequest
from ...security.crypto import create_signed_state, verify_signed_state
from ...services.media.processor import video_processor
from ...services.storage.manager import storage_manager

router = APIRouter(prefix="/media", tags=["Media"])


@router.get("")
def list_media(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, le=100),
    vertical_only: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List imported media assets with thumbnail and duration information."""
    stmt = select(MediaAsset).order_by(desc(MediaAsset.created_at))
    if vertical_only is not None:
        stmt = stmt.where(MediaAsset.is_vertical == vertical_only)

    offset = (page - 1) * limit
    total = len(db.execute(stmt).scalars().all())
    items = db.execute(stmt.offset(offset).limit(limit)).scalars().all()

    results = []
    for m in items:
        source = db.execute(select(SourceMedia).where(SourceMedia.id == m.source_media_id)).scalars().first()
        results.append({
            "id": m.id,
            "source_id": m.source_media_id,
            "provider": source.provider if source else "unknown",
            "source_url": source.source_url if source else None,
            "source_account": source.source_account if source else None,
            "original_caption": source.original_caption if source else None,
            "duration": m.duration,
            "width": m.width,
            "height": m.height,
            "fps": m.fps,
            "file_size": m.file_size,
            "is_vertical": m.is_vertical,
            "has_thumbnail": bool(m.thumbnail_path and Path(m.thumbnail_path).exists()),
            "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail",
            "stream_url": f"/api/v1/media/{m.id}/stream",
            "created_at": m.created_at.isoformat(),
        })

    return {"total": total, "page": page, "limit": limit, "items": results}


@router.get("/{id}")
def get_media_details(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retrieve complete metadata and stream probe details for a media asset."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found.")

    source = db.execute(select(SourceMedia).where(SourceMedia.id == asset.source_media_id)).scalars().first()
    variants = db.execute(select(MediaVariant).where(MediaVariant.media_asset_id == asset.id)).scalars().all()

    return {
        "id": asset.id,
        "source": {
            "id": source.id if source else None,
            "provider": source.provider if source else None,
            "url": source.source_url if source else None,
            "account": source.source_account if source else None,
            "caption": source.original_caption if source else None,
            "attribution": source.source_attribution if source else None,
        },
        "technical": {
            "duration": asset.duration,
            "width": asset.width,
            "height": asset.height,
            "fps": asset.fps,
            "file_size": asset.file_size,
            "video_codec": asset.video_codec,
            "audio_codec": asset.audio_codec,
            "bitrate": asset.bitrate,
            "is_vertical": asset.is_vertical,
        },
        "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail",
        "stream_url": f"/api/v1/media/{asset.id}/stream",
        "variants": [
            {
                "id": v.id,
                "profile": v.output_profile,
                "width": v.width,
                "height": v.height,
                "file_size": v.file_size,
            }
            for v in variants
        ],
        "created_at": asset.created_at.isoformat(),
    }


@router.get("/{id}/stream")
def stream_media(id: int, request: Request, db: Session = Depends(get_db)):
    """Stream video file with support for HTTP Range headers for fast seeking in HTML5 players."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset or not Path(asset.storage_path).exists():
        raise HTTPException(status_code=404, detail="Video file not found.")

    path = Path(asset.storage_path)
    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    content_type, _ = mimetypes.guess_type(str(path))
    content_type = content_type or "video/mp4"

    if range_header:
        byte_range = range_header.strip().replace("bytes=", "")
        parts = byte_range.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        chunk_size = (end - start) + 1

        def iter_chunk():
            with open(path, "rb") as f:
                f.seek(start)
                bytes_left = chunk_size
                while bytes_left > 0:
                    read_size = min(65536, bytes_left)
                    data = f.read(read_size)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": content_type,
        }
        return StreamingResponse(iter_chunk(), status_code=206, headers=headers)

    return FileResponse(path, media_type=content_type, filename=path.name)


@router.get("/{id}/thumbnail")
def get_thumbnail(id: int, db: Session = Depends(get_db)):
    """Return thumbnail image for a video asset."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset or not asset.thumbnail_path or not Path(asset.thumbnail_path).exists():
        # Fallback to default SVG or 404
        raise HTTPException(status_code=404, detail="Thumbnail not found.")

    return FileResponse(Path(asset.thumbnail_path), media_type="image/jpeg")


@router.post("/{id}/process")
def process_media_variant(
    id: int,
    body: MediaProcessRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-encode, trim, mute, or crop video into a 1080x1920 vertical format variant."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset or not Path(asset.storage_path).exists():
        raise HTTPException(status_code=404, detail="Media asset not found.")

    in_path = Path(asset.storage_path)
    out_path = storage_manager.allocate_path("processed", extension="mp4")

    try:
        video_processor.optimize_video(
            input_path=in_path,
            output_path=out_path,
            profile=body.profile,
            crop_mode=body.crop_mode,
            trim_start=body.trim_start,
            trim_end=body.trim_end,
            mute=body.mute,
        )

        probe = video_processor.probe_video(out_path)
        file_hash = storage_manager.calculate_sha256(out_path)

        variant = MediaVariant(
            media_asset_id=asset.id,
            output_profile=f"{body.profile}_{body.crop_mode}",
            storage_path=str(out_path),
            file_hash=file_hash,
            codec=probe.get("video_codec", "h264"),
            width=probe.get("width", 1080),
            height=probe.get("height", 1920),
            duration=probe.get("duration"),
            file_size=out_path.stat().st_size,
        )
        db.add(variant)
        db.commit()
        db.refresh(variant)

        return {
            "status": "success",
            "variant_id": variant.id,
            "profile": variant.output_profile,
            "width": variant.width,
            "height": variant.height,
            "duration": variant.duration,
            "file_size": variant.file_size,
        }
    except Exception as e:
        out_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")


@router.post("/{id}/thumbnail")
def generate_custom_thumbnail(
    id: int,
    body: ThumbnailExtractRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract a new thumbnail frame at a specific timestamp."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset or not Path(asset.storage_path).exists():
        raise HTTPException(status_code=404, detail="Media asset not found.")

    thumb_path = storage_manager.allocate_path("thumbnails", extension="jpg")
    try:
        video_processor.extract_single_thumbnail(
            video_path=Path(asset.storage_path),
            output_path=thumb_path,
            timestamp=body.timestamp,
            width=body.width,
        )
        asset.thumbnail_path = str(thumb_path)
        db.commit()
        return {"status": "success", "thumbnail_url": f"/api/v1/media/{asset.id}/thumbnail"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Thumbnail extraction failed: {e}")


@router.delete("/{id}")
def delete_media(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a media asset and remove associated files from disk."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Media asset not found.")

    # Remove files
    if asset.storage_path and Path(asset.storage_path).exists():
        Path(asset.storage_path).unlink(missing_ok=True)
    if asset.thumbnail_path and Path(asset.thumbnail_path).exists():
        Path(asset.thumbnail_path).unlink(missing_ok=True)

    db.delete(asset)
    db.commit()
    return {"status": "success", "message": "Media asset deleted."}


@router.get("/{id}/signed-url")
def get_signed_public_url(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate a narrowly scoped, short-lived signed URL for Meta Graph API ingestion."""
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset or not Path(asset.storage_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")
    token = create_signed_state(f"media_{id}")
    return {"url": f"/api/v1/media/public/{id}/download?token={token}", "expires_in_seconds": 900}


@router.get("/public/{id}/download")
def public_media_serving(id: int, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Narrowly scoped, short-lived signed media endpoint for Meta Graph API container ingestion."""
    verified_payload = verify_signed_state(token, max_age_seconds=900) if token else None
    if verified_payload != f"media_{id}":
        raise HTTPException(status_code=403, detail="Invalid or expired media access token.")
    asset = db.execute(select(MediaAsset).where(MediaAsset.id == id)).scalars().first()
    if not asset or not Path(asset.storage_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(Path(asset.storage_path), media_type="video/mp4", filename=f"video_{id}.mp4")
