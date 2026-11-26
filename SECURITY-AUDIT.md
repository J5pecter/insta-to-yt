# SocialRelay V2 — Repository Security & Hygiene Audit

**Audit Date**: 2026-11-26  
**Target Repository**: `J5pecter/insta-to-yt` (Public Source + Private Execution Architecture)  
**Audit Status**: **PASSED — SAFE FOR PUBLIC SOURCE DISTRIBUTION**

---

## 1. Git History & Tracked Files Inspection

- **History Scan**: Inspected all commits (`8ef028f`, `22c8c3c`) across all branches for Google API keys (`AIza...`), Google OAuth Client Secrets (`GOCSPX-...`), GitHub tokens (`ghp_...`, `gho_...`), Anthropic keys (`sk-ant-...`), and PEM private keys.
  - **Result**: `0` secrets found in Git history.
- **Tracked Files Check**: Verified `git ls-files` contains only sanitized source code, tests, `.env.example`, and workflow definitions.
- **Sanitized `.env.example`**: Replaced sample base64 key with explicit placeholder `CHANGE_ME_GENERATE_WITH_FERNET_KEY`.

---

## 2. Exclusion Rules Verification (`.gitignore` & `.dockerignore`)

Both [.gitignore](file:///d:/Claude%20Apps/Insta%20to%20YT/.gitignore) and [.dockerignore](file:///d:/Claude%20Apps/Insta%20to%20YT/.dockerignore) strictly exclude:
- Environment files: `.env`, `.env.*` (except `!.env.example`)
- OAuth credentials & secrets: `client_secret*.json`, `token*.json`, `credentials.json`, `*.pem`, `*.key`, `cookies.txt`
- Runtime SQLite databases: `data/`, `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite*`
- Private media & backups: `storage/`, `runtime/`, `backups/`, `logs/`, `temp/`
- Build artifacts & dependencies: `apps/web/dist/`, `node_modules/`, `.venv/`

---

## 3. Application Security Controls Verified

1. **No Frontend Secrets**: Zero `VITE_*` client secrets or OAuth client secrets exist in `apps/web/src/`. Compiled `apps/web/dist/` bundles contain no credentials.
2. **Backend-Only Credential Storage**: Google `client_secret.json` and Instagram App ID/Secret are validated, encrypted with Fernet AES-128-CBC + HMAC-SHA256, and stored on the backend. API responses return only masked identifiers (`client_id_masked`, `app_id_masked`).
3. **Scoped Public Media Endpoint**: `GET /api/v1/media/public/{id}/download` enforces a short-lived (900s) HMAC-signed token (`verify_signed_state`), blocking unauthenticated enumeration (`403 Forbidden`).
4. **OAuth CSRF & PKCE**: Signed HMAC state tokens and Google PKCE verification prevent OAuth callback spoofing.
5. **SSRF & Path Traversal**: Pre-flight DNS/IP validation blocks RFC 1918 private networks, loopback, and cloud metadata endpoints (`169.254.169.254`).
6. **CI/CD Isolation**: `.github/workflows/ci.yml` and `deploy.yml` run strictly on ephemeral GitHub-hosted `ubuntu-latest` runners with minimum permissions and zero self-hosted personal runners.
