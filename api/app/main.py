"""Master FastAPI application for SocialRelay.
Combines API v1, background scheduler, embedded worker thread, and Vite frontend serving.
"""
from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api.v1.router import api_v1_router
from .core.config import settings
from .models import init_db
from .scheduler.scheduler import relay_scheduler
from .workers.runner import WorkerRunner

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("socialrelay")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
WEB_DIST = PROJECT_ROOT / "apps" / "web" / "dist"
LEGACY_WEB = PROJECT_ROOT / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup:
    logger.info("Initializing SocialRelay database and tables...")
    init_db()

    logger.info("Starting background scheduler...")
    relay_scheduler.start()

    # Start background worker in daemon thread
    worker = WorkerRunner(worker_id="embedded_worker_1")
    worker_thread = threading.Thread(target=worker.start, kwargs={"poll_interval": 3.0}, daemon=True)
    worker_thread.start()
    logger.info("Embedded background worker thread started.")

    yield

    # Shutdown:
    logger.info("Shutting down SocialRelay scheduler...")
    relay_scheduler.shutdown()
    worker.stop()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Self-hosted social media automation and cross-publishing platform without mandatory subscriptions.",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan,
)

# CORS middleware
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add secure HTTP headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Include master API v1 router
app.include_router(api_v1_router)

# Mount Vite frontend distribution if built, otherwise mount fallback / legacy
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        file_path = WEB_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(WEB_DIST / "index.html")

elif LEGACY_WEB.exists():
    app.mount("/static", StaticFiles(directory=str(LEGACY_WEB / "static")), name="legacy_static")

    @app.get("/")
    async def serve_legacy_index():
        return FileResponse(LEGACY_WEB / "index.html")
