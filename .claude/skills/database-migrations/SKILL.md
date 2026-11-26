---
name: database-migrations
description: Database schema design and Alembic migration management for SQLite and PostgreSQL.
---

# Database Migrations Skill

## Purpose
Manage SQLite and PostgreSQL compatible database schemas, indexes, foreign keys, and Alembic migrations.

## Applicable Tasks
- Adding or altering tables in api/app/models/.
- Authoring Alembic migrations in api/app/migrations/.
- Validating WAL mode and foreign key pragmas in SQLite.

## Implementation Rules
- Always enforce PRAGMA foreign_keys = ON; and PRAGMA journal_mode = WAL;.
- Use batch mode for SQLite migrations in Alembic.
- All timestamps must use DateTime(timezone=True) or ISO8601 strings.

## Required Validation
- Test upgrade and downgrade cycles against clean test databases.
- Verify indexes exist on shortcodes, hashes, foreign keys, and scheduled timestamps.

## Prohibited Practices
- Never perform unindexed table scans on large media or job queues.
- Never delete published records that are needed for deduplication.

## Completion Criteria
- Migration executes cleanly forward and backward without data corruption.
