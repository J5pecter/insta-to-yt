"""Secure credential storage & validation service for YouTube and Instagram OAuth apps.
Never exposes raw client secrets or app secrets to the frontend.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.config import settings
from ...models.entities import Setting
from ...security.crypto import decrypt_token, encrypt_token

logger = logging.getLogger("socialrelay.credentials")

GOOGLE_CREDENTIAL_KEY = "oauth_google_client_config"
INSTAGRAM_CREDENTIAL_KEY = "oauth_instagram_app_config"


def _mask_secret(value: str, visible_prefix: int = 6, visible_suffix: int = 4) -> str:
    if not value:
        return ""
    if len(value) <= visible_prefix + visible_suffix:
        return "*" * len(value)
    return f"{value[:visible_prefix]}...{value[-visible_suffix:]}"


def validate_google_client_json(raw_json: str) -> Dict[str, Any]:
    """Validate Google OAuth client_secret.json structure and trusted endpoints."""
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON syntax: {e}")

    if not isinstance(parsed, dict):
        raise ValueError("JSON root must be an object.")

    client_type = "web" if "web" in parsed else ("installed" if "installed" in parsed else None)
    if not client_type:
        raise ValueError("Unsupported credential format. Expected 'web' or 'installed' OAuth client configuration.")

    block = parsed[client_type]
    if not isinstance(block, dict):
        raise ValueError(f"'{client_type}' configuration block must be a JSON object.")

    client_id = str(block.get("client_id") or "").strip()
    client_secret = str(block.get("client_secret") or "").strip()
    auth_uri = str(block.get("auth_uri") or "https://accounts.google.com/o/oauth2/auth").strip()
    token_uri = str(block.get("token_uri") or "https://oauth2.googleapis.com/token").strip()
    redirect_uris = block.get("redirect_uris") or []

    if not client_id or not client_id.endswith(".apps.googleusercontent.com"):
        raise ValueError("Invalid Google Client ID. Expected a '*.apps.googleusercontent.com' identifier.")
    if not client_secret:
        raise ValueError("Missing 'client_secret' in Google OAuth JSON.")
    if not auth_uri.startswith("https://accounts.google.com/"):
        raise ValueError("Untrusted auth_uri. Expected https://accounts.google.com/...")
    if not token_uri.startswith("https://oauth2.googleapis.com/"):
        raise ValueError("Untrusted token_uri. Expected https://oauth2.googleapis.com/...")
    if not isinstance(redirect_uris, list):
        raise ValueError("'redirect_uris' must be a list of URLs.")

    return {
        client_type: {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": auth_uri,
            "token_uri": token_uri,
            "redirect_uris": redirect_uris,
            "project_id": block.get("project_id", ""),
        }
    }


def save_google_credentials(db: Session, raw_json: str, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Validate, encrypt, and persist Google OAuth client credentials."""
    validated = validate_google_client_json(raw_json)
    client_type = "web" if "web" in validated else "installed"
    block = validated[client_type]

    # Store encrypted in DB
    encrypted_payload = encrypt_token(json.dumps(validated))
    setting = db.execute(select(Setting).where(Setting.setting_key == GOOGLE_CREDENTIAL_KEY)).scalars().first()
    if not setting:
        setting = Setting(user_id=user_id, setting_key=GOOGLE_CREDENTIAL_KEY, setting_value=encrypted_payload)
        db.add(setting)
    else:
        setting.setting_value = encrypted_payload
    db.commit()

    # Also write to configured local data path if parent exists (ignored by git)
    try:
        settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(settings.GOOGLE_CLIENT_SECRET_FILE, "w", encoding="utf-8") as f:
            json.dump(validated, f, indent=2)
    except Exception as e:
        logger.warning(f"Could not mirror client_secret.json to disk: {e}")

    return {
        "configured": True,
        "client_type": client_type,
        "client_id_masked": _mask_secret(block["client_id"], 10, 28),
        "project_id": block.get("project_id", ""),
        "redirect_uris": block.get("redirect_uris", []),
        "expected_callback_url": settings.YOUTUBE_REDIRECT_URI,
    }


