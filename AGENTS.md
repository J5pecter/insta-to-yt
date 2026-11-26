# AGENTS.md — Agent Operating Rules for SocialRelay

## Operational Protocol
When working on SocialRelay, autonomous agents must adhere to the following operational boundaries:

1. **Architecture & Scope**:
   - SocialRelay is built on FastAPI (backend) and React + Vite (frontend).
   - Do not substitute third-party hosted commercial services for local modules.
   - Do not create dummy or mocked endpoints in production routes.

2. **Database & Migrations**:
   - SQLite is configured with WAL mode and `PRAGMA foreign_keys = ON`.
   - Maintain compatibility for seamless migration to PostgreSQL.
   - Every state change in jobs or publication targets must record an audit event and a timestamp.

3. **Media Pipeline**:
   - Video processing must run through `api/app/services/media/processor.py` utilizing the bundled FFmpeg executable.
   - Files are stored by UUID in `storage/` partitioned into `originals/`, `processed/`, `thumbnails/`, `temporary/`, and `backups/`.
   - Temporary files must be cleaned up after processing or after 24 hours.

4. **Safety & Security**:
   - External URLs must be validated against SSRF protection before any network request is issued.
   - Social media credentials and OAuth tokens must be encrypted using `TokenEncryptionService`.
   - Passwords must be hashed using Argon2id.

5. **Testing Verification**:
   - All tests must pass before declaring an implementation complete.
   - Tests must run offline without executing live uploads to real social media accounts.
