"""The web app: admin login, the dashboard page, and the small API it talks to."""
from __future__ import annotations

import hmac
import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from .config import ROOT, Settings
from .db import Database
from .links import InvalidLink, parse_instagram_link, parse_youtube_id
from .local_ai import check_ready
from .pipeline import ActionError, Pipeline
from .youtube import YouTubeClient, YouTubeError

log = logging.getLogger("insta2yt")
WEB = ROOT / "web"
MAX_LINKS_PER_ADD = 50
Privacy = Literal["private", "unlisted", "public"]


class LoginBody(BaseModel):
    password: str = Field(max_length=200)


class AddBody(BaseModel):
    links: str = Field(max_length=20000)
    auto_upload: bool = True
    privacy: Privacy = "private"
    rights_confirmed: bool = False
    channel_id: str | None = None


class EditBody(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=8000)
    tags: list[str] | None = Field(default=None, max_length=80)
    privacy: Privacy | None = None
    channel_id: str | None = None


class MarkUploadedBody(BaseModel):
    youtube_link: str = Field(max_length=300)


class ClientSecretBody(BaseModel):
    content: str = Field(max_length=50000)


class _LoginLimiter:
    """5 wrong passwords in 10 minutes from one address -> wait."""

    def __init__(self, limit: int = 5, window: float = 600):
        self.limit, self.window = limit, window
        self.failures: dict[str, list[float]] = {}

    def blocked(self, ip: str) -> bool:
        now = time.monotonic()
        recent = [t for t in self.failures.get(ip, []) if now - t < self.window]
        self.failures[ip] = recent
        return len(recent) >= self.limit

    def fail(self, ip: str) -> None:
        self.failures.setdefault(ip, []).append(time.monotonic())

    def reset(self, ip: str) -> None:
        self.failures.pop(ip, None)


def _video_json(v: dict[str, Any], thumbs_dir: Path) -> dict[str, Any]:
    return {
        "id": v["id"],
        "shortcode": v["shortcode"],
        "source_url": v["source_url"],
        "status": v["status"],
        "privacy": v["privacy"],
        "auto_upload": v["auto_upload"],
        "channel_id": v.get("channel_id"),
        "channel_title": v.get("channel_title"),
        "is_asmr": v["is_asmr"],
        "asmr_confidence": v["asmr_confidence"],
        "asmr_triggers": v["asmr_triggers"],
        "ai_summary": v["ai_summary"],
        "ig_uploader": v["ig_uploader"],
        "duration": v["duration"],
        "title": v["title"],
        "description": v["description"],
        "tags": v["tags"],
        "youtube_id": v["youtube_id"],
        "youtube_url": f"https://youtu.be/{v['youtube_id']}" if v["youtube_id"] else None,
        "progress": v["progress"],
        "note": v["error"],
        "duplicate_of": v["duplicate_of"],
        "duplicate_hits": v["duplicate_hits"],
        "has_file": bool(v["file_path"] and Path(v["file_path"]).exists()),
        "has_thumb": (thumbs_dir / f"{v['id']}.jpg").exists(),
        "created_at": v["created_at"],
        "uploaded_at": v["uploaded_at"],
    }


def _duplicate_message(v: dict[str, Any]) -> str:
    status = v["status"]
    if status == "uploaded":
        return f"Already on YouTube (uploaded {(v['uploaded_at'] or '')[:10]}). Not uploaded again."
    if status == "duplicate":
        return "Already checked before: it is the same video as another one in your list."
    if status in ("failed", "interrupted"):
        return "Already in your list but it failed - use Retry on that row."
    if status == "review":
        return "Already in your list, waiting for your review."
    return "Already in the queue."


