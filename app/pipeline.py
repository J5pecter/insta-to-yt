"""The background worker. One video at a time:

    download -> duplicate check -> AI check -> (review by admin, or) upload -> record result
"""
from __future__ import annotations

import logging
import queue
import shutil
import sqlite3
import threading
from pathlib import Path
from typing import Callable

from .analyzer import AnalysisFailed, VideoMeta, analyze_with_claude
from .config import Settings
from .db import IN_PROGRESS, Database, now_iso
from .downloader import Downloaded, download_instagram
from .free_mode import guess_metadata
from .local_ai import analyze_with_local_ai
from .media import MediaError, extract_frames, sha256_file
from .meta import build_description, clean_description, clean_tags, clean_title
from .youtube import YouTubeClient, YouTubeNotConnected

log = logging.getLogger("insta2yt")

EDITABLE_STATES = ("review", "failed", "interrupted")
SHORTS_MAX_SECONDS = 180


class ActionError(RuntimeError):
    """An admin action that can't be done right now (message is shown in the page)."""


class Pipeline:
    def __init__(self, settings: Settings, db: Database, youtube: YouTubeClient, *,
                 download: Callable[..., Downloaded] = download_instagram,
                 analyze: Callable[..., VideoMeta] | None = None,
                 frames: Callable[..., list[Path]] = extract_frames,
                 hasher: Callable[[Path], str] = sha256_file):
        self.settings = settings
        self.db = db
        self.youtube = youtube
        self._download = download
        self._analyze = analyze or (
            analyze_with_local_ai if settings.ai_provider == "local" else analyze_with_claude)
        self._frames = frames
        self._hash = hasher
        self._queue: queue.Queue[tuple[str, int] | None] = queue.Queue()
        self._thread: threading.Thread | None = None

    # ---------- worker thread ----------
    def start(self) -> None:
        for job in self.db.recover_after_restart():
            self._queue.put(job)
        self._thread = threading.Thread(target=self._loop, name="insta2yt-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._thread:
            self._queue.put(None)
            self._thread.join(timeout=5)

    def enqueue(self, action: str, video_id: int) -> None:
        self._queue.put((action, video_id))

    def _loop(self) -> None:
        while True:
            job = self._queue.get()
            if job is None:
                return
            self.run_job(*job)

    def run_job(self, action: str, video_id: int) -> None:
        try:
            if action == "process":
                self._process(video_id)
            elif action == "upload":
                self._upload(video_id)
        except Exception as exc:  # never let one bad video stop the worker
            log.exception("Video %s: unexpected error", video_id)
            row = self.db.get(video_id)
            if row and row["status"] == "uploading":
                # The upload may have reached YouTube - don't allow an automatic re-upload.
                self.db.update(video_id, status="interrupted",
                               error=f"Unexpected error during upload ({exc}). Check YouTube before retrying.")
            elif row:
                self.db.update(video_id, status="failed", error=f"Unexpected error: {exc}")

    # ---------- steps ----------
    def _process(self, video_id: int) -> None:
        row = self.db.get(video_id)
        if not row or not self.db.claim(video_id, ("queued",), "downloading", error=None, progress=0):
            return
        log.info("Video %s: downloading %s", video_id, row["source_url"])
        try:
            dl = self._download(row["source_url"], row["shortcode"], self.settings)
        except Exception as exc:
            self.db.update(video_id, status="failed", error=f"Download failed: {exc}")
            return

        sha = self._hash(dl.path)
        earlier = self.db.find_other_with_sha(sha, exclude_id=video_id)
        if earlier:
            self.db.update(video_id, status="duplicate", file_sha256=sha, duplicate_of=earlier["id"],
                           error=f"Same video file as #{earlier['id']} ({earlier['source_url']}). Skipped.")
            if earlier["file_path"] != str(dl.path):
                dl.path.unlink(missing_ok=True)
            log.info("Video %s: duplicate of #%s, skipped", video_id, earlier["id"])
            return

        self.db.update(video_id, status="analyzing", file_path=str(dl.path), file_sha256=sha,
                       ig_caption=dl.caption, ig_uploader=dl.uploader, duration=dl.duration)

        meta, ai_error = self._describe(video_id, dl)
        is_short = dl.is_vertical and (dl.duration or 0) <= SHORTS_MAX_SECONDS
        fields = dict(
            title=clean_title(meta.title),
            description=build_description(
                meta.description,
                hashtags=self.settings.default_hashtags + meta.hashtags,
                footer=self.settings.description_footer,
                source_url=row["source_url"] if self.settings.include_source_credit else None,
                uploader=dl.uploader if self.settings.include_source_credit else None,
                shorts=is_short,
            ),
            tags=clean_tags(meta.tags),
            is_asmr=meta.is_asmr,
            asmr_confidence=meta.confidence,
            asmr_triggers=meta.triggers,
            ai_summary=meta.summary,
        )

        reasons = []
        if not row["auto_upload"]:
            reasons.append("Auto-upload was off - check and press Upload.")
        if ai_error:
            reasons.append(f"AI step failed ({ai_error}) - the text was guessed from the caption instead.")
        if self.settings.hold_non_asmr and meta.is_asmr is False:
            if self.settings.ai_enabled and not ai_error:
                reasons.append("The AI thinks this is NOT an ASMR video.")
            else:
                reasons.append("No ASMR words in the caption or hashtags (free mode can't watch the video).")
        if not self.youtube.connected:
            reasons.append("YouTube is not connected yet.")

        if reasons:
            self.db.update(video_id, status="review", error=" ".join(reasons), **fields)
            log.info("Video %s: waiting for review", video_id)
            return
        self.db.update(video_id, status="upload_queued", error=None, **fields)
        self._upload(video_id)

    def _describe(self, video_id: int, dl: Downloaded) -> tuple[VideoMeta, str | None]:
        work = self.settings.downloads_dir / f"frames_{video_id}"
        try:
            if self.settings.ai_provider == "local":
                frames = self._frames(dl.path, work, dl.duration, count=4, width=384)  # small = fast
            else:
                frames = self._frames(dl.path, work, dl.duration)
            thumb = frames[len(frames) // 2]
            self.settings.thumbs_dir.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(thumb, self.settings.thumbs_dir / f"{video_id}.jpg")
            if not self.settings.ai_enabled:
                return guess_metadata(dl), None
            log.info("Video %s: asking the %s AI", video_id, self.settings.ai_provider)
            return self._analyze(frames, dl, self.settings), None
        except MediaError as exc:
            # Free mode doesn't need the pictures, so a frame problem isn't an error there.
            return guess_metadata(dl), (str(exc) if self.settings.ai_enabled else None)
        except AnalysisFailed as exc:
            return guess_metadata(dl), str(exc)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _upload(self, video_id: int) -> None:
        if not self.db.claim(video_id, ("upload_queued",), "uploading", progress=0, error=None):
            return
        row = self.db.get(video_id)
        assert row is not None
        path = Path(row["file_path"]) if row["file_path"] else None
        if not path or not path.exists():
            self.db.update(video_id, status="failed", file_path=None, title=None,
                           error="The downloaded file is gone. Press Retry to download it again.")
            return

        log.info("Video %s: uploading to YouTube", video_id)
        channel_id = row.get("channel_id")
        try:
            upload_fn = self.youtube.upload
            code = getattr(upload_fn, "__code__", None)
            if code and "channel_id" in code.co_varnames:
                youtube_id = upload_fn(
                    path, row["title"] or "Instagram Video", row["description"] or "", row["tags"],
                    row["privacy"], channel_id=channel_id,
                    progress=lambda p: self.db.update(video_id, progress=p),
                )
            else:
                youtube_id = upload_fn(
                    path, row["title"] or "Instagram Video", row["description"] or "", row["tags"],
                    row["privacy"], progress=lambda p: self.db.update(video_id, progress=p),
                )
        except YouTubeNotConnected as exc:
            self.db.update(video_id, status="review", error=str(exc))
            return
        except Exception as exc:
            self.db.update(video_id, status="failed", error=f"Upload failed: {exc}")
            return

        self.db.update(video_id, status="uploaded", youtube_id=youtube_id, uploaded_at=now_iso(),
                       progress=100, error=None)
        log.info("Video %s: uploaded as https://youtu.be/%s", video_id, youtube_id)
        if not self.settings.keep_downloads:
            path.unlink(missing_ok=True)
            self.db.update(video_id, file_path=None)

    # ---------- admin actions (called from the web page) ----------
    def save_edits(self, video_id: int, title: str | None = None, description: str | None = None,
                   tags: list[str] | None = None, privacy: str | None = None,
                   channel_id: str | None = None, channel_title: str | None = None) -> None:
        row = self.db.get(video_id)
        if not row:
            raise ActionError("Video not found.")
        if row["status"] not in EDITABLE_STATES:
            raise ActionError("This video can't be edited right now.")
        fields: dict = {}
        if title is not None:
            fields["title"] = clean_title(title)
        if description is not None:
            fields["description"] = clean_description(description)
        if tags is not None:
            fields["tags"] = clean_tags(tags)
        if privacy is not None:
            fields["privacy"] = privacy
        if channel_id is not None:
            fields["channel_id"] = channel_id
        if channel_title is not None:
            fields["channel_title"] = channel_title
        if fields:
            self.db.update(video_id, **fields)

    def approve(self, video_id: int) -> None:
        row = self.db.get(video_id)
        if not row:
            raise ActionError("Video not found.")
        if not row["file_path"] or not Path(row["file_path"]).exists() or not row["title"]:
            raise ActionError("The video file is missing. Press Retry to download it again.")
        if not self.youtube.connected:
            raise ActionError("Connect YouTube first.")
        if not self.db.claim(video_id, EDITABLE_STATES, "upload_queued", error=None):
            raise ActionError("This video is already being uploaded (or was uploaded).")
        self.enqueue("upload", video_id)

    def retry(self, video_id: int) -> str:
        row = self.db.get(video_id)
        if not row:
            raise ActionError("Video not found.")
        has_file = bool(row["file_path"] and Path(row["file_path"]).exists() and row["title"])
        if has_file and self.youtube.connected:
            if not self.db.claim(video_id, ("failed", "interrupted"), "upload_queued", error=None):
                raise ActionError("Only failed videos can be retried.")
            self.enqueue("upload", video_id)
            return "upload"
        if not self.db.claim(video_id, ("failed", "interrupted"), "queued", error=None, progress=0):
            raise ActionError("Only failed videos can be retried.")
        self.enqueue("process", video_id)
        return "process"

    def mark_uploaded(self, video_id: int, youtube_id: str) -> None:
        try:
            ok = self.db.claim(video_id, EDITABLE_STATES, "uploaded", youtube_id=youtube_id,
                               uploaded_at=now_iso(), error=None, progress=100)
        except sqlite3.IntegrityError:
            raise ActionError("That YouTube video is already linked to another record.") from None
        if not ok:
            raise ActionError("Only videos that are waiting, failed or interrupted can be marked as done.")

    def delete(self, video_id: int) -> None:
        row = self.db.get(video_id)
        if not row:
            return
        if row["status"] in IN_PROGRESS:
            raise ActionError("Wait until this video has finished processing.")
        if row["status"] == "uploaded":
            raise ActionError("Uploaded videos stay in the record so they are never uploaded twice.")
        if row["file_path"]:
            Path(row["file_path"]).unlink(missing_ok=True)
        (self.settings.thumbs_dir / f"{video_id}.jpg").unlink(missing_ok=True)
        self.db.delete(video_id)
