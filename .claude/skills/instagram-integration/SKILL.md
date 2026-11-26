---
name: instagram-integration
description: Official Instagram Graph API integration for business/creator reels publishing and media import.
---

# Instagram Integration Skill

## Purpose
Guide the implementation of authorized Instagram Reel importing and publishing via Meta Graph API.

## Applicable Tasks
- Authorizing accounts via Meta OAuth / Instagram Login.
- Importing authorized media, captions, and metrics.
- Publishing Reels via container creation, upload, status polling, and publishing.

## Implementation Rules
- Follow official Reels publishing flow: create container -> poll status -> publish.
- Enforce caption limits (<= 2200 chars, max 30 hashtags).
- Serve media via secure signed temporary URLs for Meta container ingestion.

## Required Validation
- Handle rate limits (x-app-usage) with bounded backoff.
- Provide manual export fallback when public callback serving is inaccessible.

## Prohibited Practices
- Never scrape private posts or bypass Meta access controls.
- Never use unofficial session-cookie harvesting.

## Completion Criteria
- Container upload and publish verification work reliably with comprehensive error handling.
