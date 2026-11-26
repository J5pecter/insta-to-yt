# SocialRelay v1.0.0 — Security & Threat Modeling Architecture

SocialRelay is engineered from the ground up for safe, self-hosted deployment. Because cross-publishing platforms handle sensitive social media OAuth credentials and process external URLs and user uploads, robust defense-in-depth principles are enforced across every layer.

---

## 1. STRIDE Threat Model

| STRIDE Category | Threat Description | SocialRelay Mitigation | Implementation Location |
|---|---|---|---|
| **Spoofing** | Attacker impersonates the administrator or forges an OAuth callback. | Argon2id password hashing; HMAC-SHA256 signed OAuth state tokens with expiration & replay protection; PKCE flow for Google OAuth. | [crypto.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/security/crypto.py) |
| **Tampering** | Modification of video files or database records on disk. | SHA-256 cryptographic checksums calculated upon import and verified before publishing; SQLite Write-Ahead Logging (WAL) with strict foreign keys. | [manager.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/services/storage/manager.py) |
| **Repudiation** | Operator denies scheduling or publishing sensitive content. | Comprehensive, immutable `audit_logs` table tracking user ID, IP address, user agent, action timestamp, and payload diffs. | [entities.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/models/entities.py) |
| **Information Disclosure** | Leakage of access/refresh tokens in backups or database dumps. | AES-128-CBC encryption with HMAC authentication (Fernet) for all platform tokens at rest; sensitive keys masked in logs. | [crypto.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/security/crypto.py) |
| **Denial of Service** | Exhaustion of disk space, FFmpeg CPU starvation, or platform quota lockout. | Strict file size quotas (default 500MB); background worker timeout limits (300s); deterministic idempotency keys preventing repeated publishing attempts. | [job_queue.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/workers/job_queue.py) |
| **Elevation of Privilege** | Server-Side Request Forgery (SSRF) accessing internal networks (e.g., router admin, cloud metadata endpoints). | Hardened SSRF validator rejecting private RFC 1918, loopback, link-local, and AWS/GCP metadata IP ranges before opening network sockets. | [ssrf.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/security/ssrf.py) |

---

## 2. Server-Side Request Forgery (SSRF) Defense

When importing media from an external URL, attackers might supply internal addresses (`http://192.168.1.1/`, `http://169.254.169.254/latest/meta-data/`, or `http://localhost:8000/api/v1/system/backup`). 

SocialRelay's [ssrf.py](file:///d:/Claude%20Apps/Insta%20to%20YT/api/app/security/ssrf.py) enforces pre-flight URL and DNS validation:
1. **Scheme Restriction**: Only `http://` and `https://` schemes are permitted. File (`file://`), FTP, and Gopher schemes are rejected.
2. **DNS Resolution Verification**: The hostname is resolved via standard DNS. The resulting IP address is checked against `ipaddress.ip_network`:
   - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918 Private networks)
   - `127.0.0.0/8` (Loopback addresses)
   - `169.254.0.0/16` (Link-local & AWS/GCP/Azure instance metadata services)
   - `::1`, `fe80::/10`, `fc00::/7` (IPv6 loopback and unique local addresses)
3. **Redirect Protection**: HTTP client redirect following is validated on every subsequent hop against the same SSRF guard rules.

---

## 3. Cryptographic Storage & Token Protection

### 3.1 Argon2id Password Hashing
User passwords are never stored in plaintext or with outdated hash functions (MD5, SHA-1, SHA-256). SocialRelay utilizes **Argon2id** (the OWASP-recommended algorithm for password storage):
- Memory cost: 65,536 KiB (64 MB)
- Time cost: 3 iterations
- Parallelism: 4 threads
- Salt: Cryptographically secure 16-byte random salt per user

### 3.2 Fernet Token Encryption at Rest
OAuth access tokens and refresh tokens for YouTube and Instagram are encrypted before persisting into the `social_accounts` table:
- **Cipher**: AES-128 in CBC mode with PKCS7 padding
- **Integrity**: HMAC with SHA-256 authenticated encryption
- **Key Derivation**: Sourced from the master `ENCRYPTION_SECRET_KEY` in `.env`.
- Database dumps or backups do not reveal active social media access tokens without the server's master key.

---

## 4. OAuth 2.0 State Security

To prevent Cross-Site Request Forgery (CSRF) during the OAuth authorization handshake:
1. SocialRelay creates an encrypted, tamper-evident state token:
   $$\text{State} = \text{base64url}(\text{payload} + "." + \text{HMAC-SHA256}(\text{payload}, \text{SECRET}))$$
2. The payload contains:
   - Random nonce (UUIDv4)
   - User ID initiating the connection
   - Expiration timestamp (15-minute validity window)
3. Upon receiving the OAuth callback at `/api/v1/accounts/{platform}/callback`, the HMAC signature is verified using constant-time comparison (`hmac.compare_digest`). Expired or altered states are rejected immediately.

---

## 5. Idempotency & Duplicate Publishing Prevention

To guarantee that network glitches, worker retries, or accidental double-clicks can **never** trigger duplicate posts on YouTube or Instagram:
- Every `PublicationTarget` is assigned a deterministic **Idempotency Key**:
  $$\text{Key} = \text{SHA256}(\text{draft\_id} + ":" + \text{account\_id} + ":" + \text{scheduled\_for})$$
- The `publication_targets` table enforces a `UNIQUE` constraint on `idempotency_key`.
- Before dispatching a video upload, the worker checks if a target with this key has already transitioned to `published`. If found, subsequent attempts exit cleanly as no-ops.

---

## 6. HTTP Security Headers & Network Hygiene

When accessed via the integrated Caddy reverse proxy or FastAPI middleware, the following headers are enforced:
- **`Content-Security-Policy`**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:;`
- **`X-Content-Type-Options`**: `nosniff` (Prevents MIME-sniffing exploits on uploaded media)
- **`X-Frame-Options`**: `DENY` (Protects against clickjacking)
- **`Referrer-Policy`**: `strict-origin-when-cross-origin`
- **CORS**: Restricted in production to configured `ALLOWED_HOSTS` or identical origin.

---

## 7. Media Ingestion & Magic-Byte Validation

To prevent arbitrary file upload vulnerabilities (e.g., uploading PHP, executable binaries, or polyglot scripts masked as `.mp4`):
- Uploaded files are inspected for true binary headers (magic bytes):
  - **MP4**: `ftyp` box at byte offset 4 (`\x00\x00\x00\x18ftyp` / `\x00\x00\x00\x20ftyp`)
  - **MOV**: `\x00\x00\x00\x14ftypqt` or QuickTime atom headers
- FFprobe is run in isolated subprocesses with timeouts and without shell interpolation to prevent command injection.

---

## 8. Responsible Security Practices for Self-Hosters

1. **Keep `.env` Secure**: Restrict permissions (`chmod 600 .env`). Never commit `.env` or database files to public repositories.
2. **Use Private Network Access**: Use **Tailscale** or **WireGuard** for remote dashboard access instead of opening port 8000 to the public internet.
3. **Automate Backups**: Run encrypted database backups with `backup.sh` and store archives offsite.
