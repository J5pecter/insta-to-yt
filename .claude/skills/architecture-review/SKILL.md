---
name: architecture-review
description: Review system architecture, modularity, boundary enforcement, and cross-cutting concerns for SocialRelay.
---

# Architecture Review Skill

## Purpose
Ensure SocialRelay maintains strict separation of concerns, provider decoupling, single responsibility, and a zero-mandatory-subscription architecture.

## Applicable Tasks
- Adding or refactoring modules in backend or frontend.
- Reviewing boundaries between API, worker, scheduler, and storage.
- Ensuring zero vendor lock-in and modular provider adapters.

## Implementation Rules
- Keep platform adapters isolated in api/app/providers/.
- Ensure worker processes never directly interact with external UI dependencies.
- Enforce transactional consistency across database state changes.
- Ensure all datetime stamps are stored in UTC and converted to local user timezone for presentation.

## Required Validation
- Check that no direct circular imports exist between services.
- Verify provider failure in one platform cannot block another platform.

## Prohibited Practices
- Never tightly couple database models with external API responses.
- Never introduce mandatory paid SaaS or cloud middleware.

## Completion Criteria
- Architecture conforms to PRD, TRD, and ARCHITECTURE.md specifications.
