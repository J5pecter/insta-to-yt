---
name: fastapi-development
description: FastAPI backend development guidelines for SocialRelay.
---

# FastAPI Development Skill

## Purpose
Standardize REST API v1 endpoints, dependency injection, Pydantic schemas, and error responses.

## Applicable Tasks
- Implementing endpoints under api/app/api/v1/.
- Writing dependency providers for authentication, database sessions, and services.
- Designing request/response Pydantic models.

## Implementation Rules
- All endpoints must declare explicit response_model and status codes.
- Use async def for I/O bound endpoints; use threadpools or background tasks for CPU/blocking work.
- Standard error envelope: {error: {code, message, details}}.

## Required Validation
- Ensure OpenAPI schemas generate cleanly at /api/v1/openapi.json.
- Unit and contract tests must cover valid, invalid, and unauthorized inputs.

## Prohibited Practices
- Never expose raw stack traces or internal server exceptions.
- Never block the main asyncio event loop with synchronous file or network I/O.

## Completion Criteria
- Endpoints pass automated contract and integration tests.
