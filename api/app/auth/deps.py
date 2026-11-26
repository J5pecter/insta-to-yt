"""Authentication dependencies, token issuance, and session verification."""
from __future__ import annotations

import time
from typing import Optional

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.database import get_db
from ..models.entities import User
from ..security.crypto import create_signed_state, verify_signed_state

security = HTTPBearer(auto_error=False)
COOKIE_NAME = "socialrelay_session"


def create_session_token(user_id: int) -> str:
    """Generate a signed session token."""
    return create_signed_state(f"user_{user_id}", secret=settings.SESSION_SECRET)


def get_current_user(
    request: Request,
    bearer: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract authenticated user from HTTP-only cookie or Authorization header."""
    token = None
    if bearer and bearer.credentials:
        token = bearer.credentials
    elif COOKIE_NAME in request.cookies:
        token = request.cookies[COOKIE_NAME]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify signed token (valid for JWT_EXPIRE_MINUTES * 60)
    payload = verify_signed_state(
        token,
        max_age_seconds=settings.JWT_EXPIRE_MINUTES * 60,
        secret=settings.SESSION_SECRET,
    )
    if not payload or not payload.startswith("user_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please log in again.",
        )

    try:
        user_id = int(payload.split("_")[1])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session payload.")

    user = db.execute(select(User).where(User.id == user_id)).scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account not found.")

    return user
