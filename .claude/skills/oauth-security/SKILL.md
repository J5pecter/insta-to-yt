---
name: oauth-security
description: OAuth2 security, token encryption at rest, and PKCE verification.
---

# OAuth Security Skill

## Purpose
Secure OAuth flows and protect tokens for YouTube, Instagram, and local user sessions.

## Applicable Tasks
- Generating and verifying cryptographic state parameters and PKCE code verifiers.
- Encrypting refresh tokens and access tokens at rest with AES-GCM / Fernet.
- Managing secure HTTP-only cookies and session protection.

## Implementation Rules
- Master encryption key must be loaded from environment and never stored in database.
- State tokens must be short-lived (max 10 minutes) and single-use.
- Exact redirect URI matching must be enforced.

## Required Validation
- Verify tokens stored in the database are ciphertext, not plaintext.
- Confirm state tampering or mismatch terminates the OAuth callback with 400 Bad Request.

## Prohibited Practices
- Never send OAuth tokens to frontend JavaScript.
- Never log raw tokens or secret credentials.

## Completion Criteria
- OAuth tokens are encrypted at rest and callback endpoints are protected against CSRF.
