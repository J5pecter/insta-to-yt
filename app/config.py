"""Settings. Everything is read from the .env file (copy .env.example to .env)."""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

PRIVACY_OPTIONS = ("private", "unlisted", "public")
AI_PROVIDERS = ("free", "local", "claude")


class ConfigError(RuntimeError):
    """A setting in .env is missing or wrong. The message says how to fix it."""


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _path(name: str, default: str | None) -> Path | None:
    raw = (os.getenv(name) or default or "").strip()
    if not raw:
        return None
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    admin_password: str
    session_secret: str
    host: str = "127.0.0.1"
    port: int = 8000
    public_base_url: str = "http://localhost:8000"
    # AI: "free" (caption keywords), "local" (Ollama on this PC) or "claude" (paid)
    ai_provider: str = "free"
    claude_model: str = "claude-opus-5-5"  # reads ANTHROPIC_API_KEY from the environment
    local_ai_model: str = "gemma3:4b"
    ollama_url: str = "http://127.0.0.1:11434"
    # YouTube
    google_client_secret_file: Path | None = None
    default_privacy: str = "private"
    youtube_category_id: str = "24"
    made_for_kids: bool = False
    # Behaviour
    auto_upload: bool = True
    hold_non_asmr: bool = True
    include_source_credit: bool = True
    keep_downloads: bool = False
    channel_name: str = ""
    default_hashtags: list[str] = field(default_factory=list)
    description_footer: str = ""
    # Instagram download help (only needed if Instagram asks for a login)
    instagram_cookies_file: Path | None = None
    instagram_cookies_from_browser: str = ""

    @property
    def ai_enabled(self) -> bool:
        return self.ai_provider in ("local", "claude")

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def downloads_dir(self) -> Path:
        return self.data_dir / "downloads"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "thumbs"

    @property
    def youtube_token_file(self) -> Path:
        return self.data_dir / "youtube_token.json"

    @property
    def youtube_redirect_uri(self) -> str:
        return self.public_base_url.rstrip("/") + "/youtube/callback"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.downloads_dir, self.thumbs_dir):
            d.mkdir(parents=True, exist_ok=True)


def _session_secret(data_dir: Path) -> str:
    """Use SESSION_SECRET if given, otherwise create one and keep it in data/."""
    explicit = (os.getenv("SESSION_SECRET") or "").strip()
    if explicit:
        return explicit
    data_dir.mkdir(parents=True, exist_ok=True)
    secret_file = data_dir / ".session_secret"
    if secret_file.exists():
        return secret_file.read_text(encoding="utf-8").strip()
    value = secrets.token_urlsafe(48)
    secret_file.write_text(value, encoding="utf-8")
    return value


def resolve_ai_provider(raw: str, has_claude_key: bool) -> str:
    """AI_PROVIDER from .env. Empty means: Claude if there is a key, otherwise free mode."""
    choice = (raw or "").strip().lower()
    if not choice:
        return "claude" if has_claude_key else "free"
    if choice not in AI_PROVIDERS:
        raise ConfigError(f"AI_PROVIDER must be one of {', '.join(AI_PROVIDERS)} (or empty).")
    if choice == "claude" and not has_claude_key:
        raise ConfigError("AI_PROVIDER=claude needs ANTHROPIC_API_KEY in .env.")
    return choice


def load_settings(env_file: Path | None = None) -> Settings:
    load_dotenv(env_file or ROOT / ".env", override=env_file is not None)

    password = (os.getenv("ADMIN_PASSWORD") or "").strip()
    if len(password) < 8:
        raise ConfigError(
            "ADMIN_PASSWORD in your .env file is missing or shorter than 8 characters. "
            "Open .env, set a strong password, and start again."
        )

    privacy = (os.getenv("DEFAULT_PRIVACY") or "private").strip().lower()
    if privacy not in PRIVACY_OPTIONS:
        raise ConfigError(f"DEFAULT_PRIVACY must be one of {', '.join(PRIVACY_OPTIONS)}.")

    port = int(os.getenv("PORT") or 8000)
    host = (os.getenv("HOST") or "127.0.0.1").strip()
    data_dir = _path("DATA_DIR", "data")
    assert data_dir is not None

    hashtags = [
        h if h.startswith("#") else f"#{h}"
        for h in (os.getenv("DEFAULT_HASHTAGS") or "").replace(",", " ").split()
    ]

    return Settings(
        data_dir=data_dir,
        admin_password=password,
        session_secret=_session_secret(data_dir),
        host=host,
        port=port,
        public_base_url=(os.getenv("PUBLIC_BASE_URL") or f"http://localhost:{port}").strip(),
        ai_provider=resolve_ai_provider(os.getenv("AI_PROVIDER") or "",
                                        bool((os.getenv("ANTHROPIC_API_KEY") or "").strip())),
        claude_model=(os.getenv("CLAUDE_MODEL") or "claude-opus-5-5").strip(),
        local_ai_model=(os.getenv("LOCAL_AI_MODEL") or "gemma3:4b").strip(),
        ollama_url=(os.getenv("OLLAMA_URL") or "http://127.0.0.1:11434").strip().rstrip("/"),
        google_client_secret_file=_path("GOOGLE_CLIENT_SECRET_FILE", "data/client_secret.json"),
        default_privacy=privacy,
        youtube_category_id=(os.getenv("YOUTUBE_CATEGORY_ID") or "24").strip(),
        made_for_kids=_bool("MADE_FOR_KIDS", False),
        auto_upload=_bool("AUTO_UPLOAD", True),
        hold_non_asmr=_bool("HOLD_NON_ASMR", False),
        include_source_credit=_bool("INCLUDE_SOURCE_CREDIT", True),
        keep_downloads=_bool("KEEP_DOWNLOADS", False),
        channel_name=(os.getenv("CHANNEL_NAME") or "").strip(),
        default_hashtags=hashtags,
        description_footer=(os.getenv("DESCRIPTION_FOOTER") or "").replace("\\n", "\n").strip(),
        instagram_cookies_file=_path("INSTAGRAM_COOKIES_FILE", None),
        instagram_cookies_from_browser=(os.getenv("INSTAGRAM_COOKIES_FROM_BROWSER") or "").strip(),
    )