def get_google_client_config(db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
    """Retrieve decrypted Google OAuth client config from DB, env, or file."""
    if db is not None:
        setting = db.execute(select(Setting).where(Setting.setting_key == GOOGLE_CREDENTIAL_KEY)).scalars().first()
        if setting and setting.setting_value:
            try:
                return json.loads(decrypt_token(setting.setting_value))
            except Exception as e:
                logger.error(f"Failed to decrypt stored Google credentials: {e}")

    if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
        return {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.YOUTUBE_REDIRECT_URI],
            }
        }

    if settings.GOOGLE_CLIENT_SECRET_FILE.exists():
        try:
            with open(settings.GOOGLE_CLIENT_SECRET_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    return None


def get_google_credential_status(db: Session) -> Dict[str, Any]:
    """Return masked status of Google OAuth credentials (never returns secret)."""
    cfg = get_google_client_config(db)
    if not cfg:
        return {
            "configured": False,
            "client_type": None,
            "client_id_masked": None,
            "redirect_uris": [],
            "expected_callback_url": settings.YOUTUBE_REDIRECT_URI,
        }
    client_type = "web" if "web" in cfg else "installed"
    block = cfg.get(client_type, {})
    return {
        "configured": bool(block.get("client_id") and block.get("client_secret")),
        "client_type": client_type,
        "client_id_masked": _mask_secret(block.get("client_id", ""), 10, 28),
        "project_id": block.get("project_id", ""),
        "redirect_uris": block.get("redirect_uris", []),
        "expected_callback_url": settings.YOUTUBE_REDIRECT_URI,
    }


def save_instagram_credentials(
    db: Session,
    app_id: str,
    app_secret: str,
    login_mode: str = "instagram_login",
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Validate, encrypt, and persist Instagram / Meta App credentials."""
    clean_id = app_id.strip()
    clean_secret = app_secret.strip()
    if not clean_id or not clean_id.isdigit():
        raise ValueError("Instagram App ID must be a numeric Meta App ID.")
    if not clean_secret or len(clean_secret) < 16:
        raise ValueError("Instagram App Secret appears invalid (expected at least 16 characters).")
    if login_mode not in ("instagram_login", "facebook_login"):
        login_mode = "instagram_login"

    payload = {
        "app_id": clean_id,
        "app_secret": clean_secret,
        "login_mode": login_mode,
    }
    encrypted = encrypt_token(json.dumps(payload))
    setting = db.execute(select(Setting).where(Setting.setting_key == INSTAGRAM_CREDENTIAL_KEY)).scalars().first()
    if not setting:
        setting = Setting(user_id=user_id, setting_key=INSTAGRAM_CREDENTIAL_KEY, setting_value=encrypted)
        db.add(setting)
    else:
        setting.setting_value = encrypted
    db.commit()

    return {
        "configured": True,
        "app_id_masked": _mask_secret(clean_id, 4, 4),
        "login_mode": login_mode,
        "expected_callback_url": settings.INSTAGRAM_REDIRECT_URI,
    }


def get_instagram_app_config(db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
    """Retrieve decrypted Instagram App config from DB or .env."""
    if db is not None:
        setting = db.execute(select(Setting).where(Setting.setting_key == INSTAGRAM_CREDENTIAL_KEY)).scalars().first()
        if setting and setting.setting_value:
            try:
                return json.loads(decrypt_token(setting.setting_value))
            except Exception as e:
                logger.error(f"Failed to decrypt stored Instagram credentials: {e}")

    if settings.INSTAGRAM_APP_ID and settings.INSTAGRAM_APP_SECRET:
        return {
            "app_id": settings.INSTAGRAM_APP_ID,
            "app_secret": settings.INSTAGRAM_APP_SECRET,
            "login_mode": "instagram_login",
        }
    return None


def get_instagram_credential_status(db: Session) -> Dict[str, Any]:
    """Return masked status of Instagram App credentials (never returns secret)."""
    cfg = get_instagram_app_config(db)
    if not cfg:
        return {
            "configured": False,
            "app_id_masked": None,
            "login_mode": "instagram_login",
            "expected_callback_url": settings.INSTAGRAM_REDIRECT_URI,
        }
    return {
        "configured": bool(cfg.get("app_id") and cfg.get("app_secret")),
        "app_id_masked": _mask_secret(cfg.get("app_id", ""), 4, 4),
        "login_mode": cfg.get("login_mode", "instagram_login"),
        "expected_callback_url": settings.INSTAGRAM_REDIRECT_URI,
    }
