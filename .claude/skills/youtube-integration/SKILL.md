---
name: youtube-integration
description: YouTube Data API v3 publishing and channel management.
---

# YouTube Integration Skill

## Purpose
Manage YouTube Data API v3 integration for video and Shorts uploads, resumable uploads, and quota management.

## Applicable Tasks
- Implementing Google OAuth 2.0 with PKCE and offline token refresh.
- Executing chunked resumable video uploads to YouTube.
- Managing video metadata (titles <= 100 chars, descriptions <= 5000 bytes, tags).

## Implementation Rules
- Validate UTF-8 byte length for descriptions and character limits for titles.
- Support audience designation (madeForKids), privacy status, and category.
- Detect aspect ratio for automatic Shorts eligibility.

## Required Validation
- Handle quotaExceeded and uploadLimitExceeded with actionable user messages.
- Test token refresh logic for 7-day expiration in testing mode.

## Prohibited Practices
- Never create fake Google Cloud projects to bypass daily quota limits.
- Never assume a title over 100 characters will be accepted by YouTube.

## Completion Criteria
- Resumable uploads succeed with progress tracking and verified video ID return.
