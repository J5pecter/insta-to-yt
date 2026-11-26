"""Source import service for SocialRelay.
Handles Instagram URLs, authorized file uploads, deduplication, and batch CSV imports.
"""
from __future__ import annotations

import csv
import io
import logging
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import yt_dlp
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.config import settings
from ...models.entities import ContentDraft, MediaAsset, SourceMedia, User
from ...security.ssrf import SUPPORTED_INSTAGRAM_DOMAINS, SSRFValidationError, validate_url_safe
from ..media.processor import video_processor
from ..storage.manager import storage_manager

logger = logging.getLogger("socialrelay.imports")

# Valid Instagram shortcode regex: /reel/SHORTCODE, /reels/SHORTCODE, /p/SHORTCODE, /tv/SHORTCODE
_IG_PATH_RE = re.compile(r"^/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)/?", re.IGNORECASE)


class ImportValidationError(ValueError):
    pass


class DuplicateMediaError(Exception):
    def __init__(self, message: str, existing_media_id: int, shortcode: Optional[str] = None):
        super().__init__(message)
        self.existing_media_id = existing_media_id
        self.shortcode = shortcode


def normalize_instagram_url(raw_url: str) -> Tuple[str, str]:
    """Validate URL, protect against SSRF, extract shortcode and canonicalize link."""
    # 1. SSRF and scheme validation
    safe_url = validate_url_safe(raw_url, allowed_domains=SUPPORTED_INSTAGRAM_DOMAINS)
    parsed = urlparse(safe_url)

    # 2. Extract shortcode
    match = _IG_PATH_RE.match(parsed.path)
    if not match:
        raise ImportValidationError(
            f"URL path '{parsed.path}' is not a supported Instagram Reel or video post. "
            "Supported formats: https://www.instagram.com/reel/<shortcode>/"
        )

    shortcode = match.group(1)
    canonical_url = f"https://www.instagram.com/reel/{shortcode}/"
    return canonical_url, shortcode


def check_mp4_mov_magic_bytes(header: bytes) -> bool:
    """Validate that the file header corresponds to a real MP4 or QuickTime MOV container."""
    if len(header) < 12:
        return False
    # Check for 'ftyp' at offset 4
    if header[4:8] == b"ftyp":
        return True
    # QuickTime signature
    if header[4:8] in (b"moov", b"mdat", b"wide", b"skip"):
        return True
    return False


