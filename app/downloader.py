"""Download an Instagram video with yt-dlp."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yt_dlp

from .config import Settings
from .media import FFMPEG

MAX_FILE_BYTES = 1024 * 1024 * 1024  # 1 GB safety limit


class DownloadFailed(RuntimeError):
    pass


@dataclass
class Downloaded:
    path: Path
    caption: str = ""
    uploader: str = ""
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    hashtags: list[str] = field(default_factory=list)

    @property
    def is_vertical(self) -> bool:
        return bool(self.width and self.height and self.height > self.width)


class _QuietLogger:
    def debug(self, msg: str) -> None: ...
    def info(self, msg: str) -> None: ...
    def warning(self, msg: str) -> None: ...
    def error(self, msg: str) -> None: ...


def _hashtags(text: str) -> list[str]:
    return [w.rstrip(".,!?;:") for w in text.split() if w.startswith("#") and len(w) > 1]


def download_instagram(url: str, shortcode: str, settings: Settings) -> Downloaded:
    dest = settings.downloads_dir
    dest.mkdir(parents=True, exist_ok=True)
    opts: dict = {
        "outtmpl": str(dest / f"{shortcode}.%(ext)s"),
        "format": "bv*+ba/b",
        "merge_output_format": "mp4",
        "ffmpeg_location": FFMPEG,
        "playlist_items": "1",  # carousel posts: take the first video
        "max_filesize": MAX_FILE_BYTES,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "logger": _QuietLogger(),
        "retries": 3,
    }
    if settings.instagram_cookies_file:
        opts["cookiefile"] = str(settings.instagram_cookies_file)
    if settings.instagram_cookies_from_browser:
        opts["cookiesfrombrowser"] = (settings.instagram_cookies_from_browser,)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except yt_dlp.utils.DownloadError as exc:
        msg = str(exc)
        if any(k in msg.lower() for k in ("login", "rate-limit", "not available", "cookies")):
            msg = ("Instagram did not allow the download (it may need a login, or the post is "
                   "private/removed). See README > 'Instagram asks for login'.")
        raise DownloadFailed(msg) from exc

    if info and info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if e]
        if not entries:
            raise DownloadFailed("This post has no video in it.")
        info = entries[0]
    if not info:
        raise DownloadFailed("Instagram returned nothing for this link.")

    path: Path | None = None
    for item in info.get("requested_downloads") or []:
        if item.get("filepath"):
            path = Path(item["filepath"])
    if path is None or not path.exists():
        matches = sorted(dest.glob(f"{shortcode}.*"))
        path = matches[0] if matches else None
    if path is None or not path.exists():
        raise DownloadFailed("The download finished but the video file is missing (is it a photo post?).")

    caption = (info.get("description") or "").strip()
    return Downloaded(
        path=path,
        caption=caption,
        uploader=(info.get("channel") or "").strip(),  # Instagram @username
        duration=info.get("duration"),
        width=info.get("width"),
        height=info.get("height"),
        hashtags=_hashtags(caption),
    )
