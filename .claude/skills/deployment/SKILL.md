---
name: deployment
description: Docker Compose, Caddy reverse proxy, and local installation configurations.
---

# Deployment Skill

## Purpose
Provide rock-solid Docker Compose and direct local deployment configs for Windows, Linux, and macOS.

## Applicable Tasks
- Writing Dockerfiles for API, web frontend, and background worker.
- Authoring docker-compose.yml and Caddyfile.
- Creating native startup scripts (start.bat, start.sh).

## Implementation Rules
- Persist data and storage via named Docker volumes or local mounts.
- Configure healthchecks on services with automatic restart policies.
- Ensure the application starts seamlessly with one command.

## Required Validation
- Test local build and startup on Windows and Linux targets.
- Verify reverse proxy correctly proxies API and serves static web assets.

## Prohibited Practices
- Never hardcode environment credentials in Dockerfiles or compose files.
- Never run root processes inside production containers without need.

## Completion Criteria
- Application starts cleanly via docker compose up -d or native scripts.
