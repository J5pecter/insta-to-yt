# CLAUDE.md — SocialRelay Development Guide

## Project Overview
**SocialRelay** is a personal, self-hosted social media automation and cross-publishing platform. It allows users to import authorized Instagram Reels/videos or upload creator-authorized media, automatically process and optimize the video, prepare platform-tailored metadata (YouTube Shorts & Instagram Reels), and publish across connected accounts with a persistent scheduler, robust state machine, and visual automation builder.

## Core Rules & Non-Negotiable Standards
1. **Zero Mandatory Paid Subscriptions**: The core self-hosted application must run 100% on open-source, local, and free-tier components. Never introduce mandatory paid APIs, paid SaaS middleware, or cloud dependencies.
2. **Authorized Media Only**: Only import and republish content that is owned, licensed, or explicitly creator-authorized. Never scrape private accounts, bypass CAPTCHAs, or violate platform terms.
3. **No Fake Functionality**: Every button, setting, form, and navigation item in the UI must have real, working backend functionality. Never display fabricated analytics or fake progress.
4. **Resilient Publishing & Duplication Prevention**: Every publication target must have a deterministic idempotency key. Never blindly re-upload after an ambiguous timeout. If a remote state is uncertain, transition to `RECONCILIATION_REQUIRED`.
5. **Security First**: 
   - Store all OAuth tokens encrypted at rest using AES-GCM / Fernet with a master encryption key loaded from environment.
   - Enforce Argon2id password hashing for administrator accounts.
   - Guard against SSRF when validating external URLs.
   - Run FFmpeg commands using argument lists, never shell string interpolation.

## Repository Architecture
- `apps/web/`: React 19 + Vite + TypeScript + Tailwind CSS + Lucide Icons + React Router + TanStack Query.
- `api/app/`: FastAPI backend with SQLAlchemy, Pydantic, APScheduler, background workers, and modular provider adapters.
  - `api/v1/`: Versioned REST endpoints.
  - `auth/`: Argon2id, JWT/Session auth, cookie security.
  - `core/`: Config, database engine, events, exception handlers.
  - `models/`: SQLAlchemy 2.0 ORM models.
  - `schemas/`: Pydantic request and response schemas.
  - `services/`: Specialized services (imports, media, metadata, publishing, accounts, automations, analytics, notifications, storage).
  - `providers/`: Platform adapters (`youtube/`, `instagram/`).
  - `workers/`: Background job queue worker, lease manager, retry processor.
  - `scheduler/`: Persistent APScheduler instance.
  - `security/`: Fernet token encryption, SSRF protection, sanitization.
- `infrastructure/`: Dockerfiles, Docker Compose, Caddyfile, deployment scripts.
- `storage/`: Dedicated directories for `originals`, `processed`, `thumbnails`, `temporary`, and `backups`.
- `docs/`: Comprehensive architecture, workflow, deployment, and setup documentation.
- `.claude/skills/`: Reusable development skills.

## Common Commands
- **Run Backend**: `.venv\Scripts\python -m uvicorn api.app.main:app --host 0.0.0.0 --port 8000 --reload`
- **Run Worker**: `.venv\Scripts\python -m api.app.workers.runner`
- **Run Frontend**: `cd apps/web && npm run dev`
- **Build Frontend**: `cd apps/web && npm run build`
- **Run Pytest**: `.venv\Scripts\pytest tests api/tests`
- **Docker Compose**: `docker compose up -d --build`

## Development Skills
Use the skills in `.claude/skills/` for specific tasks:
- `architecture-review`
- `frontend-design`
- `responsive-ui-audit`
- `fastapi-development`
- `database-migrations`
- `instagram-integration`
- `youtube-integration`
- `oauth-security`
- `ffmpeg-processing`
- `automation-development`
- `job-reconciliation`
- `quality-assurance`
- `accessibility-audit`
- `deployment`
- `dependency-review`
- `backup-recovery`
