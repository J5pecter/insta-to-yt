# SocialRelay v1.0.0 — Operational Troubleshooting Runbook

This guide covers common operational challenges, platform-specific edge cases, error diagnostics, and recovery procedures for SocialRelay.

---

## 1. FFmpeg & Media Processing Issues

### Symptom: `FFmpegNotFoundError` or `FileNotFoundError: ffmpeg`
- **Cause**: The system cannot locate an FFmpeg binary in the system `PATH`.
- **Resolution**:
  1. SocialRelay automatically bundles FFmpeg 7.1 on Windows via `imageio-ffmpeg`. Verify it exists in your virtual environment:
     ```powershell
     .\.venv\Scripts\python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"
     ```
  2. If deploying in a custom Linux container or minimal VM, install system packages:
     ```bash
     sudo apt-get update && sudo apt-get install -y ffmpeg libavcodec-extra
     ```
  3. Validate FFmpeg health directly via the SocialRelay API:
     ```bash
     curl -X POST http://localhost:8000/api/v1/system/test-ffmpeg -H "Authorization: Bearer <TOKEN>"
     ```

### Symptom: Video Processing Fails with `moov atom not found`
- **Cause**: Corrupted or incomplete video file upload.
- **Resolution**: Ensure the video was fully transferred before triggering processing. SocialRelay validates MP4 magic bytes (`ftyp`) upon upload to prevent corrupted files from entering the pipeline.

---

## 2. YouTube Data API Troubleshooting

### Symptom: HTTP 403 `quotaExceeded`
- **Cause**: Google enforces a default limit of 10,000 quota units per day per Google Cloud project. A video upload costs 1,600 units (allowing ~6 uploads per day).
- **Behavior**: SocialRelay catches `quotaExceeded`, pauses the queued publishing job, logs the event in `publication_logs`, and marks the target status as `PAUSED_FOR_QUOTA`.
- **Quota Reset Schedule**:
  - The daily counter resets at **Midnight Pacific Time (00:00 PST / 08:00 UTC / 13:30 IST)**.
- **Fix & Best Practices**:
  1. In the Content Studio, stagger large batches of scheduled posts across consecutive days.
  2. If higher daily throughput is needed, request a free quota extension in Google Cloud Console under **APIs & Services > YouTube Data API v3 > Quotas**.

### Symptom: Google OAuth Token Invalidates After 7 Days
- **Cause**: In Google Cloud Console, if your OAuth Consent Screen is set to **Publishing Status: Testing**, refresh tokens expire after 7 days.
- **Resolution**:
  1. In Google Cloud Console, navigate to **APIs & Services > OAuth consent screen**.
  2. Click **Publish App**. You do not need to go through the complex brand verification process as long as your app is only used for personal self-hosting. Once set to "In production", refresh tokens do not expire after 7 days.

---

## 3. Instagram Graph API Troubleshooting

### Symptom: Media Container Status stuck at `IN_PROGRESS` or transitions to `ERROR`
- **Cause 1: Aspect Ratio or Duration Mismatch**:
  - Instagram Reels strictly require a vertical aspect ratio between **0.8 (4:5)** and **0.5625 (9:16)**.
  - Duration must be between **3 seconds and 90 seconds**.
  - Frame rate must be between **23 FPS and 60 FPS**.
  - *Fix*: SocialRelay's 9:16 optimization engine automatically normalizes videos to 1080×1920 at 30 FPS. Always ensure your draft uses the processed rendition.
- **Cause 2: Public Media URL Unreachable**:
  - Meta servers download the video directly from your server. If running on `localhost`, Meta's servers cannot reach `http://localhost:8000/...`.
  - *Fix*: Use a free tunnel (e.g. Cloudflare Tunnel or Tailscale Funnel) and configure `PUBLIC_STORAGE_BASE_URL` in `.env`.
  - *Alternative*: If running purely offline without inbound tunneling, use the **Export Manual Package** button to download the 1080×1920 MP4 and post via mobile.

---

## 4. Database & Concurrency Issues

### Symptom: `sqlite3.OperationalError: database is locked`
- **Cause**: Multiple write operations attempted simultaneously, or an external SQLite browser holds an open exclusive write lock.
- **Resolution**:
  1. SocialRelay automatically sets `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) and `PRAGMA busy_timeout = 5000;`.
  2. Close any external database GUI editors (such as DB Browser for SQLite) that may hold locks on `socialrelay.db`.
  3. Ensure the `data/` directory has proper read/write permissions for the user executing the backend process.

---

## 5. Local AI (Ollama) Troubleshooting

### Symptom: `Connection refused on http://localhost:11434`
- **Cause**: Ollama is not installed or the local Ollama background service is not running.
- **Graceful Fallback**: SocialRelay is built with **zero mandatory dependencies**. If Ollama is unreachable, the system automatically falls back to deterministic heuristic metadata generation (Modes A, B, C, D) without failing the request.
- **To Enable Local AI**:
  1. Download Ollama from [ollama.com](https://ollama.com/).
  2. Start the service: `ollama serve`
  3. Download a lightweight coding/content model:
     ```bash
     ollama pull qwen2.5:latest
     # or
     ollama pull llama3.2:latest
     ```
  4. Test connection via the System screen or:
     ```bash
     curl -X POST http://localhost:8000/api/v1/system/test-ollama -H "Authorization: Bearer <TOKEN>"
     ```

---

## 6. SSRF Guard False Positives

### Symptom: `SSRFSecurityException: Destination IP is blocked`
- **Cause**: You tried to import a video from an IP address inside a local home network (e.g., `http://192.168.1.50:8080/video.mp4`).
- **Resolution**: The SSRF guard strictly blocks internal network ranges to protect your home infrastructure. For internal or local videos, use the **Upload File** tab instead of URL import.
