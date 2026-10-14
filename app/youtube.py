"""Connect a YouTube channel (Google sign-in, done once) and upload videos to it."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Callable

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

from .config import Settings

SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",  # only to show the channel name
]


class YouTubeError(RuntimeError):
    pass


class YouTubeNotConnected(YouTubeError):
    pass


def _friendly_http_error(exc: HttpError) -> str:
    reason = ""
    try:
        reason = json.loads(exc.content)["error"]["errors"][0]["reason"]
    except Exception:
        pass
    messages = {
        "quotaExceeded": "Today's YouTube API limit is used up. It resets at midnight Pacific time - press Retry tomorrow.",
        "uploadLimitExceeded": "Your channel hit YouTube's daily upload limit. Press Retry tomorrow.",
        "youtubeSignupRequired": "This Google account has no YouTube channel yet. Create one, then reconnect.",
        "invalidTitle": "YouTube rejected the title. Edit it and try again.",
        "invalidDescription": "YouTube rejected the description. Edit it and try again.",
        "invalidTags": "YouTube rejected the tags. Edit them and try again.",
        "forbidden": "YouTube refused the upload for this account.",
    }
    return messages.get(reason, f"YouTube error {exc.resp.status}: {reason or exc.reason}")


class YouTubeClient:
    def __init__(self, settings: Settings, db: Any = None):
        self.settings = settings
        self.db = db
        self._pending: dict[str, str | None] = {}  # sign-in state -> PKCE code verifier
        self._lock = threading.Lock()
        self._channel_cache: tuple[str, str] | None = None
        if settings.youtube_redirect_uri.startswith(("http://localhost", "http://127.0.0.1")):
            # Google allows plain http only for this computer (localhost).
            os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
        os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

        # Migrate legacy token file into DB if present
        if self.db and self.settings.youtube_token_file.exists():
            try:
                if not self.db.list_channels():
                    creds = Credentials.from_authorized_user_file(str(self.settings.youtube_token_file), SCOPES)
                    srv = build("youtube", "v3", credentials=creds, cache_discovery=False)
                    items = srv.channels().list(part="snippet", mine=True).execute().get("items", [])
                    if items:
                        item = items[0]
                        self.db.save_channel(
                            item["id"],
                            item["snippet"]["title"],
                            item["snippet"].get("customUrl"),
                            item["snippet"].get("thumbnails", {}).get("default", {}).get("url"),
                            creds.to_json(),
                            set_active=True,
                        )
            except Exception:
                pass

    # ---------- connection ----------
    @property
    def configured(self) -> bool:
        f = self.settings.google_client_secret_file
        return bool(f and f.exists())

    def _flow(self, state: str | None = None) -> Flow:
        if not self.configured:
            raise YouTubeError("client_secret.json is missing. Please add Google OAuth credentials in settings.")
        return Flow.from_client_secrets_file(
            str(self.settings.google_client_secret_file), scopes=SCOPES,
            redirect_uri=self.settings.youtube_redirect_uri, state=state,
        )

    def start_sign_in(self) -> str:
        flow = self._flow()
        url, state = flow.authorization_url(
            access_type="offline",
            prompt="consent select_account",
            include_granted_scopes="true",
        )
        with self._lock:
            self._pending[state] = flow.code_verifier
        return url

    def finish_sign_in(self, state: str, callback_url: str) -> tuple[str, str] | None:
        with self._lock:
            if state not in self._pending:
                raise YouTubeError("This sign-in link expired. Press 'Connect YouTube' again.")
            verifier = self._pending.pop(state)
        flow = self._flow(state=state)
        flow.code_verifier = verifier
        flow.fetch_token(authorization_response=callback_url)
        creds = flow.credentials
        self._save(creds)
        self._channel_cache = None

        # Fetch channel details and save to db
        try:
            srv = build("youtube", "v3", credentials=creds, cache_discovery=False)
            items = srv.channels().list(part="snippet", mine=True).execute().get("items", [])
            if items:
                item = items[0]
                ch_id = item["id"]
                ch_title = item["snippet"]["title"]
                custom_url = item["snippet"].get("customUrl")
                thumb = item["snippet"].get("thumbnails", {}).get("default", {}).get("url")
                if self.db:
                    self.db.save_channel(ch_id, ch_title, custom_url, thumb, creds.to_json(), set_active=True)
                self._channel_cache = (ch_id, ch_title)
                return ch_id, ch_title
        except Exception:
            pass
        return None

    def list_channels(self) -> list[dict[str, Any]]:
        if self.db:
            channels = self.db.list_channels()
            if channels:
                return channels
        if self.connected:
            ch = self.channel()
            if ch:
                return [{
                    "channel_id": ch[0],
                    "title": ch[1],
                    "custom_url": "",
                    "thumbnail_url": "",
                    "is_active": 1,
                }]
        return []

    def get_active_channel(self) -> dict[str, Any] | None:
        if self.db:
            active = self.db.get_active_channel()
            if active:
                return active
        ch = self.channel()
        if ch:
            return {
                "channel_id": ch[0],
                "title": ch[1],
                "custom_url": "",
                "thumbnail_url": "",
                "is_active": 1,
            }
        return None

    def set_active_channel(self, channel_id: str) -> bool:
        self._channel_cache = None
        if self.db:
            return self.db.set_active_channel(channel_id)
        return False

    def disconnect(self, channel_id: str | None = None) -> None:
        if self.db and channel_id:
            self.db.delete_channel(channel_id)
            if not self.db.list_channels():
                self.settings.youtube_token_file.unlink(missing_ok=True)
        elif self.db:
            active = self.db.get_active_channel()
            if active:
                self.db.delete_channel(active["channel_id"])
            if not self.db.list_channels():
                self.settings.youtube_token_file.unlink(missing_ok=True)
        else:
            self.settings.youtube_token_file.unlink(missing_ok=True)
        self._channel_cache = None

    def _save(self, creds: Credentials) -> None:
        self.settings.youtube_token_file.parent.mkdir(parents=True, exist_ok=True)
        self.settings.youtube_token_file.write_text(creds.to_json(), encoding="utf-8")

    def _credentials(self, channel_id: str | None = None) -> Credentials:
        if self.db and channel_id:
            ch = self.db.get_channel(channel_id)
            if ch and ch.get("token_json"):
                info = json.loads(ch["token_json"])
                creds = Credentials.from_authorized_user_info(info, SCOPES)
                if not creds.valid:
                    try:
                        creds.refresh(Request())
                    except RefreshError as exc:
                        raise YouTubeNotConnected(f"Access for channel '{ch['title']}' expired. Connect again.") from exc
                    self.db.update_channel_token(channel_id, creds.to_json())
                    if ch.get("is_active"):
                        self._save(creds)
                return creds

        if self.db and not channel_id:
            active = self.db.get_active_channel()
            if active and active.get("token_json"):
                return self._credentials(channel_id=active["channel_id"])

        token_file = self.settings.youtube_token_file
        if not token_file.exists():
            raise YouTubeNotConnected("YouTube is not connected. Press 'Connect YouTube' first.")
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
        if not creds.valid:
            try:
                creds.refresh(Request())
            except RefreshError as exc:
                raise YouTubeNotConnected(
                    "YouTube access expired or was removed. Press 'Connect YouTube' again."
                ) from exc
            self._save(creds)
        return creds

    def _service(self, channel_id: str | None = None):
        return build("youtube", "v3", credentials=self._credentials(channel_id), cache_discovery=False)

    @property
    def connected(self) -> bool:
        if self.db and self.db.list_channels():
            return True
        return self.settings.youtube_token_file.exists()

    def channel(self) -> tuple[str, str] | None:
        """(channel id, channel name) of the currently selected active channel, cached."""
        if self._channel_cache:
            return self._channel_cache
        if self.db:
            active = self.db.get_active_channel()
            if active:
                self._channel_cache = (active["channel_id"], active["title"])
                return self._channel_cache
        try:
            items = self._service().channels().list(part="snippet", mine=True).execute().get("items", [])
        except (YouTubeError, HttpError):
            return None
        if items:
            self._channel_cache = (items[0]["id"], items[0]["snippet"]["title"])
        return self._channel_cache

    # ---------- upload ----------
    def upload(self, path: Path, title: str, description: str, tags: list[str], privacy: str,
               channel_id: str | None = None,
               progress: Callable[[int], None] | None = None) -> str:
        body = {
            "snippet": {
                "title": title,
                "description": description,
                "tags": tags,
                "categoryId": self.settings.youtube_category_id,
            },
            "status": {
                "privacyStatus": privacy,
                "selfDeclaredMadeForKids": self.settings.made_for_kids,
            },
        }
        media = MediaFileUpload(str(path), mimetype="video/mp4", chunksize=8 * 1024 * 1024, resumable=True)
        try:
            request = self._service(channel_id).videos().insert(part="snippet,status", body=body, media_body=media)
            response = None
            while response is None:
                status, response = request.next_chunk(num_retries=3)
                if status and progress:
                    progress(int(status.progress() * 100))
        except HttpError as exc:
            raise YouTubeError(_friendly_http_error(exc)) from exc
        video_id = (response or {}).get("id")
        if not video_id:
            raise YouTubeError("YouTube did not return a video ID.")
        return video_id
