# SocialRelay v1.0.0 — Production Deployment Guide

SocialRelay is designed to run self-hosted on your existing hardware—whether that is a dedicated home server, a mini PC, a local Windows development machine, or an isolated Linux VPS.

---

## 1. System Requirements

| Specification | Minimum | Recommended | Notes |
|---|---|---|---|
| **Operating System** | Windows 10/11, Ubuntu 22.04+, Debian 12, macOS 13+ | Linux Ubuntu 24.04 LTS or Debian 12 | Linux offers the lowest idle power and easiest containerization |
| **CPU** | 2 Cores (x86_64 or ARM64) | 4+ Cores (Intel 8th gen+ or AMD Ryzen) | Hardware video encoder (Intel QSV or NVENC) accelerates FFmpeg |
| **RAM** | 2 GB | 4 GB - 8 GB | Higher RAM allows faster in-memory video buffering and local Ollama LLMs |
| **Storage** | 20 GB free disk space | 250 GB+ NVMe SSD | Video storage grows over time; automated cleanup removes temporary files |
| **Network** | Broadband internet | 50+ Mbps upload speed | Smooth video uploads to YouTube and Instagram |

---

## 2. Windows Native Deployment (One-Click)

SocialRelay provides full native Windows support with an embedded Python virtual environment and built-in FFmpeg 7.1 binaries.

### Step 1: Clone and Configure Environment
```powershell
git clone https://github.com/your-username/SocialRelay.git "C:\SocialRelay"
cd "C:\SocialRelay"

# Copy environment template
copy .env.example .env
```
Open `.env` in Notepad and set secure secrets:
```env
APP_NAME=SocialRelay
APP_ENV=production
DEBUG=false
SECRET_KEY=generate-a-strong-64-character-random-hex-string
ENCRYPTION_SECRET_KEY=generate-a-valid-fernet-key
DATABASE_URL=sqlite:///./data/socialrelay.db
STORAGE_ROOT=./storage
CORS_ORIGINS=["http://localhost:8000","http://127.0.0.1:8000"]
```

### Step 2: Run via `start.bat`
Double-click `start.bat` or run:
```powershell
.\start.bat
```
The startup script automatically:
1. Detects Python 3.11+ and checks virtual environment `.venv`.
2. Verifies dependencies and database initialization.
3. Serves the pre-compiled React SPA at `http://localhost:8000`.
4. Starts the background worker and APScheduler within the unified FastAPI lifespan process.

### Step 3: Run as a Background Windows Service (Optional)
To keep SocialRelay running automatically on Windows boot without keeping a terminal open, use **NSSM (Non-Sucking Service Manager)**:
```powershell
# Download NSSM and run:
nssm install SocialRelay "C:\SocialRelay\.venv\Scripts\python.exe" "-m uvicorn api.app.main:app --host 0.0.0.0 --port 8000"
nssm set SocialRelay AppDirectory "C:\SocialRelay"
nssm set SocialRelay Start SERVICE_AUTO_START
nssm start SocialRelay
```

---

## 3. Linux & Docker Compose Deployment (Recommended)

Docker Compose provides containerized isolation for the API, Background Worker, and Frontend.

### Project Layout
```
SocialRelay/
├── docker-compose.yml
├── .env
├── infrastructure/
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.worker
│   │   └── nginx.conf
│   └── caddy/
│       └── Caddyfile
├── data/           # Persistent SQLite database volume
└── storage/        # Persistent media storage volume
```

### Step 1: Launch Containers
```bash
# Pull/build images and start in background
docker compose up -d --build
```

### Step 2: Verify Running Services
```bash
docker compose ps
```
You should see:
- `socialrelay-api`: FastAPI backend running on port 8000
- `socialrelay-worker`: Dedicated background queue processor
- `socialrelay-web`: Nginx serving the compiled React frontend on port 80

### Step 3: Systemd Service for Auto-Start on Linux Boot
Create `/etc/systemd/system/socialrelay.service`:
```ini
[Unit]
Description=SocialRelay Docker Compose Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/SocialRelay
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable socialrelay.service
sudo systemctl start socialrelay.service
```

---

## 4. Reverse Proxy & Automatic HTTPS with Caddy

To secure your installation with free, automatic Let's Encrypt SSL/TLS certificates:

### `infrastructure/caddy/Caddyfile`
```caddyfile
relay.yourdomain.com {
    encode zstd gzip

    # Proxy frontend and API
    reverse_proxy localhost:8000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

Run Caddy:
```bash
caddy run --config infrastructure/caddy/Caddyfile
```

---

## 5. Private Remote Access without Port Forwarding (Tailscale)

Never expose your SocialRelay administrative dashboard directly to the public internet without authentication protection.

The recommended free, zero-config solution for remote access is **Tailscale**:
1. Install Tailscale on your host machine: `curl -fsSL https://tailscale.com/install.sh | sh`
2. Authenticate: `sudo tailscale up`
3. Your server receives a private, secure IP (e.g., `100.x.y.z`) and a MagicDNS name (e.g., `server.tailnet.ts.net`).
4. Install Tailscale on your mobile phone or laptop.
5. Access your SocialRelay dashboard anywhere in the world at `http://server.tailnet.ts.net:8000` over an end-to-end encrypted WireGuard tunnel.

---

## 6. Health Checks & Monitoring

- **Liveness probe**: `GET http://localhost:8000/api/v1/system/health`
- **Dashboard metrics**: `GET http://localhost:8000/api/v1/dashboard`
- **FFmpeg verification**: `POST http://localhost:8000/api/v1/system/test-ffmpeg`
- **Storage diagnostics**: `GET http://localhost:8000/api/v1/system/storage`
