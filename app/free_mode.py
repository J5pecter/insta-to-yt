"""Free mode (no AI, no cost): guess ASMR and write the YouTube text from the caption and hashtags.

It can't watch the video, so it relies on the words the creator used
(#asmr, soap, slime, tapping...). Used when ANTHROPIC_API_KEY is empty,
and as the backup when the AI step fails.
"""
from __future__ import annotations

import re

from .analyzer import VideoMeta
from .downloader import Downloaded

# Trigger name -> words that point to it. Hashtags count too ("#soapcutting").
TRIGGERS: dict[str, tuple[str, ...]] = {
    "soap cutting": ("soap", "soapcutting", "soap cutting", "soapasmr"),
    "kinetic sand": ("kinetic sand", "kineticsand", "sand cutting", "sandcutting"),
    "slime": ("slime", "slimes", "slimeasmr"),
    "tapping": ("tapping", "taps", "tappingasmr"),
    "scratching": ("scratching", "scratches"),
    "crinkling": ("crinkle", "crinkles", "crinkling"),
    "whispering": ("whisper", "whispers", "whispering"),
    "eating sounds": ("mukbang", "eatingsounds", "eating sounds", "eatingasmr"),
    "crunchy sounds": ("crunch", "crunchy", "crunching"),
    "cleaning": ("cleaning", "pressure washing", "pressurewashing", "deep clean", "restoration"),
    "foam": ("foam", "foamy"),
    "brushing": ("brushing", "brush sounds"),
    "rain sounds": ("rain sounds", "rainsounds"),
    "skincare": ("skincare", "makeup"),
}
CALM_WORDS = ("satisfying", "oddlysatisfying", "oddly satisfying", "relaxing", "tingles", "tingly", "sleep aid")


def _words(text: str) -> tuple[set[str], str]:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return set(tokens), f" {' '.join(tokens)} "


def _has(word: str, tokens: set[str], joined: str) -> bool:
    return f" {word} " in joined if " " in word else word in tokens


def _first_caption_line(caption: str) -> str:
    for line in caption.splitlines():
        words = [w for w in line.split() if not w.startswith(("#", "@", "http"))]
        text = " ".join(words).strip(" -|•·:")
        if text:
            return text
    return ""


def _caption_without_hashtags(caption: str) -> str:
    lines = [" ".join(w for w in ln.split() if not w.startswith("#")) for ln in caption.splitlines()]
    return "\n".join(ln for ln in lines if ln.strip()).strip()


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def guess_metadata(dl: Downloaded) -> VideoMeta:
    text = f"{dl.caption} {' '.join(dl.hashtags)}"
    tokens, joined = _words(text)

    triggers = [name for name, words in TRIGGERS.items() if any(_has(w, tokens, joined) for w in words)]
    says_asmr = any("asmr" in t for t in tokens)
    calm = any(_has(w, tokens, joined) for w in CALM_WORDS)

    if says_asmr:
        is_asmr, confidence = True, "high"
    elif triggers or calm:
        is_asmr, confidence = True, "medium"
    else:
        is_asmr, confidence = False, "low"

    main = triggers[0].title() if triggers else ""
    line = _first_caption_line(dl.caption)
    if line:
        if is_asmr:
            title = line if "asmr" in line.lower() else f"ASMR {main} | {line}".replace("ASMR  |", "ASMR |")
        else:
            title = line
    else:
        title = f"{main} ASMR - Relaxing Sounds" if main else "Relaxing ASMR Sounds"

    caption = _caption_without_hashtags(dl.caption)
    sentence = (f"Relax with {_join(triggers)} in this ASMR video. Best with headphones."
                if triggers else "A relaxing ASMR video. Best with headphones.")
    if is_asmr or not caption:
        description = f"{caption}\n\n{sentence}" if caption else sentence
        tags = ["asmr", *triggers, "satisfying", "relaxing", *(h.lstrip("#") for h in dl.hashtags)]
    else:
        description = caption
        tags = [*(h.lstrip("#") for h in dl.hashtags)]

    if triggers:
        summary = f"Identified triggers: {_join(triggers)}."
    elif is_asmr:
        summary = "Detected as ASMR/satisfying content."
    else:
        summary = "Standard video content."

    return VideoMeta(
        title=title,
        description=description,
        tags=tags,
        hashtags=["#" + t.replace(" ", "") for t in triggers[:3]],
        is_asmr=is_asmr,
        confidence=confidence,
        triggers=triggers,
        summary=summary,
    )
