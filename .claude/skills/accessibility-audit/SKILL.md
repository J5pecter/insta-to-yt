---
name: accessibility-audit
description: WCAG 2.1 AA accessibility auditing and enforcement for the web frontend.
---

# Accessibility Audit Skill

## Purpose
Ensure SocialRelay web interface is fully accessible via keyboard, screen readers, and high-contrast modes.

## Applicable Tasks
- Auditing ARIA roles, labels, and landmarks.
- Checking focus order and keyboard traps.
- Verifying color contrast and reduced motion support.

## Implementation Rules
- All interactive controls must have accessible names (aria-label or visible text).
- Focus indicators must be prominent and visible in both dark and light modes.
- Support keyboard shortcuts and Escape key to close modals/drawers.

## Required Validation
- Verify tab navigation flows logically through forms and cards.
- Test with prefers-reduced-motion media query enabled.

## Prohibited Practices
- Never use color alone to convey job or validation status.
- Never remove focus outlines without providing an accessible alternative.

## Completion Criteria
- Interface conforms to WCAG 2.1 AA standards.