class ImportService:
    def __init__(self, db: Session):
        self.db = db

    def check_duplicate_url(self, canonical_url: str, shortcode: str) -> Optional[SourceMedia]:
        """Check if source media was previously imported."""
        stmt = select(SourceMedia).where(
            (SourceMedia.source_url == canonical_url) | (SourceMedia.external_media_id == shortcode)
        )
        return self.db.execute(stmt).scalars().first()

    def check_duplicate_hash(self, sha256_hash: str) -> Optional[MediaAsset]:
        """Check if a video with the identical SHA-256 fingerprint was already stored."""
        stmt = select(MediaAsset).where(MediaAsset.file_hash == sha256_hash)
        return self.db.execute(stmt).scalars().first()

    def import_from_url(
        self,
        raw_url: str,
        user_id: Optional[int] = None,
        rights_confirmed: bool = True,
    ) -> Dict[str, Any]:
        """Import an authorized Instagram Reel / video from URL."""
        if not rights_confirmed:
            raise ImportValidationError("You must confirm rights or authorization to process this media.")

        canonical_url, shortcode = normalize_instagram_url(raw_url)

        # Check existing source URL duplicate
        existing = self.check_duplicate_url(canonical_url, shortcode)
        if existing:
            asset = self.db.execute(select(MediaAsset).where(MediaAsset.source_media_id == existing.id)).scalars().first()
            return {
                "status": "duplicate",
                "message": "Media already imported under this URL.",
                "source_media_id": existing.id,
                "media_asset_id": asset.id if asset else None,
                "shortcode": shortcode,
                "is_duplicate": True,
            }

        # Download to temporary location using yt-dlp
        temp_dir = settings.temporary_dir / f"dl_{uuid.uuid4().hex[:8]}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        out_template = str(temp_dir / "%(id)s.%(ext)s")

        ydl_opts = {
            "outtmpl": out_template,
            "format": "best[ext=mp4]/best",
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "socket_timeout": 30,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(canonical_url, download=True)
                caption = info.get("description") or info.get("title") or ""
                uploader = info.get("uploader") or info.get("channel") or ""

            # Locate downloaded file
            downloaded_files = list(temp_dir.glob("*.mp4")) or list(temp_dir.glob("*.*"))
            if not downloaded_files:
                raise ImportValidationError(
                    "Automatic import is unavailable for this video. Upload an authorized copy and provide its original caption."
                )

            downloaded_file = downloaded_files[0]
            file_hash = storage_manager.calculate_sha256(downloaded_file)

            # Check duplicate hash
            existing_asset = self.check_duplicate_hash(file_hash)
            if existing_asset:
                shutil.rmtree(temp_dir, ignore_errors=True)
                return {
                    "status": "duplicate",
                    "message": "The exact same video file was already imported under another link.",
                    "media_asset_id": existing_asset.id,
                    "is_duplicate": True,
                }

            # Move to permanent storage
            asset_uuid = uuid.uuid4().hex
            permanent_video_path = storage_manager.allocate_path("originals", extension="mp4", file_id=asset_uuid)
            shutil.move(str(downloaded_file), str(permanent_video_path))

            # Probe media
            probe = video_processor.probe_video(permanent_video_path)

            # Extract thumbnail
            thumb_path = storage_manager.allocate_path("thumbnails", extension="jpg", file_id=asset_uuid)
            try:
                video_processor.extract_single_thumbnail(permanent_video_path, thumb_path, timestamp=1.0)
            except Exception as e:
                logger.warning(f"Failed to extract thumbnail: {e}")

            # Store in DB
            source = SourceMedia(
                user_id=user_id,
                provider="instagram",
                source_url=canonical_url,
                external_media_id=shortcode,
                source_account=uploader,
                original_caption=caption,
                source_attribution=f"Original: {canonical_url} (by @{uploader})" if uploader else canonical_url,
                rights_status="creator_authorized",
            )
            self.db.add(source)
            self.db.flush()

            asset = MediaAsset(
                source_media_id=source.id,
                storage_path=str(permanent_video_path),
                file_hash=file_hash,
                mime_type="video/mp4",
                duration=probe.get("duration"),
                width=probe.get("width"),
                height=probe.get("height"),
                fps=probe.get("fps"),
                file_size=permanent_video_path.stat().st_size,
                video_codec=probe.get("video_codec"),
                audio_codec=probe.get("audio_codec"),
                bitrate=probe.get("bitrate"),
                is_vertical=probe.get("is_vertical", True),
                thumbnail_path=str(thumb_path) if thumb_path.exists() else None,
                processing_status="ready",
            )
            self.db.add(asset)
            self.db.flush()

            # Create initial draft
            title = caption.split("\n")[0][:100] if caption else f"Reel {shortcode}"
            draft = ContentDraft(
                user_id=user_id or 1,
                media_asset_id=asset.id,
                title=title,
                description=caption,
                caption=caption,
                hashtags="[]",
                approval_status="draft",
            )
            self.db.add(draft)
            self.db.commit()

            return {
                "status": "success",
                "source_media_id": source.id,
                "media_asset_id": asset.id,
                "draft_id": draft.id,
                "shortcode": shortcode,
                "title": title,
                "caption": caption,
                "duration": probe.get("duration"),
                "is_vertical": probe.get("is_vertical"),
            }
        except yt_dlp.utils.DownloadError as e:
            logger.warning(f"yt-dlp download failed for {canonical_url}: {e}")
            raise ImportValidationError(
                "Automatic import is unavailable for this video. Upload an authorized copy and provide its original caption."
            )
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def import_from_upload(
        self,
        file_stream: io.BytesIO,
        filename: str,
        caption: str = "",
        uploader: str = "",
        user_id: Optional[int] = None,
        rights_confirmed: bool = True,
    ) -> Dict[str, Any]:
        """Import an authorized video uploaded directly as MP4/MOV."""
        if not rights_confirmed:
            raise ImportValidationError("You must confirm rights or authorization to process this media.")

        ext = Path(filename).suffix.lower().lstrip(".")
        if ext not in ("mp4", "mov", "m4v"):
            raise ImportValidationError(f"Unsupported file extension '.{ext}'. Supported formats are MP4 and MOV.")

        # Inspect header bytes
        header = file_stream.read(32)
        file_stream.seek(0)
        if not check_mp4_mov_magic_bytes(header):
            raise ImportValidationError("File signature validation failed. File is not a valid MP4 or MOV video.")

        # Save to permanent storage
        asset_uuid = uuid.uuid4().hex
        perm_path = storage_manager.allocate_path("originals", extension="mp4", file_id=asset_uuid)

        file_stream.seek(0)
        with open(perm_path, "wb") as f:
            shutil.copyfileobj(file_stream, f)

        file_size = perm_path.stat().st_size
        file_hash = storage_manager.calculate_sha256(perm_path)

        # Check duplicate
        existing_asset = self.check_duplicate_hash(file_hash)
        if existing_asset:
            perm_path.unlink(missing_ok=True)
            return {
                "status": "duplicate",
                "message": "The exact same video file was already uploaded previously.",
                "media_asset_id": existing_asset.id,
                "is_duplicate": True,
            }

        # Probe video
        probe = video_processor.probe_video(perm_path)

        # Extract thumbnail
        thumb_path = storage_manager.allocate_path("thumbnails", extension="jpg", file_id=asset_uuid)
        try:
            video_processor.extract_single_thumbnail(perm_path, thumb_path, timestamp=1.0)
        except Exception as e:
            logger.warning(f"Failed to extract thumbnail: {e}")

        # Store in DB
        source = SourceMedia(
            user_id=user_id,
            provider="direct_upload",
            source_url=None,
            external_media_id=f"upload_{asset_uuid[:8]}",
            source_account=uploader or "Authorized Creator",
            original_caption=caption,
            source_attribution=f"Authorized upload by {uploader}" if uploader else "Direct creator upload",
            rights_status="creator_authorized",
        )
        self.db.add(source)
        self.db.flush()

        asset = MediaAsset(
            source_media_id=source.id,
            storage_path=str(perm_path),
            file_hash=file_hash,
            mime_type="video/mp4",
            duration=probe.get("duration"),
            width=probe.get("width"),
            height=probe.get("height"),
            fps=probe.get("fps"),
            file_size=file_size,
            video_codec=probe.get("video_codec"),
            audio_codec=probe.get("audio_codec"),
            bitrate=probe.get("bitrate"),
            is_vertical=probe.get("is_vertical", True),
            thumbnail_path=str(thumb_path) if thumb_path.exists() else None,
            processing_status="ready",
        )
        self.db.add(asset)
        self.db.flush()

        title = caption.split("\n")[0][:100] if caption else Path(filename).stem[:100]
        draft = ContentDraft(
            user_id=user_id or 1,
            media_asset_id=asset.id,
            title=title,
            description=caption,
            caption=caption,
            hashtags="[]",
            approval_status="draft",
        )
        self.db.add(draft)
        self.db.commit()

        return {
            "status": "success",
            "source_media_id": source.id,
            "media_asset_id": asset.id,
            "draft_id": draft.id,
            "title": title,
            "caption": caption,
            "duration": probe.get("duration"),
            "is_vertical": probe.get("is_vertical"),
        }

    def parse_batch_links(self, text_or_csv: str) -> List[str]:
        """Parse raw text or CSV containing multiple Instagram links."""
        links = []
        for line in text_or_csv.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Handle comma separated or space separated
            tokens = re.split(r"[,\s]+", line)
            for token in tokens:
                token = token.strip().strip('"').strip("'")
                if "instagram.com" in token or "instagr.am" in token:
                    links.append(token)
        return links
