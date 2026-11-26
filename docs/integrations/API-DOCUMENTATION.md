# SocialRelay v1.0.0 — REST API v1 Specification

The SocialRelay REST API is served under the `/api/v1` namespace. When running locally or in Docker, interactive Swagger UI documentation is available at `http://localhost:8000/api/v1/docs` and ReDoc at `http://localhost:8000/api/v1/redoc`.

All requests expecting JSON payloads must supply `Content-Type: application/json`. Protected endpoints require an `Authorization: Bearer <jwt_access_token>` header.

---

## 1. Authentication Endpoints (`/api/v1/auth`)

### 1.1 Login
- **`POST /api/v1/auth/login`**
- **Description**: Authenticate user via email and password using Argon2id. Returns JWT access and refresh tokens.
- **Request Body**:
```json
{
  "email": "admin@socialrelay.local",
  "password": "YourStrongPassword123"
}
```
- **Response** (`200 OK`):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "email": "admin@socialrelay.local",
    "role": "admin"
  }
}
```
- **Errors**: `401 Unauthorized` (Invalid credentials).

### 1.2 Current User Info
- **`GET /api/v1/auth/me`**
- **Description**: Retrieve authenticated user profile, permissions, and active session details.
- **Headers**: `Authorization: Bearer <token>`
- **Response** (`200 OK`):
```json
{
  "id": 1,
  "email": "admin@socialrelay.local",
  "role": "admin",
  "is_active": true,
  "created_at": "2026-11-26T12:00:00Z"
}
```

---

## 2. Content Import Endpoints (`/api/v1/imports`)

### 2.1 Import via URL
- **`POST /api/v1/imports/url`**
- **Description**: Ingest an authorized Instagram Reel or video URL. Includes full SSRF defense checking before fetching.
- **Request Body**:
```json
{
  "url": "https://www.instagram.com/reel/C7-xyz123/",
  "author_name": "MyChannel",
  "notes": "Original owned video"
}
```
- **Response** (`202 Accepted`):
```json
{
  "source_media_id": 14,
  "job_id": 42,
  "status": "queued",
  "shortcode": "C7-xyz123",
  "original_file_hash": null,
  "message": "Import job queued successfully"
}
```
- **Errors**: `400 Bad Request` (Invalid URL syntax), `403 Forbidden` (SSRF violation - private/loopback IP blocked).

### 2.2 Upload Local File
- **`POST /api/v1/imports/upload`**
- **Description**: Direct multipart file upload for owned or creator-authorized MP4/MOV files.
- **Payload**: `multipart/form-data` with `file=@my_video.mp4`
- **Response** (`201 Created`):
```json
{
  "source_media_id": 15,
  "file_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "file_size_bytes": 14859200,
  "mime_type": "video/mp4",
  "status": "ready"
}
```
- **Errors**: `415 Unsupported Media Type` (Not MP4/MOV magic bytes), `413 Payload Too Large` (Exceeds disk quota).

### 2.3 Bulk CSV Ingestion
- **`POST /api/v1/imports/bulk-csv`**
- **Description**: Batch import multiple authorized URLs and captions from a CSV upload.
- **Payload**: `multipart/form-data` with `file=@queue.csv`
- **Response** (`200 OK`):
```json
{
  "total_rows": 10,
  "queued": 10,
  "skipped_duplicates": 0,
  "errors": []
}
```

### 2.4 List Source Media
- **`GET /api/v1/imports`**
- **Query Parameters**: `skip=0`, `limit=50`, `status=imported`
- **Response** (`200 OK`): Paginated array of source media entities.

---

## 3. Media Processing & Renditions (`/api/v1/media`)

### 3.1 List Media Assets
- **`GET /api/v1/media`**
- **Query Parameters**: `skip=0`, `limit=20`, `aspect_ratio=0.5625`
- **Response** (`200 OK`): Master processed assets with duration, width, height, bitrate, and thumbnail paths.

### 3.2 Trigger 9:16 Optimization
- **`POST /api/v1/media/{source_id}/optimize`**
- **Description**: Executes FFmpeg processing pipeline to produce vertical 1080×1920 H.264 video.
- **Request Body**:
```json
{
  "crop_mode": "fit_blur",
  "target_width": 1080,
  "target_height": 1920,
  "max_duration_sec": 60.0,
  "trim_start_sec": 0.0,
  "mute_audio": false
}
```
- **Modes**: `fit_blur` (9:16 blurred background), `center_crop` (fill screen), `fit_black` (letterbox).
- **Response** (`202 Accepted`): Enqueued job details.

### 3.3 Extract Cover Frame
- **`POST /api/v1/media/{asset_id}/thumbnail`**
- **Request Body**: `{"timestamp_sec": 2.5}`
- **Response** (`200 OK`): `{"thumbnail_path": "storage/thumbnails/uuid.jpg"}`

---

## 4. Content Studio & Drafts (`/api/v1/drafts`)

### 4.1 Create Draft
- **`POST /api/v1/drafts`**
- **Request Body**:
```json
{
  "media_asset_id": 5,
  "title": "5 Productivity Hacks for Creators",
  "caption": "Save 10 hours a week with these quick adjustments. #productivity #creators",
  "hashtags": ["productivity", "creators", "workflow"],
  "youtube_title": "5 Productivity Hacks for Creators #Shorts",
  "youtube_description": "Full workflow walkthrough in description. Subscribe for more!",
  "youtube_privacy": "public",
  "instagram_caption": "Save 10 hours a week with these quick adjustments.\n\n#productivity #creators"
}
```
- **Response** (`201 Created`): Draft entity with validation flags.

### 4.2 Generate AI Metadata (Local Ollama)
- **`POST /api/v1/drafts/generate-metadata`**
- **Request Body**:
```json
{
  "source_caption": "Here are 5 tips to speed up your video editing workflow...",
  "target_platform": "youtube_shorts",
  "mode": "hybrid"
}
```
- **Response** (`200 OK`):
```json
{
  "generated_title": "Speed Up Video Editing in 60 Seconds #Shorts",
  "generated_description": "5 rapid video editing tips to supercharge your workflow.\n\n#videoediting #shorts",
  "recommended_hashtags": ["videoediting", "creators", "editingtips"],
  "engine_used": "ollama:qwen2.5-coder"
}
```

---

## 5. Connected Accounts & OAuth (`/api/v1/accounts`)

### 5.1 List Accounts
- **`GET /api/v1/accounts`**
- **Response** (`200 OK`): List of connected YouTube and Instagram accounts with token expiry and connection status.

### 5.2 Start OAuth Flow
- **`GET /api/v1/accounts/{platform}/connect`**
- **Parameters**: `platform` = `youtube` or `instagram`
- **Response** (`200 OK`):
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=hmac_signed_state...",
  "state": "hmac_signed_state"
}
```

