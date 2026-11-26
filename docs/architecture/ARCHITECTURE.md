# System Architecture Specification — SocialRelay

**Version**: 1.0.0  
**Scope**: Full-Stack Modular Self-Hosted System Architecture  

---

## 1. Architectural Layers & Separation of Concerns

SocialRelay is structured into 18 independent, decoupled layers to ensure zero vendor lock-in, maintainability, and high reliability:

```mermaid
graph TD
    subgraph Presentation ["Presentation Layer"]
        UI["React 18 SPA (Vite + Tailwind)"]
        Components["shadcn/ui Pattern Components"]
        APIClient["Typed API Service Client"]
    end

    subgraph Gateway ["API Gateway & Security"]
        FastAPI["FastAPI 0.143 Router"]
        AuthLayer["Argon2id Session & Token Auth"]
        SSRFGuard["SSRF & DNS Security Shield"]
    end

    subgraph DomainServices ["Domain Services Layer"]
        ImportSvc["Source Import Service"]
        MediaSvc["Media Management Service"]
        MetadataSvc["Metadata & Caption Engine"]
        AccountSvc["Account Management Service"]
        AutoSvc["Automation Engine (DAG)"]
        AnalyticsSvc["Analytics Service"]
    end

    subgraph AsyncExecution ["Async Execution Layer"]
        Scheduler["APScheduler Persistent Scheduler"]
        JobQueue["Database-Backed Queue & Leases"]
        WorkerRunner["Worker Daemon & Heartbeat"]
        StateMachine["20-State Machine & Audit Trail"]
    end

    subgraph Adapters ["Platform Provider Adapters"]
        YTAdapter["YouTube Data API v3 Adapter"]
        IGAdapter["Meta Graph API Adapter"]
        OllamaAdapter["Local AI (Ollama) Adapter"]
        FFmpegAdapter["FFmpeg 7.1 Engine Adapter"]
    end

    subgraph Persistence ["Persistence Layer"]
        SQLite[(SQLite Database - WAL Mode)]
        FileStore["Partitioned Disk Storage (UUID)"]
    end

    Presentation --> Gateway
    Gateway --> DomainServices
    DomainServices --> AsyncExecution
    AsyncExecution --> Adapters
    AsyncExecution --> Persistence
    DomainServices --> Persistence
```

---

## 2. End-to-End Ingestion & Processing Flow

The end-to-end ingestion pipeline takes an authorized Instagram Reel link or local file, performs security validation, probes video metadata, and prepares platform-specific content:

```mermaid
sequenceDiagram
    actor Creator as Creator / User
    participant Web as Web Dashboard
    participant API as FastAPI Ingestion
    participant SSRF as SSRF & Validator
    participant YTDLP as yt-dlp / File Stream
    participant Media as FFmpeg Processor
    participant DB as SQLite DB

    Creator->>Web: Paste Instagram Reel URL & Confirm Rights
    Web->>API: POST /api/v1/imports/url
    API->>SSRF: Validate URL & Resolve Public IP
    SSRF-->>API: Safe Canonical URL
    API->>DB: Check Duplicate URL / Shortcode
    alt Already Imported
        DB-->>API: Existing Media Record
        API-->>Web: Return Duplicate Warning with Existing ID
    else New Media
        API->>YTDLP: Download Video to temporary/
        YTDLP-->>API: Downloaded MP4 & Original Caption
        API->>DB: Check SHA-256 Fingerprint
        API->>Media: Probe Streams (Duration, FPS, Codecs)
        API->>Media: Extract High-Res Cover Thumbnail
        API->>DB: Save SourceMedia, MediaAsset & ContentDraft
        API-->>Web: Import Successful (Draft ID, Preview)
    end
```

---

## 3. Resilient Multi-Platform Publishing Sequence

The publishing process executes with strict idempotency and independent destination error tracking:

```mermaid
sequenceDiagram
    participant User as Creator
    participant API as Publishing API
    participant Queue as Job Queue
    participant Worker as Background Worker
    participant YT as YouTube API v3
    participant IG as Meta Graph API
    participant DB as Database

    User->>API: POST /api/v1/publishing/create (Draft ID, Accounts)
    API->>DB: Create PublishingIntent & PublicationTargets
    API->>Queue: Enqueue Jobs (Idempotency Key per Target)
    Worker->>Queue: Claim Job Lease (Worker ID, Lease 300s)
    
    par YouTube Upload
        Worker->>YT: Initiate Resumable Video Upload
        loop 5MB Chunks
            Worker->>YT: Send Byte Chunk
            Worker->>DB: Record Progress Heartbeat (20%, 40%, 80%)
        end
        YT-->>Worker: Video ID & Published URL
        Worker->>DB: Target Status -> PUBLISHED
    and Instagram Reel Publish
        Worker->>IG: POST /{user_id}/media (Container Creation)
        IG-->>Worker: Container ID
        loop Polling Status (Every 8s)
            Worker->>IG: GET /{container_id}?fields=status_code
        end
        Worker->>IG: POST /{user_id}/media_publish (Publish Container)
        IG-->>Worker: Media ID & Permalink
        Worker->>DB: Target Status -> PUBLISHED
    end

    alt Partial Failure (e.g. Instagram Fails, YouTube Succeeds)
        Worker->>DB: YouTube = PUBLISHED, Instagram = RETRY_PENDING
        Worker->>DB: Intent Status = PARTIALLY_PUBLISHED
        Note over Worker,DB: YouTube is NEVER re-uploaded on Instagram retry
    end
```

---

## 4. Decoupled Provider Adapter Pattern

All platform-specific logic is encapsulated in isolated adapters:
- **`api/app/providers/youtube/adapter.py`**: Handles Google OAuth2, channel queries, chunked resumable video uploads, and quota error mapping.
- **`api/app/providers/instagram/adapter.py`**: Handles Meta Graph API OAuth, Reels container initialization, status polling, and manual export fallback packaging.
- **`api/app/services/media/processor.py`**: Wraps the bundled FFmpeg 7.1 executable with array-based arguments.

A failure or API change in one provider does not affect the operation of other providers.
