# SocialRelay v1.0.0 — Comprehensive Test Inventory & Test Cases

This document details the test matrix, test case definitions, input criteria, expected outcomes, and coverage across all modules of the SocialRelay cross-publishing platform.

---

## 1. Test Matrix Summary

| Category | Suite | Test Cases | Scope |
|---|---|---|---|
| **Unit Tests** | Security & Cryptography | TC-SEC-01 - TC-SEC-06 | Argon2id, Fernet AES, OAuth State HMAC, Key Derivation |
| **Unit Tests** | SSRF Guard | TC-SSRF-01 - TC-SSRF-05 | RFC 1918, Loopback, Cloud Metadata, DNS Resolution |
| **Unit Tests** | Storage Engine | TC-STR-01 - TC-STR-04 | UUID paths, SHA-256 deduplication, 24h temp cleanup, Quotas |
| **Unit Tests** | Metadata Processing | TC-META-01 - TC-META-07 | Caption-to-Title modes, platform character & byte limits, AI fallback |
| **Unit Tests** | DAG Automation Engine | TC-AUTO-01 - TC-AUTO-04 | Kahn's algorithm, cycle rejection, dry-run simulation |
| **Unit Tests** | 20-State Machine | TC-STM-01 - TC-STM-05 | Valid transitions, invalid transition rejections, audit recording |
| **Unit Tests** | Persistent Job Queue | TC-Q-01 - TC-Q-05 | Atomic leases, heartbeat tracking, exponential backoff, dead letters |
| **Integration** | Media Processor (FFmpeg) | TC-FFM-01 - TC-FFM-04 | 9:16 vertical conversion, cover extraction, stream probing |
| **Integration** | Provider Adapters | TC-PROV-01 - TC-PROV-04 | YouTube chunked upload, Instagram container polling |
| **Integration** | REST API v1 | TC-API-01 - TC-API-08 | Authentication, Drafts, Scheduling, Idempotency enforcement |
| **End-to-End** | Full Lifecycle Flow | TC-E2E-01 - TC-E2E-02 | Ingest -> Normalize -> Draft -> Schedule -> Target Publish |

---

## 2. Security & Cryptography Test Cases

### TC-SEC-01: Argon2id Password Hashing & Verification
- **Input**: Plaintext password `"SuperSecret123!"`
- **Action**: Pass through `hash_password()`.
- **Expected Outcome**: Generates a valid Argon2id hash containing `$argon2id$v=19$m=65536...`. Passing matching password to `verify_password()` returns `True`; incorrect password returns `False`.

### TC-SEC-02: Fernet AES Token Encryption & Decryption
- **Input**: Cleartext OAuth refresh token `"1//04uXyZ..."`
- **Action**: Encrypt with master `ENCRYPTION_SECRET_KEY` via `encrypt_token()`, then decrypt via `decrypt_token()`.
- **Expected Outcome**: Ciphertext is not plain text and contains timestamp/HMAC metadata. Decrypted string matches input byte-for-byte.

### TC-SEC-03: OAuth State HMAC Signature & Tamper Detection
- **Input**: User ID `42`, platform `"youtube"`
- **Action**: Generate state token with `create_oauth_state()`. Mutate a single character in the base64 string and verify with `validate_oauth_state()`.
- **Expected Outcome**: Valid token passes; mutated token raises `HTTPException(403, "Invalid or tampered OAuth state")`.

---

## 3. SSRF Guard Test Cases

### TC-SSRF-01: Reject Loopback Addresses
- **Input**: `http://127.0.0.1:8000/api/v1/system/backup` and `http://localhost/`
- **Expected Outcome**: Validation fails with `SSRFSecurityException("Private or loopback address blocked")`.

### TC-SSRF-02: Reject RFC 1918 Private Subnets
- **Input**: `http://192.168.1.1/admin`, `http://10.0.0.5/`, `http://172.16.10.20/`
- **Expected Outcome**: All rejected before making socket connections.

### TC-SSRF-03: Reject Cloud Metadata IP
- **Input**: `http://169.254.169.254/latest/meta-data/`
- **Expected Outcome**: Blocked immediately as link-local / cloud metadata address.

### TC-SSRF-04: Permit Valid Public Domain
- **Input**: `https://www.instagram.com/reel/C7-xyz123/`
- **Expected Outcome**: Resolves to public Meta IP address and passes validation.

---

## 4. Metadata Engine Test Cases

### TC-META-01: YouTube 100-Character Title Enforcement
- **Input**: A 140-character caption.
- **Action**: Process through `metadata_engine.generate_title(mode="first_sentence")`.
- **Expected Outcome**: Title length is strictly $\le 100$ characters. Appends `#Shorts` if duration $\le 60\text{s}$ without exceeding 100 chars.

### TC-META-02: YouTube 5,000 Byte Description Validation
- **Input**: A caption containing 6,000 multi-byte UTF-8 characters.
- **Expected Outcome**: Truncated to 5,000 UTF-8 bytes with clean boundary without broken surrogate pairs.

### TC-META-03: Instagram 2,200 Character & 30 Hashtag Limit
- **Input**: Caption with 40 hashtags.
- **Expected Outcome**: Validated to maximum 30 hashtags; excess hashtags pruned; total character count capped at 2,200.

---

## 5. Automation DAG Engine Test Cases

### TC-AUTO-01: Linear Pipeline Validation
- **Input**: Directed graph: `Import -> Optimize -> Draft -> Schedule`.
- **Action**: Run Kahn's topological sort.
- **Expected Outcome**: Returns valid sequential execution order with zero cycles.

### TC-AUTO-02: Cycle Detection & Rejection
- **Input**: Directed graph with loop: `Node A -> Node B -> Node C -> Node A`.
- **Action**: Validate graph.
- **Expected Outcome**: Raises `CyclicDependencyException("Workflow contains cycles and cannot be executed")`.

---

## 6. State Machine & Job Queue Test Cases

### TC-STM-01: Valid State Progression
- **Flow**: `QUEUED -> PROCESSING -> OPTIMIZING -> READY -> SCHEDULED -> DISPATCHING -> PUBLISHED`.
- **Expected Outcome**: Every transition updates `Job.status`, sets `updated_at`, and appends an entry to `audit_logs`.

### TC-STM-02: Invalid State Transition Rejection
- **Flow**: Attempt to move from `QUEUED` directly to `PUBLISHED` without processing.
- **Expected Outcome**: Raises `InvalidStateTransitionError`.

### TC-Q-01: Atomic Worker Lease & Deadlock Recovery
- **Scenario**: Worker leases a job with 60-second lock. Worker crashes (no heartbeats).
- **Action**: Next worker poll after 65 seconds.
- **Expected Outcome**: Stale lock detected, lease reclaimed, `retry_count` incremented, job processed to completion.

---

## 7. Idempotency & Duplicate Publishing Prevention

### TC-PUB-01: Unique Idempotency Key Enforcement
- **Scenario**: Two concurrent worker threads receive the same `PublishingIntent` dispatch.
- **Action**: Both attempt to insert into `publication_targets` with identical `(draft_id, account_id, scheduled_for)`.
- **Expected Outcome**: First thread succeeds; second thread encounters unique constraint clash, detects target already existing, and exits without re-uploading.