def create_app(settings: Settings, *, db: Database | None = None, youtube: YouTubeClient | None = None,
               pipeline: Pipeline | None = None, start_worker: bool = True) -> FastAPI:
    settings.ensure_dirs()
    db = db or Database(settings.db_path)
    youtube = youtube or YouTubeClient(settings, db=db)
    pipeline = pipeline or Pipeline(settings, db, youtube)
    limiter = _LoginLimiter()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if start_worker:
            pipeline.start()
        yield
        if start_worker:
            pipeline.stop()

    app = FastAPI(title="Insta to YouTube", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.db, app.state.pipeline, app.state.youtube = db, pipeline, youtube
    app.add_middleware(SessionMiddleware, secret_key=settings.session_secret, session_cookie="insta2yt_session",
                       same_site="lax", max_age=7 * 24 * 3600)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
        return response

    app.mount("/static", StaticFiles(directory=WEB / "static"), name="static")

    def is_admin(request: Request) -> bool:
        return request.session.get("admin") is True

    def require_admin(request: Request) -> None:
        if not is_admin(request):
            raise HTTPException(401, "Please log in.")

    def get_video(video_id: int) -> dict[str, Any]:
        v = db.get(video_id)
        if not v:
            raise HTTPException(404, "Video not found.")
        return v

    def action(fn, *args) -> Any:
        try:
            return fn(*args)
        except ActionError as exc:
            raise HTTPException(409, str(exc)) from exc

    # ---------- pages ----------
    @app.get("/", include_in_schema=False)
    def index(request: Request):
        if not is_admin(request):
            return RedirectResponse("/login", status_code=303)
        return FileResponse(WEB / "index.html")

    @app.get("/login", include_in_schema=False)
    def login_page():
        return FileResponse(WEB / "login.html")

    # ---------- login ----------
    @app.post("/api/login")
    def login(body: LoginBody, request: Request):
        ip = request.client.host if request.client else "?"
        if limiter.blocked(ip):
            raise HTTPException(429, "Too many wrong passwords. Wait 10 minutes.")
        if not hmac.compare_digest(body.password.encode(), settings.admin_password.encode()):
            limiter.fail(ip)
            raise HTTPException(401, "Wrong password.")
        limiter.reset(ip)
        request.session.clear()
        request.session["admin"] = True
        return {"ok": True}

    @app.post("/api/logout")
    def logout(request: Request):
        request.session.clear()
        return {"ok": True}

    def ai_status() -> dict[str, Any]:
        if settings.ai_provider == "local":
            ready, message = check_ready(settings)
            return {"provider": "local", "model": settings.local_ai_model, "ready": ready, "message": message}
        if settings.ai_provider == "claude":
            return {"provider": "claude", "model": settings.claude_model, "ready": True, "message": ""}
        return {"provider": "free", "model": None, "ready": True, "message": ""}

    # ---------- dashboard data ----------
    @app.get("/api/status", dependencies=[Depends(require_admin)])
    def status():
        channels = youtube.list_channels() if hasattr(youtube, "list_channels") else db.list_channels()
        active_ch = youtube.get_active_channel() if hasattr(youtube, "get_active_channel") else db.get_active_channel()
        channel = youtube.channel() if youtube.connected else None
        active_title = active_ch["title"] if active_ch else (channel[1] if channel else None)
        active_id = active_ch["channel_id"] if active_ch else (channel[0] if channel else None)
        return {
            "youtube": {
                "configured": youtube.configured,
                "connected": youtube.connected,
                "channel_title": active_title,
                "channel_url": f"https://www.youtube.com/channel/{active_id}" if active_id else None,
                "channel_id": active_id,
                "channel_thumbnail": active_ch.get("thumbnail_url") if active_ch else None,
                "channels": channels,
                "redirect_uri": settings.youtube_redirect_uri,
            },
            "ai": ai_status(),
            "defaults": {"privacy": settings.default_privacy, "auto_upload": settings.auto_upload},
        }

    @app.get("/api/videos", dependencies=[Depends(require_admin)])
    def list_videos():
        return {
            "stats": db.stats(),
            "videos": [_video_json(v, settings.thumbs_dir) for v in db.list_all()],
        }

    @app.post("/api/videos", dependencies=[Depends(require_admin)])
    def add_videos(body: AddBody):
        if not body.rights_confirmed:
            raise HTTPException(400, "Please confirm you own these videos or have permission to repost them.")
        lines = [ln.strip() for ln in body.links.replace(",", "\n").split() if ln.strip()]
        if not lines:
            raise HTTPException(400, "Paste at least one Instagram link.")
        if len(lines) > MAX_LINKS_PER_ADD:
            raise HTTPException(400, f"Please add at most {MAX_LINKS_PER_ADD} links at a time.")

        target_channel_id = body.channel_id
        target_channel_title = None
        active = youtube.get_active_channel() if hasattr(youtube, "get_active_channel") else db.get_active_channel()
        if not target_channel_id and active:
            target_channel_id = active.get("channel_id")
            target_channel_title = active.get("title")
        elif target_channel_id:
            ch_list = youtube.list_channels() if hasattr(youtube, "list_channels") else db.list_channels()
            for c in ch_list:
                if c.get("channel_id") == target_channel_id:
                    target_channel_title = c.get("title")
                    break
        elif youtube.connected and hasattr(youtube, "channel"):
            ch = youtube.channel()
            if ch:
                target_channel_id = target_channel_id or ch[0]
                target_channel_title = ch[1]

        results = []
        for raw in lines:
            try:
                link = parse_instagram_link(raw)
            except InvalidLink as exc:
                results.append({"input": raw, "outcome": "invalid", "message": str(exc)})
                continue
            video, created = db.add_link(
                link.shortcode, link.url, body.auto_upload, body.privacy,
                channel_id=target_channel_id, channel_title=target_channel_title
            )
            if created:
                pipeline.enqueue("process", video["id"])
                results.append({"input": raw, "outcome": "added", "video_id": video["id"],
                                "message": "Added to the queue."})
            else:
                results.append({
                    "input": raw, "outcome": "duplicate", "video_id": video["id"],
                    "message": _duplicate_message(video),
                    "youtube_url": f"https://youtu.be/{video['youtube_id']}" if video["youtube_id"] else None,
                })
        return {"results": results}

    @app.get("/api/videos/{video_id}/thumb", dependencies=[Depends(require_admin)])
    def thumb(video_id: int):
        path = settings.thumbs_dir / f"{int(video_id)}.jpg"
        if not path.exists():
            raise HTTPException(404, "No picture yet.")
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})

    @app.patch("/api/videos/{video_id}", dependencies=[Depends(require_admin)])
    def edit_video(video_id: int, body: EditBody):
        get_video(video_id)
        channel_title = None
        if body.channel_id and hasattr(youtube, "list_channels"):
            for c in youtube.list_channels():
                if c.get("channel_id") == body.channel_id:
                    channel_title = c.get("title")
                    break
        action(pipeline.save_edits, video_id, body.title, body.description, body.tags, body.privacy,
               body.channel_id, channel_title)
        return _video_json(get_video(video_id), settings.thumbs_dir)

    @app.post("/api/videos/{video_id}/upload", dependencies=[Depends(require_admin)])
    def upload_video(video_id: int, body: EditBody):
        get_video(video_id)
        channel_title = None
        if body.channel_id and hasattr(youtube, "list_channels"):
            for c in youtube.list_channels():
                if c.get("channel_id") == body.channel_id:
                    channel_title = c.get("title")
                    break
        action(pipeline.save_edits, video_id, body.title, body.description, body.tags, body.privacy,
               body.channel_id, channel_title)
        action(pipeline.approve, video_id)
        return {"ok": True}

    @app.post("/api/videos/{video_id}/retry", dependencies=[Depends(require_admin)])
    def retry_video(video_id: int):
        get_video(video_id)
        step = action(pipeline.retry, video_id)
        return {"ok": True, "step": step}

    @app.post("/api/videos/{video_id}/mark-uploaded", dependencies=[Depends(require_admin)])
    def mark_uploaded(video_id: int, body: MarkUploadedBody):
        get_video(video_id)
        try:
            yt_id = parse_youtube_id(body.youtube_link)
        except InvalidLink as exc:
            raise HTTPException(400, str(exc)) from exc
        action(pipeline.mark_uploaded, video_id, yt_id)
        return {"ok": True}

    @app.delete("/api/videos/{video_id}", dependencies=[Depends(require_admin)])
    def delete_video(video_id: int):
        get_video(video_id)
        action(pipeline.delete, video_id)
        return {"ok": True}

    # ---------- Channel management ----------
    @app.get("/api/channels", dependencies=[Depends(require_admin)])
    def get_channels():
        if hasattr(youtube, "list_channels"):
            channels = youtube.list_channels()
            if channels:
                return {"channels": channels}
        return {"channels": db.list_channels()}

    @app.post("/api/channels/{channel_id}/select", dependencies=[Depends(require_admin)])
    def select_channel(channel_id: str):
        if hasattr(youtube, "set_active_channel"):
            ok = youtube.set_active_channel(channel_id)
        else:
            ok = db.set_active_channel(channel_id)
        if not ok:
            raise HTTPException(404, "Channel not found.")
        return {"ok": True}

    @app.delete("/api/channels/{channel_id}", dependencies=[Depends(require_admin)])
    def delete_channel(channel_id: str):
        if hasattr(youtube, "disconnect"):
            youtube.disconnect(channel_id=channel_id)
        else:
            db.delete_channel(channel_id)
        return {"ok": True}

    @app.post("/api/client-secret", dependencies=[Depends(require_admin)])
    def save_client_secret(body: ClientSecretBody):
        content = body.content.strip()
        try:
            parsed = json.loads(content)
            if not isinstance(parsed, dict) or ("installed" not in parsed and "web" not in parsed):
                raise ValueError("JSON must contain 'installed' or 'web' OAuth credentials.")
        except Exception as exc:
            raise HTTPException(400, f"Invalid client secret JSON: {exc}")
        f = settings.google_client_secret_file
        if not f:
            f = settings.data_dir / "client_secret.json"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(content, encoding="utf-8")
        return {"ok": True}

    # ---------- YouTube connection ----------
    @app.get("/youtube/connect", include_in_schema=False)
    def youtube_connect(request: Request):
        if not is_admin(request):
            return RedirectResponse("/login", status_code=303)
        try:
            return RedirectResponse(youtube.start_sign_in(), status_code=303)
        except YouTubeError as exc:
            return RedirectResponse(f"/?notice={quote(str(exc))}", status_code=303)

    @app.get("/youtube/callback", include_in_schema=False)
    def youtube_callback(request: Request, state: str = "", code: str = "", error: str = ""):
        if not is_admin(request):
            return RedirectResponse("/login", status_code=303)
        if error or not code:
            return RedirectResponse(f"/?notice={quote('YouTube connection was cancelled.')}", status_code=303)
        try:
            res = youtube.finish_sign_in(state, str(request.url))
            channel_name = res[1] if res else ""
            msg = f"Connected to YouTube channel '{channel_name}'." if channel_name else "YouTube connected."
        except Exception as exc:  # show any Google sign-in problem on the page
            log.warning("YouTube sign-in failed: %s", exc)
            return RedirectResponse(f"/?notice={quote(f'YouTube connection failed: {exc}')}", status_code=303)
        return RedirectResponse(f"/?notice={quote(msg)}", status_code=303)

    @app.post("/api/youtube/disconnect", dependencies=[Depends(require_admin)])
    def youtube_disconnect():
        youtube.disconnect()
        return {"ok": True}

    return app
