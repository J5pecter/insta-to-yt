---
name: automation-development
description: Build and validate automation workflows, trigger-condition-action graphs, and execution.
---

# Automation Development Skill

## Purpose
Develop visual DAG workflows, conditions, actions, and scheduled automation rules.

## Applicable Tasks
- Designing automation workflow definitions in JSON.
- Validating acyclic graph (DAG) structure and node connectivity.
- Executing workflow runs and recording granular run logs.

## Implementation Rules
- Prevent cyclic loops with cycle detection (topological sort).
- Provide a dry-run execution mode that simulates transitions without publishing.
- Support pausing, resuming, and deactivating workflows.

## Required Validation
- Ensure invalid or disconnected graphs fail validation before being enabled.
- Verify execution logs record input, condition results, and action outputs.

## Prohibited Practices
- Never allow unvalidated recursive workflows.
- Never automatically republish media without explicit user republication approval.

## Completion Criteria
- Automation engine validates and executes all 6 pre-built templates reliably.
