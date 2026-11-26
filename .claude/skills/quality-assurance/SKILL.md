---
name: quality-assurance
description: Testing methodology, test suite execution, and regression prevention.
---

# Quality Assurance Skill

## Purpose
Execute unit, integration, API contract, and end-to-end tests across the entire SocialRelay codebase.

## Applicable Tasks
- Writing and running pytest suites for backend modules.
- Writing and running Playwright/Vitest tests for frontend components.
- Maintaining test fixtures, mocks, and test environments.

## Implementation Rules
- All external social media APIs must be mocked in automated tests.
- Never publish real media during test execution.
- Maintain independent test database fixtures with automatic teardown.

## Required Validation
- Verify all critical business scenarios (Section 29) pass.
- Measure and report real test execution results in TEST-REPORT.md.

## Prohibited Practices
- Never use fake or passing asserts that test nothing.
- Never skip failing tests without fixing the root cause.

## Completion Criteria
- Test suite passes cleanly with zero regressions.
