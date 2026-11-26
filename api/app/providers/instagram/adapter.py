"""Instagram publishing adapter using official Meta Graph API for Instagram Reels.
Implements media container creation, status polling, publication, and manual export fallback.
"""
from __future__ import annotations

import json
import logging
import time
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlencode

import httpx

from ...core.config import settings
from ...security.crypto import create_signed_state, decrypt_token, encrypt_token, verify_signed_state
from ...services.accounts.credentials import get_instagram_app_config

logger = logging.getLogger("socialrelay.instagram")

GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class InstagramAdapterError(RuntimeError):
    pass


class InstagramContainerProcessingError(InstagramAdapterError):
    pass


class InstagramAdapter:
    def __init__(self):
        self.app_id = settings.INSTAGRAM_APP_ID
        self.app_secret = settings.INSTAGRAM_APP_SECRET
        self.redirect_uri = settings.effective_instagram_redirect_uri

    def _get_config(self, db=None) -> Dict[str, str]:
        cfg = get_instagram_app_config(db)
        if cfg and cfg.get("app_id") and cfg.get("app_secret"):
            return cfg
        if self.app_id and self.app_secret:
            return {"app_id": self.app_id, "app_secret": self.app_secret, "login_mode": "instagram_login"}
        raise InstagramAdapterError(
            "Instagram App ID and App Secret are not configured. Use the Account Setup Wizard in Accounts to configure them."
        )

    def is_configured(self, db=None) -> bool:
        """Check if Meta Developer App credentials are configured."""
        try:
            self._get_config(db)
            return True
        except InstagramAdapterError:
            return False

    def get_authorization_url(self, db=None) -> Tuple[str, str]:
        """Generate Meta/Instagram OAuth authorization URL for Instagram Professional accounts."""
        cfg = self._get_config(db)
        app_id = cfg["app_id"]
        login_mode = cfg.get("login_mode", "instagram_login")
        state = create_signed_state(f"instagram_oauth_{login_mode}")

        if login_mode == "instagram_login":
            scopes = [
                "instagram_business_basic",
                "instagram_business_content_publish",
            ]
            params = {
                "enable_fb_login": "0",
                "force_authentication": "1",
                "client_id": app_id,
                "redirect_uri": self.redirect_uri,
                "response_type": "code",
                "scope": ",".join(scopes),
                "state": state,
            }
            auth_url = f"https://www.instagram.com/oauth/authorize?{urlencode(params)}"
            return auth_url, state

        scopes = [
            "instagram_basic",
            "instagram_content_publish",
            "pages_show_list",
            "pages_read_engagement",
        ]
        params = {
            "client_id": app_id,
            "redirect_uri": self.redirect_uri,
            "scope": ",".join(scopes),
            "response_type": "code",
            "state": state,
        }
        auth_url = f"https://www.facebook.com/{GRAPH_API_VERSION}/dialog/oauth?{urlencode(params)}"
        return auth_url, state

    def handle_oauth_callback(self, code: str, state: str, db=None) -> Dict[str, Any]:
        """Exchange authorization code for long-lived access token and retrieve Instagram Professional account."""
        if not verify_signed_state(state):
            raise InstagramAdapterError("OAuth state validation failed.")

        cfg = self._get_config(db)
        app_id = cfg["app_id"]
        app_secret = cfg["app_secret"]
        login_mode = cfg.get("login_mode", "instagram_login")

        with httpx.Client(timeout=15.0) as client:
            if login_mode == "instagram_login":
                # 1. Exchange code for short-lived Instagram User token
                token_res = client.post(
                    "https://api.instagram.com/oauth/access_token",
                    data={
                        "client_id": app_id,
                        "client_secret": app_secret,
                        "grant_type": "authorization_code",
                        "redirect_uri": self.redirect_uri,
                        "code": code,
                    },
                )
                if token_res.status_code != 200:
                    raise InstagramAdapterError(f"Failed to exchange Instagram Login OAuth code: {token_res.text}")

                token_data = token_res.json()
                short_token = token_data.get("access_token")
                ig_user_id = str(token_data.get("user_id", ""))

                # 2. Exchange for 60-day long-lived token via graph.instagram.com
                long_res = client.get(
                    "https://graph.instagram.com/access_token",
                    params={
                        "grant_type": "ig_exchange_token",
                        "client_secret": app_secret,
                        "access_token": short_token,
                    },
                )
                long_data = long_res.json() if long_res.status_code == 200 else {}
                access_token = long_data.get("access_token", short_token)
                expires_in = long_data.get("expires_in", 5184000)

                # 3. Fetch profile details
                me_res = client.get(
                    f"https://graph.instagram.com/{GRAPH_API_VERSION}/me",
                    params={"fields": "user_id,username,name,profile_picture_url,account_type", "access_token": access_token},
                )
                me_data = me_res.json() if me_res.status_code == 200 else {}
                account_id = str(me_data.get("user_id") or ig_user_id or "ig_user")
                username = me_data.get("username") or me_data.get("name") or "Instagram Creator"
                avatar = me_data.get("profile_picture_url")

                from datetime import datetime, timedelta, timezone
                expiry = (datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))).isoformat()
                return {
                    "account_id": account_id,
                    "username": username,
                    "name": me_data.get("name") or username,
                    "avatar_url": avatar,
                    "encrypted_token": encrypt_token(access_token),
                    "expiry": expiry,
                    "permissions": ["instagram_business_basic", "instagram_business_content_publish"],
                }

            # Facebook Login Graph API fallback
            token_res = client.get(
                f"{GRAPH_API_BASE}/oauth/access_token",
                params={
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "redirect_uri": self.redirect_uri,
                    "code": code,
                },
            )
            if token_res.status_code != 200:
                raise InstagramAdapterError(f"Failed to exchange Instagram OAuth code: {token_res.text}")

            short_token = token_res.json().get("access_token")

            # 2. Exchange for long-lived user token (60 days)
            long_res = client.get(
                f"{GRAPH_API_BASE}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "fb_exchange_token": short_token,
                },
            )
            long_data = long_res.json()
            access_token = long_data.get("access_token", short_token)
            expires_in = long_data.get("expires_in", 5184000)  # default 60 days

            # 3. Locate connected Instagram Business accounts via managed Facebook Pages
            pages_res = client.get(
                f"{GRAPH_API_BASE}/me/accounts",
                params={"access_token": access_token, "fields": "instagram_business_account{id,username,name,profile_picture_url}"},
            )
            pages_data = pages_res.json().get("data", [])
            ig_account = None
            for page in pages_data:
                if "instagram_business_account" in page:
                    ig_account = page["instagram_business_account"]
                    break

            if not ig_account:
                raise InstagramAdapterError(
                    "No Instagram Professional (Business or Creator) account found linked to your Facebook Pages. "
                    "Ensure your Instagram account is switched to Professional and linked to a Facebook Page, or switch to Instagram Login mode."
                )

            encrypted_token = encrypt_token(access_token)
            return {
                "account_id": ig_account["id"],
                "username": ig_account.get("username", "instagram_creator"),
                "name": ig_account.get("name", "Instagram Account"),
                "avatar_url": ig_account.get("profile_picture_url"),
                "encrypted_token": encrypted_token,
                "expires_in": expires_in,
            }

    def publish_reel(
        self,
        encrypted_token: str,
        ig_user_id: str,
        video_url: str,
        caption: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Dict[str, Any]:
        """Execute the official Meta Graph API Reels publishing workflow:
        1. Create container -> 2. Poll container status until FINISHED -> 3. Publish container.
        """
        access_token = decrypt_token(encrypted_token)

        with httpx.Client(timeout=30.0) as client:
            # Step 1: Create media container
            if progress_callback:
                progress_callback(10, "Creating Instagram Reel media container...")

            create_res = client.post(
                f"{GRAPH_API_BASE}/{ig_user_id}/media",
                data={
                    "access_token": access_token,
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": caption[:2200],
                    "share_to_feed": "true",
                },
            )

            if create_res.status_code != 200:
                err_msg = create_res.text
                try:
                    err_msg = create_res.json().get("error", {}).get("message", err_msg)
                except Exception:
                    pass
                raise InstagramAdapterError(f"Failed to create Instagram Reel container: {err_msg}")

            container_id = create_res.json().get("id")
            if not container_id:
                raise InstagramAdapterError("Meta API did not return a valid container ID.")

            # Step 2: Poll container status (bounded backoff, max 15 attempts, 10s intervals)
            max_attempts = 15
            for attempt in range(max_attempts):
                if progress_callback:
                    pct = 20 + int((attempt / max_attempts) * 60)
                    progress_callback(pct, f"Waiting for Instagram video processing ({attempt + 1}/{max_attempts})...")

                time.sleep(8)
                status_res = client.get(
                    f"{GRAPH_API_BASE}/{container_id}",
                    params={"access_token": access_token, "fields": "status_code,status"},
                )
                if status_res.status_code != 200:
                    continue

                status_data = status_res.json()
                code = status_data.get("status_code", "").upper()

                if code == "FINISHED":
                    break
                elif code in ("ERROR", "EXPIRED"):
                    raise InstagramContainerProcessingError(
                        f"Instagram video processing failed: {status_data.get('status', code)}"
                    )
            else:
                raise InstagramContainerProcessingError(
                    "Instagram video processing timed out after 2 minutes. The job has been flagged for reconciliation."
                )

            # Step 3: Publish container
            if progress_callback:
                progress_callback(85, "Publishing Instagram Reel...")

            pub_res = client.post(
                f"{GRAPH_API_BASE}/{ig_user_id}/media_publish",
                data={"access_token": access_token, "creation_id": container_id},
            )
            if pub_res.status_code != 200:
                raise InstagramAdapterError(f"Failed to publish Instagram container: {pub_res.text}")

            media_id = pub_res.json().get("id")

            # Step 4: Retrieve permalink
            permalink_res = client.get(
                f"{GRAPH_API_BASE}/{media_id}",
                params={"access_token": access_token, "fields": "permalink"},
            )
            permalink = None
            if permalink_res.status_code == 200:
                permalink = permalink_res.json().get("permalink")

            if progress_callback:
                progress_callback(100, "Published successfully!")

            return {
                "container_id": container_id,
                "media_id": media_id,
                "published_url": permalink or f"https://www.instagram.com/reel/{media_id}/",
                "status": "published",
            }

    def generate_manual_export_package(
        self,
        video_path: Path,
        thumbnail_path: Optional[Path],
        caption: str,
        title: str,
        output_zip_path: Path,
    ) -> Path:
        """Create a complete downloadable ZIP package for manual posting when direct API publishing is unavailable."""
        output_zip_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            if video_path.exists():
                z.write(video_path, arcname=f"video_{video_path.name}")
            if thumbnail_path and thumbnail_path.exists():
                z.write(thumbnail_path, arcname="thumbnail.jpg")

            manifest = {
                "title": title,
                "caption": caption,
                "hashtags": [w for w in caption.split() if w.startswith("#")],
                "instructions": (
                    "To publish manually to Instagram:\n"
                    "1. Open Instagram App or instagram.com\n"
                    "2. Tap '+' and select Reel\n"
                    "3. Select the attached video file\n"
                    "4. Copy and paste caption.txt into the post caption\n"
                    "5. Share your Reel!"
                ),
            }
            z.writestr("caption.txt", caption)
            z.writestr("metadata.json", json.dumps(manifest, indent=2))

        return output_zip_path


instagram_adapter = InstagramAdapter()