### 5.3 OAuth Callback
- **`GET /api/v1/accounts/{platform}/callback`**
- **Parameters**: `code=auth_code`, `state=hmac_signed_state`
- **Description**: Exchanges authorization code for long-lived tokens, encrypts them via Fernet AES, and stores the account.
- **Response** (`302 Found`): Redirects to frontend `/accounts` with success status.

### 5.4 Test Account Connection
- **`POST /api/v1/accounts/{account_id}/test`**
- **Response** (`200 OK`): `{"status": "ok", "latency_ms": 142, "account_name": "Channel Name"}`

---

## 6. Publishing Engine & Intents (`/api/v1/publishing`)

### 6.1 Create Publishing Intent (Schedule or Publish Now)
- **`POST /api/v1/publishing/intents`**
- **Request Body**:
```json
{
  "draft_id": 3,
  "target_account_ids": [1, 2],
  "scheduled_for": "2026-11-28T18:00:00Z",
  "timezone": "Asia/Kolkata"
}
```
- If `scheduled_for` is null or omitted, triggers immediate publication.
- **Response** (`201 Created`):
```json
{
  "intent_id": 8,
  "status": "scheduled",
  "scheduled_for": "2026-11-28T18:00:00Z",
  "targets": [
    {"target_id": 15, "platform": "youtube", "idempotency_key": "e43b..."},
    {"target_id": 16, "platform": "instagram", "idempotency_key": "a98c..."}
  ]
}
```

