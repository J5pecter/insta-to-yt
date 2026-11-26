"""Social account management service for SocialRelay.
Handles account storage, token refresh status, permissions, and health audits.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ...models.entities import SocialAccount, User

logger = logging.getLogger("socialrelay.accounts")


class AccountService:
    def __init__(self, db: Session):
        self.db = db

    def list_accounts(self, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """List all connected accounts with health and capability indicators."""
        stmt = select(SocialAccount)
        if user_id:
            stmt = stmt.where(SocialAccount.user_id == user_id)
        accounts = self.db.execute(stmt).scalars().all()

        results = []
        now = datetime.now(timezone.utc)
        for acc in accounts:
            is_expired = False
            if acc.token_expiry and acc.token_expiry < now:
                is_expired = True

            status = acc.connection_status
            if is_expired and status == "connected":
                status = "expired"

            perms = []
            if acc.permissions:
                try:
                    perms = json.loads(acc.permissions)
                except Exception:
                    perms = [acc.permissions]

            results.append({
                "id": acc.id,
                "platform": acc.platform,
                "account_id": acc.external_account_id,
                "account_name": acc.account_name,
                "custom_url": acc.custom_url,
                "avatar_url": acc.avatar_url,
                "connection_status": status,
                "is_expired": is_expired,
                "token_expiry": acc.token_expiry.isoformat() if acc.token_expiry else None,
                "permissions": perms,
                "last_published_at": acc.last_published_at.isoformat() if acc.last_published_at else None,
                "created_at": acc.created_at.isoformat() if acc.created_at else None,
            })
        return results

    def get_account(self, account_id: int) -> Optional[SocialAccount]:
        """Fetch account by ID."""
        return self.db.execute(select(SocialAccount).where(SocialAccount.id == account_id)).scalars().first()

    def save_youtube_account(self, info: Dict[str, Any], user_id: int = 1) -> SocialAccount:
        """Upsert a connected YouTube account."""
        channel_id = info["channel_id"]
        stmt = select(SocialAccount).where(
            SocialAccount.platform == "youtube",
            SocialAccount.external_account_id == channel_id,
        )
        acc = self.db.execute(stmt).scalars().first()
        now = datetime.now(timezone.utc)

        expiry_dt = None
        if info.get("expiry"):
            try:
                expiry_dt = datetime.fromisoformat(info["expiry"])
            except Exception:
                pass

        if not acc:
            acc = SocialAccount(
                user_id=user_id,
                platform="youtube",
                external_account_id=channel_id,
                account_name=info["title"],
                custom_url=info.get("custom_url"),
                avatar_url=info.get("avatar_url"),
                encrypted_access_token=info["encrypted_token"],
                token_expiry=expiry_dt,
                permissions=json.dumps(info.get("permissions", [])),
                connection_status="connected",
            )
            self.db.add(acc)
        else:
            acc.account_name = info["title"]
            acc.custom_url = info.get("custom_url")
            acc.avatar_url = info.get("avatar_url")
            acc.encrypted_access_token = info["encrypted_token"]
            acc.token_expiry = expiry_dt
            acc.connection_status = "connected"
            acc.updated_at = now

        self.db.commit()
        self.db.refresh(acc)
        return acc

    def save_instagram_account(self, info: Dict[str, Any], user_id: int = 1) -> SocialAccount:
        """Upsert a connected Instagram account."""
        ig_id = str(info["account_id"])
        stmt = select(SocialAccount).where(
            SocialAccount.platform == "instagram",
            SocialAccount.external_account_id == ig_id,
        )
        acc = self.db.execute(stmt).scalars().first()
        now = datetime.now(timezone.utc)

        if not acc:
            acc = SocialAccount(
                user_id=user_id,
                platform="instagram",
                external_account_id=ig_id,
                account_name=info["username"],
                custom_url=f"https://instagram.com/{info['username']}",
                avatar_url=info.get("avatar_url"),
                encrypted_access_token=info["encrypted_token"],
                permissions=json.dumps(["instagram_basic", "instagram_content_publish"]),
                connection_status="connected",
            )
            self.db.add(acc)
        else:
            acc.account_name = info["username"]
            acc.avatar_url = info.get("avatar_url")
            acc.encrypted_access_token = info["encrypted_token"]
            acc.connection_status = "connected"
            acc.updated_at = now

        self.db.commit()
        self.db.refresh(acc)
        return acc

    def disconnect_account(self, account_id: int) -> bool:
        """Disconnect and remove an account."""
        acc = self.get_account(account_id)
        if not acc:
            return False
        self.db.delete(acc)
        self.db.commit()
        return True
