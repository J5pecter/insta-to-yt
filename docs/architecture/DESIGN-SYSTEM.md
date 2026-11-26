# Design System & UI Specifications — SocialRelay

SocialRelay follows a minimalist, premium charcoal dark SaaS aesthetic with high contrast and accessible touch targets.

---

## 1. Color Palette & Semantic Tokens

### Dark Theme (Default)
| Token | Hex Value | Purpose |
|---|---|---|
| **Background** | `#101218` | Primary application canvas |
| **Surface** | `#181B23` | Cards, sidebars, header bars |
| **Elevated** | `#20242E` | Modals, active list items, input fields |
| **Border** | `#2C303A` | Structural component dividers |
| **Primary Accent** | `#7C3AED` | Primary buttons, active tabs, links (Violet) |
| **Primary Hover** | `#6D28D9` | Button hover and active states |
| **Foreground Text** | `#F8FAFC` | Primary high-contrast readable text |
| **Muted Text** | `#A1A1AA` | Secondary labels, descriptions, timestamps |
| **Success** | `#22C55E` | Published indicators, healthy checks |
| **Warning** | `#F59E0B` | In-review drafts, reconciliation alerts |
| **Destructive / Error** | `#EF4444` | Deletion actions, failed upload alerts |

---

## 2. Typography

- **Font Family**: `Inter, system-ui, -apple-system, sans-serif`
- **Scale**:
  - `Display / H1`: `24px` (`text-2xl`), font-bold (700), tracking-tight
  - `Card Header / H2`: `16px` (`text-base`), font-semibold (600)
  - `Body`: `14px` (`text-sm`), font-normal (400)
  - `Small / Captions`: `12px` (`text-xs`), font-medium (500)
  - `Micro / Badges`: `10px` (`text-[10px]`), font-bold (700), uppercase tracking-wider
  - `Monospace`: `font-mono` for IDs, SHA-256 hashes, timestamps, and JSON payloads.

---

## 3. Responsive Layout Guidelines

### Desktop Viewports (≥1024px)
- Persistent collapsible sidebar (64px collapsed, 256px expanded).
- Persistent top bar (64px height) with breadcrumbs and system stats.
- Multi-column grids (e.g. 5-col media preview + 7-col editor).

### Mobile Viewports (320px to 412px)
- Fixed bottom navigation bar (64px height) with safe-area bottom insets (`safe-bottom`).
- 4–5 primary destinations (`Overview`, `Import`, `New Post`, `Calendar`, `More`).
- Floating "+ Post" central circular button.
- Slide-up bottom sheets for filters and secondary actions.
- Touch targets minimum `44 × 44` CSS pixels.
- Zero horizontal scrolling traps.
