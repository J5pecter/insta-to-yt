# SocialRelay V4 — Cloud Architecture

SocialRelay V4 separates static frontend distribution from private backend media processing and OAuth execution using zero-cost open-source infrastructure:

```mermaid
flowchart TB
    Browser["Browser (Any Device)\nhttps://j5pecter.github.io/insta-to-yt/\nOR https://socialrelay.yourdomain.com"]
    Caddy["Caddy Reverse Proxy\n(Automatic Let's Encrypt HTTPS)"]
    API["FastAPI Backend + Single APScheduler\n(Internal :8000)"]
    Worker["Dedicated FFmpeg Worker\n(Concurrency = 1)"]
    DB[("SQLite WAL Database\n/var/lib/socialrelay/data")]
    Media["Private Media Storage\n/var/lib/socialrelay/storage"]

    Browser -->|"HTTPS 443 (/api/v1/*)"| Caddy
    Caddy --> API
    API <--> DB
    Worker <--> DB
    Worker <--> Media
    Worker -->|"Resumable Upload"| YouTube["YouTube Data API v3"]
    Worker -->|"Container Reels API"| Instagram["Instagram Graph API"]
```

- **GitHub Pages (`https://j5pecter.github.io/insta-to-yt/`)**: Serves the compiled React SPA. Configurable at build time via `VITE_API_BASE_URL` (repository variable, never secrets).
- **Cloud Backend (`docker-compose.prod.yml`)**: Runs Caddy, Nginx (same-origin fallback SPA), FastAPI, and a dedicated ARM64/x86_64 FFmpeg worker sharing persistent host volumes at `/var/lib/socialrelay/`.
