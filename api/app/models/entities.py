"""SQLAlchemy ORM models for SocialRelay."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from ..core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="admin")
    timezone = Column(String(100), nullable=False, default="Asia/Kolkata")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    social_accounts = relationship("SocialAccount", back_populates="user", cascade="all, delete-orphan")
    source_media = relationship("SourceMedia", back_populates="user")
    content_drafts = relationship("ContentDraft", back_populates="user")
    automations = relationship("Automation", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")


class SocialAccount(Base):
    __tablename__ = "social_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(50), nullable=False, index=True)  # 'youtube', 'instagram'
    external_account_id = Column(String(255), nullable=False, index=True)
    account_name = Column(String(255), nullable=False)
    custom_url = Column(String(255), nullable=True)
    avatar_url = Column(String(1024), nullable=True)
    encrypted_access_token = Column(Text, nullable=False)
    encrypted_refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime(timezone=True), nullable=True)
    permissions = Column(Text, nullable=True)  # JSON list of granted scopes
    connection_status = Column(String(50), nullable=False, default="connected")  # 'connected', 'expired', 'revoked'
    last_published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="social_accounts")
    publication_targets = relationship("PublicationTarget", back_populates="social_account")


class SourceMedia(Base):
    __tablename__ = "source_media"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(50), nullable=False)  # 'instagram', 'direct_upload', 'batch_csv'
    source_url = Column(String(2048), nullable=True, index=True)
    external_media_id = Column(String(255), nullable=True, index=True)
    source_account = Column(String(255), nullable=True)
    original_caption = Column(Text, nullable=True)
    source_attribution = Column(String(512), nullable=True)
    source_timestamp = Column(DateTime(timezone=True), nullable=True)
    rights_status = Column(String(50), nullable=False, default="creator_authorized")  # 'owned', 'creator_authorized', 'licensed'
    rights_reference = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="source_media")
    assets = relationship("MediaAsset", back_populates="source_media", cascade="all, delete-orphan")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_media_id = Column(Integer, ForeignKey("source_media.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_path = Column(String(1024), nullable=False)
    file_hash = Column(String(64), nullable=False, index=True)  # SHA-256
    mime_type = Column(String(100), nullable=False, default="video/mp4")
    duration = Column(Float, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    fps = Column(Float, nullable=True)
    file_size = Column(Integer, nullable=False)  # bytes
    video_codec = Column(String(50), nullable=True)
    audio_codec = Column(String(50), nullable=True)
    bitrate = Column(Integer, nullable=True)
    is_vertical = Column(Boolean, default=True)
    thumbnail_path = Column(String(1024), nullable=True)
    processing_status = Column(String(50), nullable=False, default="ready")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    source_media = relationship("SourceMedia", back_populates="assets")
    variants = relationship("MediaVariant", back_populates="asset", cascade="all, delete-orphan")
    drafts = relationship("ContentDraft", back_populates="media_asset")


class MediaVariant(Base):
    __tablename__ = "media_variants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    media_asset_id = Column(Integer, ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    output_profile = Column(String(50), nullable=False)  # 'vertical_1080x1920', 'original', 'trimmed'
    storage_path = Column(String(1024), nullable=False)
    file_hash = Column(String(64), nullable=True)
    codec = Column(String(50), nullable=False, default="h264")
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    duration = Column(Float, nullable=True)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("MediaAsset", back_populates="variants")


class ContentDraft(Base):
    __tablename__ = "content_drafts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    media_asset_id = Column(Integer, ForeignKey("media_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)  # Max 100 for YouTube, allowance for editing
    description = Column(Text, nullable=True)   # YouTube description
    caption = Column(Text, nullable=True)       # Instagram caption
    hashtags = Column(Text, nullable=True)      # JSON list of tags
    language = Column(String(10), nullable=True, default="en")
    category_id = Column(String(10), nullable=True, default="24")
    metadata_version = Column(Integer, nullable=False, default=1)
    approval_status = Column(String(50), nullable=False, default="draft")  # 'draft', 'awaiting_approval', 'approved'
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="content_drafts")
    media_asset = relationship("MediaAsset", back_populates="drafts")
    publishing_intents = relationship("PublishingIntent", back_populates="draft", cascade="all, delete-orphan")


class PublishingIntent(Base):
    __tablename__ = "publishing_intents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    draft_id = Column(Integer, ForeignKey("content_drafts.id", ondelete="CASCADE"), nullable=False, index=True)
    approved_metadata_snapshot = Column(Text, nullable=False)  # JSON snapshot of metadata at approval
    scheduled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    approval_timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    status = Column(String(50), nullable=False, default="APPROVED")  # 'APPROVED', 'SCHEDULED', 'QUEUED', 'PUBLISHED', 'PARTIALLY_PUBLISHED', 'FAILED'
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    draft = relationship("ContentDraft", back_populates="publishing_intents")
    targets = relationship("PublicationTarget", back_populates="publishing_intent", cascade="all, delete-orphan")


class PublicationTarget(Base):
    __tablename__ = "publication_targets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    publishing_intent_id = Column(Integer, ForeignKey("publishing_intents.id", ondelete="CASCADE"), nullable=False, index=True)
    social_account_id = Column(Integer, ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    idempotency_key = Column(String(128), unique=True, nullable=False, index=True)
    platform_settings = Column(Text, nullable=True)  # JSON: privacy, audience, tags
    status = Column(String(50), nullable=False, default="QUEUED")  # 'QUEUED', 'UPLOADING', 'PLATFORM_PROCESSING', 'VERIFYING', 'PUBLISHED', 'FAILED', 'RECONCILIATION_REQUIRED'
    remote_upload_session = Column(String(512), nullable=True)
    remote_container_id = Column(String(255), nullable=True)
    remote_media_id = Column(String(255), nullable=True)
    published_url = Column(String(1024), nullable=True)
    error_message = Column(Text, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    publishing_intent = relationship("PublishingIntent", back_populates="targets")
    social_account = relationship("SocialAccount", back_populates="publication_targets")
    analytics_snapshots = relationship("AnalyticsSnapshot", back_populates="target", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_type = Column(String(100), nullable=False, index=True)  # 'media_import', 'video_process', 'publish_target', 'reconciliation'
    target_id = Column(Integer, nullable=True, index=True)     # ID of target entity (e.g. publication_targets.id)
    status = Column(String(50), nullable=False, default="QUEUED", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    run_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    progress = Column(Integer, nullable=False, default=0)
    lease_owner = Column(String(100), nullable=True)
    lease_expiry = Column(DateTime(timezone=True), nullable=True)
    heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    error_code = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    payload = Column(Text, nullable=True)  # JSON parameters
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Automation(Base):
    __tablename__ = "automations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    workflow_definition = Column(Text, nullable=False)  # JSON DAG nodes and edges
    enabled = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="automations")
    runs = relationship("AutomationRun", back_populates="automation", cascade="all, delete-orphan")


class AutomationRun(Base):
    __tablename__ = "automation_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    automation_id = Column(Integer, ForeignKey("automations.id", ondelete="CASCADE"), nullable=False, index=True)
    trigger_reference = Column(String(255), nullable=True)
    execution_status = Column(String(50), nullable=False, default="running")  # 'running', 'completed', 'failed', 'dry_run'
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    log_output = Column(Text, nullable=True)  # JSON log steps

    automation = relationship("Automation", back_populates="runs")


class AnalyticsSnapshot(Base):
    __tablename__ = "analytics_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    publication_target_id = Column(Integer, ForeignKey("publication_targets.id", ondelete="CASCADE"), nullable=False, index=True)
    collected_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    available_metrics = Column(Text, nullable=False)  # JSON {views, likes, comments, shares}
    provider_metadata = Column(Text, nullable=True)  # JSON

    target = relationship("PublicationTarget", back_populates="analytics_snapshots")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notification_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False, default="info")  # 'info', 'warning', 'error', 'success'
    message = Column(Text, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="notifications")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(100), nullable=False, index=True)  # 'PUBLISH_INITIATED', 'STATE_TRANSITION', etc.
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=True)
    sanitized_details = Column(Text, nullable=True)  # JSON
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="audit_logs")


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(Text, nullable=False)  # JSON or string value
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Backup(Base):
    __tablename__ = "backups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    storage_path = Column(String(1024), nullable=False)
    checksum = Column(String(64), nullable=False)  # SHA-256
    backup_type = Column(String(50), nullable=False, default="full")  # 'db_only', 'full'
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    restore_status = Column(String(50), nullable=True)  # 'verified', 'restored'


class PublishingPreset(Base):
    __tablename__ = "publishing_presets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(150), nullable=False, default="Instagram to YouTube + Instagram")
    youtube_account_id = Column(Integer, nullable=True)
    instagram_account_id = Column(Integer, nullable=True)
    title_mode = Column(String(50), nullable=False, default="mode_a")  # mode_a, mode_b, mode_c, mode_d
    preserve_caption = Column(Boolean, nullable=False, default=True)
    description_mode = Column(String(50), nullable=False, default="full_with_attribution")
    hashtag_handling = Column(String(50), nullable=False, default="preserve_and_limit")
    video_profile = Column(String(50), nullable=False, default="vertical_blur_1080x1920")
    source_attribution = Column(Boolean, nullable=False, default=True)
    youtube_category = Column(String(20), nullable=False, default="24")
    visibility = Column(String(20), nullable=False, default="private")
    made_for_kids = Column(Boolean, nullable=False, default=False)
    synthetic_content = Column(Boolean, nullable=False, default=False)
    duplicate_detection = Column(Boolean, nullable=False, default=True)
    schedule_preference = Column(String(50), nullable=False, default="immediate")
    retry_policy = Column(String(50), nullable=False, default="exponential_backoff")
    rights_confirmation_required = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
