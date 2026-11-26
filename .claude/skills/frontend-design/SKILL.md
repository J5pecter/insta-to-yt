---
name: frontend-design
description: Design and implement UI components adhering to SocialRelay design system and shadcn/ui patterns.
---

# Frontend Design Skill

## Purpose
Implement and maintain the premium SaaS charcoal dark/light design system for SocialRelay with consistent typography, spacing, and micro-interactions.

## Applicable Tasks
- Creating or editing React components in apps/web/src/components/.
- Designing page layouts, cards, modals, and drawers.
- Applying semantic tokens (#101218 dark background, #7C3AED violet accent).

## Implementation Rules
- Use Tailwind CSS with designated CSS variables and semantic tokens.
- Ensure all interactive elements have hover, focus-visible, and active states.
- Animations must be subtle (150-250ms) and respect prefers-reduced-motion.

## Required Validation
- Verify visual contrast ratios (minimum 4.5:1 for normal text).
- Check responsive behavior at 320px, 390px, 768px, 1024px, 1440px.

## Prohibited Practices
- No generic AI-generated templates with excessive gradients or glassmorphism.
- Never use non-semantic colors for critical status indications.

## Completion Criteria
- Components render without hydration/layout shifts and match DESIGN-SYSTEM.md.
