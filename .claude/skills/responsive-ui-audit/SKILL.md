---
name: responsive-ui-audit
description: Audit layouts across mobile, tablet, and desktop viewports.
---

# Responsive UI Audit Skill

## Purpose
Ensure SocialRelay provides a first-class mobile experience and desktop dashboard without horizontal scrolling or touch traps.

## Applicable Tasks
- Auditing mobile viewport layouts (320px to 412px) and tablet/desktop layouts.
- Inspecting bottom navigation bars, sheets, and touch targets.

## Implementation Rules
- Touch targets must be at least 44x44 CSS pixels.
- On mobile, display 4-5 primary bottom navigation items with a More sheet.
- Video previews must maintain aspect ratios without distortion.

## Required Validation
- Verify that keyboard pop-up does not obscure submit buttons or active inputs.
- Ensure no accidental horizontal scrolling on mobile viewports.

## Prohibited Practices
- Never squeeze the desktop sidebar onto mobile; use responsive drawers/bottom nav.
- Never use fixed pixel widths on parent containers.

## Completion Criteria
- Viewport audits pass for 320px, 360px, 390px, 412px, 768px, 1024px, 1440px.
