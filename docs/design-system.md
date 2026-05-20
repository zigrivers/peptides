# Design System

**Status:** Draft  
**Date:** 2026-05-20  
**Tech Stack source:** `docs/tech-stack.md`  
**Methodology:** deep | Depth: 5/5

---

## 1. Color Palette (WCAG 2.1 AA Compliant)

We use a high-contrast, clinical-but-modern palette suitable for a health-adjacent tool.

### 1.1 Brand Colors
| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `primary` | #2563eb (Blue 600) | #60a5fa (Blue 400) | Main actions, branding. |
| `secondary` | #64748b (Slate 500) | #94a3b8 (Slate 400) | Supporting elements. |
| `accent` | #0ea5e9 (Cyan 500) | #38bdf8 (Cyan 400) | Highlights, charts. |

### 1.2 Semantic Colors
| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `success` | #16a34a | #4ade80 | Logged doses, valid math. |
| `warning` | #d97706 | #fbbf24 | Low inventory, high dose alert. |
| `error` | #dc2626 | #f87171 | Sync failure, critical errors. |
| `info` | #0284c7 | #38bdf8 | Catalog info, help text. |

### 1.3 Neutral Scale
| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `bg` | #ffffff | #0f172a | Page background. |
| `card` | #f8fafc | #1e293b | Component containers. |
| `border` | #e2e8f0 | #334155 | Dividers, card borders. |
| `text-base`| #1e293b | #f1f5f9 | Main content. |
| `text-mute`| #64748b | #94a3b8 | Fine print, labels. |

---

## 2. Typography Scale (Modular Ratio: 1.250)

**Base Font**: `Inter`, System Sans-serif.  
**Mono Font**: `JetBrains Mono` (for dose math and IDs).

| Token | Size | Line Height | Use Case |
|-------|------|-------------|----------|
| `text-xs` | 0.75rem (12px) | 1rem | Badges, Helper text. |
| `text-sm` | 0.875rem (14px) | 1.25rem | Secondary text, Table cells. |
| `text-base`| 1rem (16px) | 1.5rem | Body text (Default). |
| `text-lg` | 1.25rem (20px) | 1.75rem | Subheadings. |
| `text-xl` | 1.5rem (24px) | 2rem | Section Headers. |
| `text-2xl` | 2rem (32px) | 2.5rem | Page Titles. |

---

## 3. Spacing System (Base: 4px)

| Token | Rem | Px | Use Case |
|-------|-----|----|----------|
| `s-1` | 0.25rem | 4px | Icon-to-text gap. |
| `s-2` | 0.5rem | 8px | Button padding-x. |
| `s-4` | 1rem | 16px | Card internal padding. |
| `s-6` | 1.5rem | 24px | Section vertical gap. |
| `s-8` | 2rem | 32px | Page gutter. |

---

## 4. Component Patterns

### 4.1 Actions (Buttons)
- **Primary**: Filled, rounded-md, `shadow-sm`.
- **Secondary**: Outlined, subtle border.
- **Ghost**: No background, primary text color.
- **Touch Gate**: Minimum height 44px for all mobile actions.

### 4.2 Feedback (Toasts & Banners)
- **Status Toast**: Bottom-right on desktop, Top-center on mobile.
- **Offline Banner**: Sticky at top of App Shell, high contrast amber.
- **Audit Alert**: Subtle inline notification on sensitive mutations.

### 4.3 Data Visualization
- **Charts**: Use `accents` and `secondary` for lines/bars.
- **Dose Status**: Green dot (Logged), Gray circle (Pending), Yellow dash (Skipped).

---

## 5. Responsive Breakpoints

- **Mobile**: < 640px (Single column, bottom nav).
- **Tablet**: 640px - 1024px (Grid, side rail).
- **Desktop**: > 1024px (Max content width 1200px, side drawer).

---

## 6. Accessibility Audit Checklist

- [ ] All primary text colors meet 4.5:1 contrast ratio.
- [ ] Tap targets are minimum 44x44px for touch interactions.
- [ ] Focus rings are visible (`border-medium` primary color).
- [ ] Aria-live regions announce sync completion and math warnings.
- [ ] Dark mode support follows system preference or manual toggle.
