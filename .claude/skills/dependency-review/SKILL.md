---
name: dependency-review
description: Audit dependencies for security, licenses, and zero-mandatory-cost compliance.
---

# Dependency Review Skill

## Purpose
Ensure all Python and npm dependencies are open-source, permissive-licensed, and free from mandatory subscriptions.

## Applicable Tasks
- Reviewing package.json and requirements.txt / pyproject.toml.
- Checking licenses (MIT, Apache 2.0, BSD).
- Auditing for known CVEs or vulnerable transitive packages.

## Implementation Rules
- Reject any library requiring a commercial subscription or paid telemetry.
- Lock dependency versions to prevent unexpected breaking updates.

## Required Validation
- Run pip audit or npm audit to identify security advisories.
- Verify all dependencies run offline without external cloud callbacks.

## Prohibited Practices
- Never include libraries that secretly phone home to commercial tracking servers.

## Completion Criteria
- All dependencies are free, open-source, and verified secure.
