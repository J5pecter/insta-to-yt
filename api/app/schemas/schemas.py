"""Pydantic schemas for SocialRelay API v1."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# --- Auth ---
class LoginRequest(BaseModel):
    email: Optional[str] = "admin@socialrelay.local"
    password: str = Field(min_length=6, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    timezone: str


# --- Imports ---
class ImportUrlRequest(BaseModel):
    url: str = Field(max_length=2048)
    rights_confirmed: bool = True


class BulkImportRequest(BaseModel):
    links: str = Field(max_length=50000)
    rights_confirmed: bool = True


# --- Media & Variants ---
class MediaProcessRequest(BaseModel):
    profile: Literal["vertical_9_16", "original"] = "vertical_9_16"
    crop_mode: Literal["fit_blur", "center_crop", "fit_black"] = "fit_blur"
    trim_start: Optional[float] = None
    trim_end: Optional[float] = None
    mute: bool = False


class ThumbnailExtractRequest(BaseModel):
    timestamp: float = 1.0
    width: int = 1080


# --- Drafts & Metadata ---
class DraftUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = Field(default=None, max_length=5000)
    caption: Optional[str] = Field(default=None, max_length=2200)
    hashtags: Optional[List[str]] = None
    category_id: Optional[str] = "24"
    language: Optional[str] = "en"


class MetadataConvertRequest(BaseModel):
    caption: str
    mode: Literal["exact_copy", "clean_title", "first_sentence", "ai_generated"] = "first_sentence"
    attribution: Optional[str] = ""
    default_tags: Optional[List[str]] = None


# --- Publishing ---
class PublishingCreateRequest(BaseModel):
    draft_id: int
    account_ids: List[int] = Field(min_length=1)
    scheduled_at: Optional[datetime] = None  # None = immediate execution
    privacy: Literal["private", "unlisted", "public"] = "private"
    made_for_kids: bool = False


# --- Automations ---
class AutomationCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = ""
    workflow_definition: Dict[str, Any]
    enabled: bool = True


class AutomationDryRunRequest(BaseModel):
    workflow_definition: Dict[str, Any]
    sample_input: Optional[Dict[str, Any]] = None


# --- Jobs ---
class JobRetryRequest(BaseModel):
    reason: Optional[str] = "Manual retry from dashboard"
