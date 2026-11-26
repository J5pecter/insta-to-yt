"""Database models initialization and table creation."""
from __future__ import annotations

import logging
from sqlalchemy import select

from ..core.database import Base, engine, db_session
from ..core.config import settings
from ..security.crypto import hash_password
from .entities import (
    User,
    SocialAccount,
    SourceMedia,
    MediaAsset,
    MediaVariant,
    ContentDraft,
    PublishingIntent,
    PublicationTarget,
    Job,
    Automation,
    AutomationRun,
    AnalyticsSnapshot,
    Notification,
    AuditLog,
    Setting,
    Backup,
    PublishingPreset,
)

logger = logging.getLogger("socialrelay.models")


def init_db() -> None:
    """Create all tables and seed default admin user if missing."""
    Base.metadata.create_all(bind=engine)
    with db_session() as session:
        admin = session.execute(select(User).where(User.email == settings.ADMIN_EMAIL)).scalars().first()
        if not admin:
            admin = User(
                email=settings.ADMIN_EMAIL,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                role="admin",
                timezone=settings.USER_TIMEZONE,
            )
            session.add(admin)
            session.commit()
            logger.info(f"Initialized admin user: {settings.ADMIN_EMAIL}")

        default_preset = session.execute(select(PublishingPreset).where(PublishingPreset.is_default == True)).scalars().first()
        if not default_preset:
            default_preset = PublishingPreset(
                user_id=admin.id,
                name="Instagram to YouTube + Instagram",
                is_default=True,
                visibility=settings.DEFAULT_PRIVACY,
                youtube_category=settings.YOUTUBE_CATEGORY_ID,
                made_for_kids=settings.MADE_FOR_KIDS,
                source_attribution=settings.INCLUDE_SOURCE_CREDIT,
            )
            session.add(default_preset)
            session.commit()
            logger.info("Seeded default publishing preset: Instagram to YouTube + Instagram")
