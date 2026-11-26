"""Social accounts connection, readiness, and guided OAuth setup endpoints for SocialRelay."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...core.config import settings
from ...core.database import get_db
from ...models.entities import SocialAccount, User
from ...providers.instagram.adapter import instagram_adapter
from ...providers.youtube.adapter import youtube_adapter
from ...services.accounts.credentials import (
    get_google_credential_status,
    get_instagram_credential_status,
    save_google_credentials,
    save_instagram_credentials,
)
from ...services.accounts.service import AccountService
from ...services.storage.manager import storage_manager

router = APIRouter(prefix="/accounts", tags=["Accounts"])


class GoogleSecretPayload(BaseModel):
    content: str


class InstagramCredentialPayload(BaseModel):
    app_id: str
    app_secret: str
    login_mode: str = "instagram_login"


@router.get("")
def get_accounts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all connected accounts."""
    service = AccountService(db)
    return service.list_accounts(user_id=current_user.id)


@router.get("/readiness")
def get_readiness(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return global account & system readiness status with actionable guidance."""
    yt_cred = get_google_credential_status(db)
    ig_cred = get_instagram_credential_status(db)
    service = AccountService(db)
    accounts = service.list_accounts(user_id=current_user.id)
    storage = storage_manager.get_storage_stats()

    yt_accounts = [a for a in accounts if a["platform"] == "youtube"]
    ig_accounts = [a for a in accounts if a["platform"] == "instagram"]
    connected_yt = [a for a in yt_accounts if a["connection_status"] == "connected" and not a["is_expired"]]
    connected_ig = [a for a in ig_accounts if a["connection_status"] == "connected" and not a["is_expired"]]
    expired_accounts = [a for a in accounts if a["is_expired"] or a["connection_status"] == "expired"]

    guidance = []
    if not yt_cred["configured"]:
        guidance.append({
            "platform": "youtube",
            "severity": "warning",
            "title": "YouTube OAuth credentials not configured",
            "action": "Open Accounts -> YouTube Setup Wizard and upload client_secret.json.",
        })
    elif not yt_accounts:
        guidance.append({
            "platform": "youtube",
            "severity": "info",
            "title": "No YouTube channel connected",
            "action": "Click Connect YouTube in Accounts to authorize your channel.",
        })

    if not ig_cred["configured"]:
        guidance.append({
            "platform": "instagram",
            "severity": "warning",
            "title": "Instagram App credentials not configured",
            "action": "Open Accounts -> Instagram Setup Wizard and enter your Meta App ID & Secret.",
        })
    elif not ig_accounts:
        guidance.append({
            "platform": "instagram",
            "severity": "info",
            "title": "No Instagram Professional account connected",
            "action": "Click Connect Instagram in Accounts to authorize your Creator/Business account.",
        })

    if expired_accounts:
        guidance.append({
            "platform": expired_accounts[0]["platform"],
            "severity": "error",
            "title": "Account authorization expired",
            "action": "Reconnect the expired account in Accounts to resume automated publishing.",
        })

    storage_ok = storage.get("free_disk_mb", 9999) >= settings.DISK_FREE_MIN_MB
    if not storage_ok:
        state = "storage_unavailable"
        label = "Low disk space — publishing paused"
    elif expired_accounts and not (connected_yt or connected_ig):
        state = "account_authorization_expired"
        label = "Account authorization expired"
    elif not (connected_yt or connected_ig):
        state = "initial_setup_required"
        label = "Initial setup required"
    else:
        state = "ready_to_publish"
        label = "Ready to publish"

    return {
        "state": state,
        "label": label,
        "ready": state == "ready_to_publish",
        "youtube": {
            "credentials": yt_cred,
            "connected_count": len(connected_yt),
            "accounts": yt_accounts,
        },
        "instagram": {
            "credentials": ig_cred,
            "connected_count": len(connected_ig),
            "accounts": ig_accounts,
        },
        "worker_status": "active",
        "storage_ok": storage_ok,
        "guidance": guidance,
    }


@router.post("/{platform}/connect")
def initiate_connect(
    platform: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate authorization URL for YouTube or Instagram."""
    p = platform.lower()
    if p == "youtube":
        try:
            auth_url, state = youtube_adapter.get_authorization_url(db=db)
            return {"platform": "youtube", "auth_url": auth_url, "state": state}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif p == "instagram":
        try:
            auth_url, state = instagram_adapter.get_authorization_url(db=db)
            return {"platform": "instagram", "auth_url": auth_url, "state": state}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")


@router.get("/{platform}/callback")
def oauth_callback(
    platform: str,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Handle OAuth redirect callback from YouTube or Meta."""
    if error:
        return RedirectResponse(url=f"/?tab=accounts&error={error}")
    if not code or not state:
        return RedirectResponse(url="/?tab=accounts&error=missing_code_or_state")

    p = platform.lower()
    service = AccountService(db)

    try:
        if p == "youtube":
            info = youtube_adapter.handle_oauth_callback(code, state, db=db)
            service.save_youtube_account(info)
            return RedirectResponse(url="/?tab=accounts&connected=youtube")
        elif p == "instagram":
            info = instagram_adapter.handle_oauth_callback(code, state, db=db)
            service.save_instagram_account(info)
            return RedirectResponse(url="/?tab=accounts&connected=instagram")
        else:
            return RedirectResponse(url=f"/?tab=accounts&error=unsupported_platform_{p}")
    except Exception as e:
        return RedirectResponse(url=f"/?tab=accounts&error={str(e)}")


@router.post("/{id}/test")
def test_account_connection(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify stored token status and expiration for a connected account."""
    acc = db.execute(select(SocialAccount).where(SocialAccount.id == id)).scalars().first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found.")
    now = datetime.now(timezone.utc)
    is_expired = bool(acc.token_expiry and acc.token_expiry < now)
    return {
        "id": acc.id,
        "platform": acc.platform,
        "account_name": acc.account_name,
        "status": "expired" if is_expired else acc.connection_status,
        "healthy": not is_expired and acc.connection_status == "connected",
        "checked_at": now.isoformat(),
    }


@router.delete("/{id}")
def disconnect_account(id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Disconnect and remove a social account."""
    service = AccountService(db)
    if not service.disconnect_account(id):
        raise HTTPException(status_code=404, detail="Account not found.")
    return {"status": "success", "message": "Account disconnected."}


@router.post("/youtube/credentials")
def save_google_client_secret(
    body: GoogleSecretPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate and securely save client_secret.json content for YouTube Data API."""
    try:
        masked = save_google_credentials(db, body.content, user_id=current_user.id)
        return {"status": "success", "message": "YouTube client credentials validated and encrypted.", "credentials": masked}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid credentials JSON: {e}")


@router.post("/youtube/credentials/file")
async def upload_google_client_secret_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload client_secret.json file directly for YouTube Data API integration."""
    try:
        raw_bytes = await file.read()
        if len(raw_bytes) > 65536:
            raise ValueError("Credential file is unexpectedly large.")
        raw_text = raw_bytes.decode("utf-8")
        masked = save_google_credentials(db, raw_text, user_id=current_user.id)
        return {"status": "success", "message": "YouTube client_secret.json uploaded and encrypted.", "credentials": masked}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {e}")


@router.post("/instagram/credentials")
def save_instagram_app_credentials(
    body: InstagramCredentialPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate and securely save Instagram App ID and App Secret."""
    try:
        masked = save_instagram_credentials(
            db,
            app_id=body.app_id,
            app_secret=body.app_secret,
            login_mode=body.login_mode,
            user_id=current_user.id,
        )
        return {"status": "success", "message": "Instagram App credentials encrypted and saved.", "credentials": masked}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save Instagram credentials: {e}")
