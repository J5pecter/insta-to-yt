"""Authentication endpoints for SocialRelay."""
from __future__ import annotations

import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...auth.deps import COOKIE_NAME, create_session_token, get_current_user
from ...core.config import settings
from ...core.database import get_db
from ...models.entities import AuditLog, User
from ...schemas.schemas import ChangePasswordRequest, LoginRequest, UserResponse
from ...security.crypto import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])

_FAILED_LOGINS: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW_SEC = 300
_MAX_ATTEMPTS = 5


def _check_rate_limit(key: str) -> None:
    now = time.time()
    attempts = [t for t in _FAILED_LOGINS[key] if now - t < _RATE_WINDOW_SEC]
    _FAILED_LOGINS[key] = attempts
    if len(attempts) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please wait 5 minutes before trying again.",
        )


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Authenticate administrator with Argon2id and set secure session cookie."""
    email = body.email or settings.ADMIN_EMAIL
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{email}"
    _check_rate_limit(rate_key)

    user = db.execute(select(User).where(User.email == email)).scalars().first()

    if not user or not verify_password(body.password, user.password_hash):
        _FAILED_LOGINS[rate_key].append(time.time())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    _FAILED_LOGINS.pop(rate_key, None)
    token = create_session_token(user.id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.is_secure_cookies,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
    )

    # Log audit event
    audit = AuditLog(
        user_id=user.id,
        event_type="USER_LOGIN",
        entity_type="user",
        entity_id=str(user.id),
        sanitized_details='{"status": "success"}',
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "timezone": user.timezone,
        },
    }


@router.post("/logout")
def logout(response: Response, current_user: User = Depends(get_current_user)):
    """Clear session cookie and log out."""
    response.delete_cookie(COOKIE_NAME)
    return {"status": "success", "message": "Logged out successfully."}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return currently authenticated administrator details."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "timezone": current_user.timezone,
    }


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change user password with verification of current password."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password does not match.")

    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"status": "success", "message": "Password changed successfully."}
