"""Check Instagram links and turn them into one standard form.

Only real Instagram post/reel links are accepted. We never pass the pasted
text straight to the downloader - we rebuild a clean URL from the post code.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com"}
# /reel/CODE/, /reels/CODE/, /p/CODE/, /tv/CODE/ and the newer /username/reel/CODE/
_PATH = re.compile(r"^/(?:[A-Za-z0-9._]{1,30}/)?(reel|reels|p|tv)/([A-Za-z0-9_-]{5,64})/?$")


class InvalidLink(ValueError):
    pass


@dataclass(frozen=True)
class InstagramLink:
    shortcode: str
    url: str  # clean URL that is safe to download


def parse_instagram_link(raw: str) -> InstagramLink:
    text = (raw or "").strip()
    if not text:
        raise InvalidLink("Empty link.")
    if "://" not in text:
        text = "https://" + text
    try:
        parts = urlsplit(text)
    except ValueError as exc:
        raise InvalidLink("That doesn't look like a link.") from exc

    if parts.scheme.lower() not in ("http", "https"):
        raise InvalidLink("Only http/https links are allowed.")
    host = (parts.hostname or "").lower()
    if host not in _HOSTS or parts.username or parts.password or parts.port:
        raise InvalidLink("Not an Instagram link.")

    match = _PATH.match(parts.path)
    if not match:
        raise InvalidLink("Not a link to an Instagram post or reel.")
    kind, code = match.groups()
    kind = "reel" if kind == "reels" else kind
    return InstagramLink(shortcode=code, url=f"https://www.instagram.com/{kind}/{code}/")


_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_youtube_id(raw: str) -> str:
    """Accepts a YouTube video ID or a youtube.com / youtu.be link and returns the 11-character ID."""
    text = (raw or "").strip()
    if _YT_ID.match(text):
        return text
    if "://" not in text:
        text = "https://" + text
    parts = urlsplit(text)
    host = (parts.hostname or "").lower()
    candidate = ""
    if host == "youtu.be":
        candidate = parts.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "www.youtube.com", "m.youtube.com", "studio.youtube.com"):
        segments = [s for s in parts.path.split("/") if s]
        if segments[:1] == ["watch"]:
            candidate = parse_qs(parts.query).get("v", [""])[0]
        elif len(segments) >= 2 and segments[0] in ("shorts", "video", "embed", "live"):
            candidate = segments[1]
    if not _YT_ID.match(candidate):
        raise InvalidLink("That is not a YouTube video link.")
    return candidate
