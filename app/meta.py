"""Make titles, descriptions and tags safe for YouTube's rules."""
from __future__ import annotations

import re

TITLE_MAX = 100          # YouTube limit (characters)
DESCRIPTION_MAX = 5000   # YouTube limit (bytes)
TAGS_MAX_TOTAL = 500     # YouTube limit (characters, all tags together)

_ANGLE = re.compile(r"[<>]")
_SPACES = re.compile(r"[ \t]+")


def clean_title(text: str, fallback: str = "Relaxing ASMR") -> str:
    t = _ANGLE.sub("", text or "")
    t = " ".join(t.split())
    if len(t) > TITLE_MAX:
        cut = t[:TITLE_MAX]
        t = cut.rsplit(" ", 1)[0] if " " in cut[60:] else cut
    return t.strip() or fallback


def clean_description(text: str) -> str:
    d = _ANGLE.sub("", text or "").replace("\r\n", "\n")
    d = "\n".join(_SPACES.sub(" ", line).rstrip() for line in d.split("\n")).strip()
    data = d.encode("utf-8")
    if len(data) > DESCRIPTION_MAX:
        d = data[:DESCRIPTION_MAX].decode("utf-8", errors="ignore").rstrip()
    return d


def clean_tags(tags: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    total = 0
    for raw in tags or []:
        tag = " ".join(_ANGLE.sub("", str(raw)).replace(",", " ").lstrip("#").split())
        if not tag or len(tag) > 100 or tag.lower() in seen:
            continue
        cost = len(tag) + (2 if " " in tag else 0) + (1 if out else 0)  # quotes + comma
        if total + cost > TAGS_MAX_TOTAL:
            break
        out.append(tag)
        seen.add(tag.lower())
        total += cost
    return out


def build_description(body: str, hashtags: list[str], footer: str, source_url: str | None,
                      uploader: str | None, shorts: bool) -> str:
    tags = []
    for h in hashtags + (["#shorts"] if shorts else []):
        h = "#" + "".join(ch for ch in h.lstrip("#") if ch.isalnum() or ch == "_")
        if len(h) > 1 and h.lower() not in (t.lower() for t in tags):
            tags.append(h)
    parts = [body.strip()]
    if tags:
        parts.append(" ".join(tags[:15]))
    if source_url:
        credit = f"Original: {source_url}"
        if uploader:
            credit += f" (by @{uploader.lstrip('@')})"
        parts.append(credit)
    if footer:
        parts.append(footer.strip())
    return clean_description("\n\n".join(p for p in parts if p))