### 6.2 Manual Export ZIP Package
- **`GET /api/v1/publishing/export-manual/{draft_id}`**
- **Description**: Downloads a standardized ZIP containing the 1080×1920 MP4, cover image, and ready-to-copy `metadata.txt` for manual publishing fallback.
- **Response**: `application/zip` stream.

---

## 7. Visual Automation DAGs (`/api/v1/automations`)

### 7.1 List Workflows
- **`GET /api/v1/automations`**
- **Response** (`200 OK`): Array of configured automation DAG pipelines.

### 7.2 Dry-Run Simulation
- **`POST /api/v1/automations/dry-run`**
- **Request Body**: DAG schema with nodes, edges, and mock input payload.
- **Description**: Uses Kahn's algorithm to detect cycles, validates node parameter schemas, and simulates execution without calling external APIs.
- **Response** (`200 OK`):
```json
{
  "valid": true,
  "cycles_detected": false,
  "execution_order": ["node_1_import", "node_2_optimize", "node_3_ai_meta", "node_4_publish_yt"],
  "simulated_outputs": {
    "node_4_publish_yt": {"status": "dry_run_success", "estimated_units": 1600}
  }
}
```

---

## 8. Management & Operations (`/api/v1/management`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/dashboard` | `GET` | Operational counts, storage usage, and upcoming 5 scheduled posts |
| `/api/v1/calendar` | `GET` | Publishing events for month/week range with timezone conversion |
| `/api/v1/analytics` | `GET` | Success rate breakdown, error ratios, platform distribution |
| `/api/v1/audit-logs` | `GET` | Security audit trail of user actions, logins, and publishing jobs |
| `/api/v1/system/storage` | `GET` | Disk usage across originals, processed, thumbnails, and temp |
| `/api/v1/system/cleanup` | `POST` | Delete temp files older than 24 hours and orphaned renditions |
| `/api/v1/system/test-ffmpeg` | `POST` | Probes installed FFmpeg version and available hardware encoders |
| `/api/v1/system/test-ollama` | `POST` | Checks local Ollama instance health and lists loaded LLM models |
| `/api/v1/backup/create` | `POST` | Triggers SQLite online backup API to create consistent backup ZIP |
| `/api/v1/backup/list` | `GET` | Lists available historical backup archives with file sizes |

---

## 9. Error Code Reference

| Status Code | Meaning | Example Scenario |
|---|---|---|
| `400 Bad Request` | Malformed parameters | Invalid cron expression, missing required field |
| `401 Unauthorized` | Authentication required | Expired or missing JWT Bearer token |
| `403 Forbidden` | Access denied or security guard | SSRF guard blocked private RFC 1918 IP address |
| `404 Not Found` | Entity missing | Draft ID or Source Media ID does not exist |
| `409 Conflict` | Idempotency or duplicate conflict | Video already uploaded; duplicate shortcode |
| `413 Payload Too Large` | Storage quota exceeded | Uploaded video exceeds configured maximum limit |
| `422 Unprocessable` | Semantic validation failed | YouTube title exceeds 100 characters |
| `429 Too Many Requests` | Platform rate limits | YouTube Data API daily 10,000 unit quota exhausted |
| `500 Internal Error` | Unexpected server failure | FFmpeg subprocess segmentation fault or fatal error |
