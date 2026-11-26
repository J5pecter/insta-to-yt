---
name: job-reconciliation
description: Idempotency, failure recovery, remote state reconciliation, and duplication prevention.
---

# Job Reconciliation Skill

## Purpose
Prevent duplicate social media posts and handle network timeouts, crashes, and ambiguous states.

## Applicable Tasks
- Generating deterministic idempotency keys per asset, account, and intent.
- Handling timeouts during remote uploads or container polling.
- Transitioning ambiguous jobs to RECONCILIATION_REQUIRED.

## Implementation Rules
- Never blindly retry an upload if status after submission is uncertain.
- Query remote platform for media existence before re-initiating upload.
- Record remote container ID and upload session ID for every target.

## Required Validation
- Test worker crash simulation during upload; ensure no duplicate post occurs.
- Verify retry of partially published intent only targets the failed platform.

## Prohibited Practices
- Never delete the unique publishing key on failure.
- Never assume an upload failed if a network socket timed out after byte transfer.

## Completion Criteria
- System reconciles ambiguous states and prevents 100% of duplicate posts.
