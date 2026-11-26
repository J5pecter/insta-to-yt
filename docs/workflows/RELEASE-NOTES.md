# SocialRelay v1.0.0 — Official Release Notes

**Release Date**: November 26, 2026  
**Codename**: Sovereign Broadcast  
**Version**: `1.0.0-GA`  

---

## 1. Executive Summary

SocialRelay v1.0.0 marks the official general availability release of the self-hosted social media automation and cross-publishing platform. Designed as a lifetime-free, zero-subscription alternative to commercial SaaS platforms such as Buffer, Metricool, and Zapier, SocialRelay enables creators, publishers, and developers to ingest, optimize, draft, schedule, and broadcast vertical short-form video across connected social platforms from a single private dashboard.

---

## 2. Key Highlights & Major Features

### 2.1 Charcoal Dark Mode Studio UI (`apps/web/`)
- Built with **React 18**, **Vite 6**, **TypeScript**, and **Tailwind CSS**.
- Premium charcoal dark theme (`#101218`, `#181B23`, `#20242E`, `#7C3AED` accent) designed for long creator studio sessions.
- Comprehensive feature modules: Dashboard, Ingest/Import, Content Studio, Media Library, Publishing Queue, Calendar, Accounts, Visual Automations, Analytics, Audit Logs, and System Management.
- Built-in responsive design adapting from desktop multi-column layouts to mobile viewport widths.

### 2.2 Intelligent 9:16 Video Transcoding Engine (FFmpeg 7.1)
- Bundled with a modern, self-contained Windows/Linux FFmpeg 7.1 binary requiring zero external system setup.
- Automatic conversion of horizontal (16:9) and square (1:1) video to standard vertical 9:16 (1080×1920) H.264 at 30 FPS.
- Three customizable framing modes:
  1. **Fit with Gaussian Blur**: Sharp original video layered over an aesthetically scaled, blurred background.
  2. **Center Crop**: Fills the entire 9:16 canvas with smart center framing.
  3. **Letterbox Fit**: Preserves the complete video bounded by solid black background bars.
- Sub-second video cover extraction and interactive timestamp scrubbing.

### 2.3 Official Social Platform Adapters
- **YouTube Shorts & Long-Form Video**:
  - Official Google OAuth 2.0 with PKCE and HMAC signed state tokens.
  - Chunked resumable video uploader transmitting in 5 MB segments with automatic retry on network drops.
  - YouTube Data API v3 quota tracker accounting for daily 10,000 unit allocations (pauses and resumes gracefully when limits are reached).
- **Instagram Reels**:
  - Meta Graph API Reels workflow: Media container creation, asynchronous status polling (`IN_PROGRESS` $\to$ `FINISHED`), and instant publication.
  - **Manual Export ZIP Package**: One-click download of the 1080×1920 MP4, cover image, and metadata file for zero-friction manual posting without tunnels or developer apps.

### 2.4 Local AI & Deterministic Metadata Generation
- Native integration with **Ollama** running local open-source models (Qwen 2.5, Llama 3.2, Gemma) on your own CPU/GPU with **zero paid OpenAI API tokens**.
- Four deterministic heuristic fallback engines (Modes A, B, C, D) ensuring high-quality titles and tags even if the AI service is offline.
- Strict platform length validation enforcing YouTube $\le 100$ character titles and $\le 5,000$ byte descriptions, and Instagram $\le 2,200$ character captions and $\le 30$ hashtags.

### 2.5 Resilient 20-State Machine & Persistent SQLite Queue
- Comprehensive state machine tracking every transition across 20 distinct states (`QUEUED` $\to$ `LEASED` $\to$ `PROCESSING` $\to$ `OPTIMIZING` $\to$ `READY` $\to$ `SCHEDULED` $\to$ `DISPATCHING` $\to$ `UPLOADING` $\to$ `PUBLISHED`).
- Database-backed transactional job queue with atomic worker leasing, heartbeat tracking, exponential backoff (1s, 2s, 4s... up to 3 retries), and deadlock reclamation.
- Persistent APScheduler running in `Asia/Kolkata` timezone with 15-second dispatch cycles and hourly maintenance routines.

### 2.6 Visual Automation DAG Builder
- Node-based workflow canvas connecting Triggers, Filters, Optimizations, Metadata Generation, and Multi-Platform Publishing nodes.
- Kahn's topological sort algorithm ensuring zero cycles before execution.
- Dry-run execution simulation for testing pipeline logic with mock data.
- Six bundled production templates: Instant Cross-Post, Scheduled Batch, Auto-Summarize & Publish, Safe Draft Review, Archive & Purge, and High-Engagement Repurposer.

### 2.7 Hardened Enterprise Security
- **Argon2id** password hashing with 64 MB memory cost.
- **Fernet AES-128** encrypted storage at rest for all social platform OAuth access and refresh tokens.
- **Hardened SSRF Guard** blocking RFC 1918 private subnets, loopback addresses (`127.0.0.1`), and AWS/GCP cloud metadata IP ranges (`169.254.169.254`).
- **Deterministic Idempotency Keys** `SHA256(draft_id + account_id + scheduled_time)` completely preventing duplicate social media posts.

---

## 3. Technology Stack & Component Versions

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Backend Framework** | FastAPI | `0.143.0` | High-performance async REST API & SPA host |
| **Database Engine** | SQLite 3 | `3.45.0+` | WAL mode, synchronous=NORMAL, foreign_keys=ON |
| **ORM** | SQLAlchemy | `2.0.44` | Modern declarative 2.0 typed models |
| **Validation** | Pydantic | `2.12.5` | Strict request/response schemas |
| **Task Scheduler** | APScheduler | `3.11.2` | Persistent background publishing schedule |
| **Media Engine** | FFmpeg (imageio-ffmpeg) | `7.1.0` | Video transcoding, scaling, filtering |
| **Frontend Framework** | React | `18.3.1` | Reactive SPA components |
| **Build Tool** | Vite | `6.4.1` | Sub-second HMR and production bundling |
| **Type Checker** | TypeScript | `5.7.3` | End-to-end type safety |
| **Styling** | Tailwind CSS | `3.4.17` | Charcoal dark design system |
| **Iconography** | Lucide React | `0.475.0` | Accessible SVG interface icons |

---

## 4. Test Suite Certification

The platform test suite was verified with **100% pass rate** across all 103 test cases:
- `tests/test_api.py`: 55 tests passed
- `tests/test_automation.py`: 32 tests passed
- `tests/test_core.py`: 3 tests passed
- `api/tests/test_socialrelay.py`: 13 comprehensive system tests passed
- Total run time: **22.21 seconds**.

---

## 5. Migration from Prototype

If upgrading from the initial prototype in `D:\Claude Apps\Insta to YT`:
1. Copy your existing `.env` file or update it using `.env.example`.
2. Existing media files in `storage/` are preserved; run `POST /api/v1/system/cleanup` to re-index.
3. The new backend serves the compiled frontend directly at `http://localhost:8000/`.

---

## 6. Future Roadmap

- **v1.1.0**: Facebook Pages & Groups direct publishing integration.
- **v1.2.0**: Telegram Channels broadcast bot.
- **v1.3.0**: Decentralized social publishing (Mastodon & Bluesky).
- **v1.4.0**: Faster-Whisper local audio transcription for automatic burned-in open captions.
