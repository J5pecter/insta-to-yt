"""Configuration management for SocialRelay using Pydantic Settings."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    # App
    APP_NAME: str = "SocialRelay"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"

    # Admin & Auth
    ADMIN_EMAIL: str = "admin@socialrelay.local"
    ADMIN_PASSWORD: str = "admin1234"
    SESSION_SECRET: str = "socialrelay-secret-session-key-dev-32bytes-secure"
    ENCRYPTION_MASTER_KEY: str = "4a59G8r3Z0pB2w1Q9xK7lM5nO3vP1tS7uY9xW1zA3bC="
    JWT_EXPIRE_MINUTES: int = 1440
    USER_TIMEZONE: str = "Asia/Kolkata"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    PUBLIC_BASE_URL: str = "http://localhost:8000"
    ALLOWED_ORIGINS: str = "http://localhost:8000,http://localhost:5173,http://127.0.0.1:8000,http://127.0.0.1:5173,https://j5pecter.github.io"

    # Storage
    DATA_DIR: Path = PROJECT_ROOT / "data"
    STORAGE_DIR: Path = PROJECT_ROOT / "storage"
    MAX_UPLOAD_SIZE_MB: int = 500
    DISK_FREE_MIN_MB: int = 1024
    TEMP_RETENTION_HOURS: int = 24
    UNUSED_DERIVATIVE_RETENTION_DAYS: int = 30

    # Database
    DATABASE_URL: str = f"sqlite:///{PROJECT_ROOT}/data/socialrelay.db"

    # YouTube OAuth
    GOOGLE_CLIENT_SECRET_FILE: Path = PROJECT_ROOT / "data" / "client_secret.json"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    YOUTUBE_REDIRECT_URI: str = "http://localhost:8000/api/v1/accounts/youtube/callback"
    DEFAULT_PRIVACY: Literal["private", "unlisted", "public"] = "private"
    YOUTUBE_CATEGORY_ID: str = "24"
    MADE_FOR_KIDS: bool = False

    # Instagram Graph API
    INSTAGRAM_APP_ID: str = ""
    INSTAGRAM_APP_SECRET: str = ""
    INSTAGRAM_REDIRECT_URI: str = "http://localhost:8000/api/v1/accounts/instagram/callback"
    INSTAGRAM_TOKEN_TYPE: str = "business"

    # AI & Metadata
    AI_PROVIDER: Literal["deterministic", "free", "local", "claude"] = "deterministic"
    OLLAMA_URL: str = "http://127.0.0.1:11434"
    LOCAL_AI_MODEL: str = "qwen2.5:7b"
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-3-5-sonnet-latest"

    # Worker & Scheduling
    WORKER_CONCURRENCY: int = 2
    JOB_LEASE_SECONDS: int = 300
    MAX_JOB_RETRIES: int = 5
    SCHEDULER_HEARTBEAT_SECONDS: int = 30
    MISSED_JOB_POLICY: str = "run_when_service_returns"

    # Publishing defaults
    DEFAULT_HASHTAGS: str = "#shorts"
    INCLUDE_SOURCE_CREDIT: bool = True
    DESCRIPTION_FOOTER: str = ""

    model_config = {
        "env_file": str(PROJECT_ROOT / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def originals_dir(self) -> Path:
        return self.STORAGE_DIR / "originals"

    @property
    def processed_dir(self) -> Path:
        return self.STORAGE_DIR / "processed"

    @property
    def thumbnails_dir(self) -> Path:
        return self.STORAGE_DIR / "thumbnails"

    @property
    def temporary_dir(self) -> Path:
        return self.STORAGE_DIR / "temporary"

    @property
    def backups_dir(self) -> Path:
        return self.STORAGE_DIR / "backups"


settings = Settings()

# Ensure directories exist
for d in [
    settings.DATA_DIR,
    settings.STORAGE_DIR,
    settings.originals_dir,
    settings.processed_dir,
    settings.thumbnails_dir,
    settings.temporary_dir,
    settings.backups_dir,
]:
    d.mkdir(parents=True, exist_ok=True)
