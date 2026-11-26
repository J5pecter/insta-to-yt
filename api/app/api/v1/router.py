"""API v1 master router aggregating all feature routers."""
from __future__ import annotations

from fastapi import APIRouter

from .accounts import router as accounts_router
from .auth import router as auth_router
from .automations import router as automations_router
from .drafts import router as drafts_router
from .imports import router as imports_router
from .jobs import router as jobs_router
from .management import router as management_router
from .media import router as media_router
from .presets import router as presets_router
from .publishing import router as publishing_router
from .quick_publish import router as quick_publish_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(imports_router)
api_v1_router.include_router(media_router)
api_v1_router.include_router(drafts_router)
api_v1_router.include_router(accounts_router)
api_v1_router.include_router(publishing_router)
api_v1_router.include_router(presets_router)
api_v1_router.include_router(quick_publish_router)
api_v1_router.include_router(jobs_router)
api_v1_router.include_router(automations_router)
api_v1_router.include_router(management_router)
