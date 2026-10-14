"""Free local AI: a small vision model running on this PC through Ollama (https://ollama.com).

Same job as the Claude step - is it ASMR, which triggers, title, description, tags -
but free and offline. It's slower and a bit less accurate, so the caption keywords
from free mode are used to fill any gaps.
"""
from __future__ import annotations

import base64
import json
import socket
import urllib.error
import urllib.request
from pathlib import Path

from .analyzer import SCHEMA, SYSTEM_PROMPT, AnalysisFailed, VideoMeta, context_text, meta_from_json
from .config import Settings
from .downloader import Downloaded
from .free_mode import guess_metadata
from .media import MediaError, make_contact_sheet

TIMEOUT_SECONDS = 600  # a small graphics card can take a few minutes
CONTEXT_TOKENS = 3072  # smaller = more of the model fits on a 4 GB graphics card
GRID_NOTE = ("The picture shows 4 moments of the video in a 2x2 grid, in time order: "
             "top-left, top-right, bottom-left, bottom-right.")
# Small models judge better when they describe the picture first and decide afterwards.
# Ollama fills the JSON fields in this order, so "seen" comes before "is_asmr".
LOCAL_RULES = (
    "First, in 'seen', describe only what is actually visible in the 4 pictures - objects, hands, "
    "materials, actions. Do not use the caption for 'seen', and do not guess. "
    "Then decide 'is_asmr' mainly from what you saw: it is ASMR only if the pictures show a close-up, "
    "slow, satisfying action (cutting, tapping, squishing, cleaning, crunching...). Talking to the camera, "
    "travel, vlogs, memes, text slides, screenshots and test patterns are NOT ASMR. If unsure, say false. "
    "Never describe objects in the title or description that you did not see."
)
LOCAL_SCHEMA = {
    **SCHEMA,
    "properties": {"seen": {"type": "string"}, **SCHEMA["properties"]},
    "required": ["seen", *SCHEMA["required"]],
}


def _full_name(model: str) -> str:
    return model if ":" in model else f"{model}:latest"


def _request(settings: Settings, path: str, payload: dict | None, timeout: float) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(settings.ollama_url + path, data=data,
                                 headers={"Content-Type": "application/json"},
                                 method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check_ready(settings: Settings) -> tuple[bool, str]:
    """Is Ollama running and is the model downloaded? Returns (ready, message for the admin)."""
    try:
        tags = _request(settings, "/api/tags", None, timeout=3)
    except (urllib.error.URLError, socket.timeout, OSError):
        return False, "Ollama isn't running. Open the Ollama app (or run setup_local_ai.bat)."
    names = {m.get("name") for m in tags.get("models", [])}
    if _full_name(settings.local_ai_model) not in names:
        return False, (f"The local AI model '{settings.local_ai_model}' isn't downloaded yet. "
                       "Double-click setup_local_ai.bat.")
    return True, f"Free local AI ({settings.local_ai_model}) running on this PC."


def _error_message(exc: urllib.error.HTTPError, model: str) -> str:
    try:
        detail = json.loads(exc.read().decode("utf-8")).get("error", "")
    except Exception:
        detail = ""
    if exc.code == 404 or "not found" in detail.lower():
        return f"The local AI model '{model}' isn't downloaded yet. Double-click setup_local_ai.bat."
    if "memory" in detail.lower():
        return ("The local AI ran out of memory. Close other programs (like Chrome) and press Retry, "
                "or set LOCAL_AI_MODEL=qwen3-vl:2b in .env.")
    return f"Local AI error: {detail or exc.reason}"


def analyze_with_local_ai(frames: list[Path], dl: Downloaded, settings: Settings) -> VideoMeta:
    try:
        sheet = make_contact_sheet(frames, frames[0].parent / "grid.jpg")
    except MediaError as exc:
        raise AnalysisFailed(str(exc)) from exc

    payload = {
        "model": settings.local_ai_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"{GRID_NOTE}\n\n{context_text(dl, settings)}\n\n{LOCAL_RULES}\n\nAnswer with the JSON only.",
                "images": [base64.b64encode(sheet.read_bytes()).decode("ascii")],
            },
        ],
        "format": LOCAL_SCHEMA,  # Ollama forces the answer into this JSON shape
        "stream": False,
        "options": {"temperature": 0.2, "num_ctx": CONTEXT_TOKENS},
        "keep_alive": "10m",
    }
    try:
        reply = _request(settings, "/api/chat", payload, timeout=TIMEOUT_SECONDS)
    except urllib.error.HTTPError as exc:
        raise AnalysisFailed(_error_message(exc, settings.local_ai_model)) from exc
    except (socket.timeout, TimeoutError) as exc:
        raise AnalysisFailed("The local AI took too long. Close other programs and press Retry.") from exc
    except (urllib.error.URLError, OSError) as exc:
        raise AnalysisFailed("Ollama isn't running. Open the Ollama app, then press Retry.") from exc

    try:
        data = json.loads(reply["message"]["content"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise AnalysisFailed("The local AI's answer could not be read. Press Retry.") from exc
    if not isinstance(data, dict):
        raise AnalysisFailed("The local AI's answer could not be read. Press Retry.")
    return _fill_gaps(meta_from_json(data), guess_metadata(dl))


def _fill_gaps(ai: VideoMeta, guess: VideoMeta) -> VideoMeta:
    """Small models sometimes miss things the caption states plainly - borrow from free mode."""
    if not ai.is_asmr and guess.confidence == "high":  # the creator literally wrote "asmr"
        ai.is_asmr, ai.confidence = True, "medium"
    if not ai.title.strip():
        ai.title = guess.title
    if not ai.description.strip():
        ai.description = guess.description
    if not ai.tags:
        ai.tags = guess.tags
    if not ai.triggers:
        ai.triggers = guess.triggers
    return ai
