"""Caption and metadata conversion engine for SocialRelay.
Implements Modes A, B, C, D (Ollama + deterministic fallback) and platform validation rules.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ...core.config import settings

logger = logging.getLogger("socialrelay.metadata")

# Regex to detect hashtags
_HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)
# Regex to strip URLs
_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)


class MetadataEngine:
    def __init__(self, ollama_url: str = settings.OLLAMA_URL, model: str = settings.LOCAL_AI_MODEL):
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model

    def extract_hashtags(self, text: str) -> List[str]:
        """Extract hashtag words from text preserving casing without the '#'."""
        if not text:
            return []
        tags = _HASHTAG_RE.findall(text)
        # Deduplicate preserving order
        seen = set()
        result = []
        for tag in tags:
            tag_clean = tag.strip()
            if tag_clean and tag_clean.lower() not in seen:
                seen.add(tag_clean.lower())
                result.append(f"#{tag_clean}")
        return result

    def strip_hashtags_and_urls(self, text: str) -> str:
        """Remove hashtags and URLs from a string to clean up title text."""
        cleaned = _HASHTAG_RE.sub("", text)
        cleaned = _URL_RE.sub("", cleaned)
        # Collapse multiple spaces and newlines
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def clean_title_for_youtube(self, title: str, max_chars: int = 100) -> str:
        """Format and constrain a title string to YouTube's strict 100 character limit without breaking words."""
        if not title:
            return "Untitled Video"

        # Replace angle brackets or illegal control characters
        sanitized = re.sub(r"[<>]", "", title).strip()
        sanitized = re.sub(r"\s+", " ", sanitized)

        if len(sanitized) <= max_chars:
            return sanitized

        # Truncate at word boundary
        truncated = sanitized[: max_chars - 1]
        last_space = truncated.rfind(" ")
        if last_space > 20:
            truncated = truncated[:last_space]
        return truncated.rstrip(" ,.-;:")

    def validate_youtube_description_bytes(self, description: str, max_bytes: int = 5000) -> str:
        """Validate description UTF-8 byte length (up to 5,000 bytes) and trim safely if needed."""
        if not description:
            return ""

        encoded = description.encode("utf-8")
        if len(encoded) <= max_bytes:
            return description

        # Safely slice byte array and decode ignoring partial multibyte char
        sliced_bytes = encoded[:max_bytes]
        return sliced_bytes.decode("utf-8", errors="ignore")

    def convert_metadata(
        self,
        original_caption: str,
        mode: str = "first_sentence",
        attribution_credit: str = "",
        custom_title: Optional[str] = None,
        custom_description: Optional[str] = None,
        custom_caption: Optional[str] = None,
        default_tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Prepare separate YouTube and Instagram metadata according to the selected mode."""
        caption = (original_caption or "").strip()
        extracted_tags = self.extract_hashtags(caption)
        all_tags = list(extracted_tags)
        if default_tags:
            for dt in default_tags:
                tag_fmt = f"#{dt.lstrip('#')}"
                if tag_fmt.lower() not in [t.lower() for t in all_tags]:
                    all_tags.append(tag_fmt)

        yt_title = ""
        yt_description = ""
        ig_caption = custom_caption if custom_caption is not None else caption

        if custom_title:
            yt_title = self.clean_title_for_youtube(custom_title)
        elif mode == "exact_copy":
            yt_title = self.clean_title_for_youtube(caption)
        elif mode == "clean_title":
            clean_text = self.strip_hashtags_and_urls(caption)
            yt_title = self.clean_title_for_youtube(clean_text)
        elif mode == "first_sentence":
            # Extract first sentence
            sentences = re.split(r"(?<=[.!?])\s+|\n+", caption)
            first_sentence = sentences[0].strip() if sentences else caption
            clean_first = self.strip_hashtags_and_urls(first_sentence)
            yt_title = self.clean_title_for_youtube(clean_first if clean_first else first_sentence)
        elif mode == "ai_generated":
            # Run local AI generation with deterministic fallback
            ai_res = self.generate_with_local_ai(caption)
            yt_title = self.clean_title_for_youtube(ai_res.get("title", ""))
            if not yt_title:
                clean_text = self.strip_hashtags_and_urls(caption)
                yt_title = self.clean_title_for_youtube(clean_text)
            if ai_res.get("hashtags"):
                for tag in ai_res["hashtags"]:
                    if tag not in all_tags:
                        all_tags.append(tag)

        # Ensure fallback title if empty
        if not yt_title:
            yt_title = "Short Video"

        # Build YouTube description
        if custom_description:
            yt_description = custom_description
        else:
            desc_parts = []
            if caption:
                desc_parts.append(caption)
            if attribution_credit and settings.INCLUDE_SOURCE_CREDIT:
                desc_parts.append(f"\n{attribution_credit}")
            if settings.DESCRIPTION_FOOTER:
                desc_parts.append(f"\n{settings.DESCRIPTION_FOOTER}")
            if all_tags:
                desc_parts.append("\n" + " ".join(all_tags))
            yt_description = "\n".join(desc_parts)

        yt_description = self.validate_youtube_description_bytes(yt_description)

        # Instagram caption validation (max 2200 chars)
        if len(ig_caption) > 2200:
            ig_caption = ig_caption[:2197] + "..."

        return {
            "youtube_title": yt_title,
            "youtube_description": yt_description,
            "youtube_tags": [t.lstrip("#") for t in all_tags[:50]],  # YouTube allows up to 500 chars total tags
            "instagram_caption": ig_caption,
            "instagram_hashtags": all_tags[:30],  # Instagram allows max 30 hashtags
            "original_caption": caption,
            "extracted_hashtags": extracted_tags,
            "attribution": attribution_credit,
            "mode": mode,
        }

    def generate_with_local_ai(self, caption: str) -> Dict[str, Any]:
        """Query local Ollama model for title suggestions and hashtags with graceful offline fallback."""
        if settings.AI_PROVIDER != "local" or not caption:
            return {}

        prompt = (
            "You are a social media copywriter. Given this video caption, generate a catchy YouTube title (max 70 chars) "
            "and 3-5 relevant hashtags. Respond ONLY with valid JSON: {\"title\": \"...\", \"hashtags\": [\"#tag1\", \"#tag2\"]}.\n\n"
            f"Caption: {caption[:1000]}"
        )

        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                    },
                )
                if res.status_code == 200:
                    raw_text = res.json().get("response", "{}")
                    data = json.loads(raw_text)
                    return {
                        "title": data.get("title", ""),
                        "hashtags": data.get("hashtags", []),
                    }
        except Exception as e:
            logger.info(f"Ollama local AI query failed or offline: {e}. Using deterministic mode.")

        return {}

    def check_ollama_status(self) -> Dict[str, Any]:
        """Check if local Ollama service is reachable and list installed models."""
        try:
            with httpx.Client(timeout=2.0) as client:
                res = client.get(f"{self.ollama_url}/api/tags")
                if res.status_code == 200:
                    models = [m["name"] for m in res.json().get("models", [])]
                    return {
                        "available": True,
                        "url": self.ollama_url,
                        "models": models,
                        "selected_model": self.model,
                    }
        except Exception:
            pass
        return {
            "available": False,
            "url": self.ollama_url,
            "models": [],
            "selected_model": self.model,
            "fallback": "deterministic_rules",
        }


metadata_engine = MetadataEngine()
