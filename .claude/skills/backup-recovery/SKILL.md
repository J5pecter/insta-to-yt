---
name: backup-recovery
description: Database backup, media archive generation, checksum validation, and restoration.
---

# Backup and Recovery Skill

## Purpose
Safeguard SocialRelay data and media assets with atomic backups and verified restoration.

## Applicable Tasks
- Creating SQLite online backups (sqlite3_backup) and media archives.
- Generating SHA-256 checksums for backup bundles.
- Implementing point-in-time restoration with integrity verification.

## Implementation Rules
- Use SQLite backup API or VACUUM INTO to avoid database lock contention.
- Store checksum manifest alongside every backup package.
- Verify backup integrity prior to attempting restoration.

## Required Validation
- Test full restore cycle on an empty test instance; verify all records match.
- Ensure media file references resolve after restore.

## Prohibited Practices
- Never copy SQLite database files while write transactions are active without WAL checkpoint.
- Never overwrite existing database without taking a rollback snapshot first.

## Completion Criteria
- Automated backup and restore procedures are tested, verified, and documented.
