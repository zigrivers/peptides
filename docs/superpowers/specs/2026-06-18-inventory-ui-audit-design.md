# Inventory UI Audit and Redesign

## Goal

Improve the Inventory view so users can quickly answer three questions:

- What do I have available right now?
- What needs attention before it becomes a problem?
- What action should I take next: add stock, mix a dry vial, switch active vial, update cost, or discard?

## Current State

The rendered `/reconstitution` Inventory page currently opens in the storage view. It has a strong visual metaphor: refrigerator/freezer sections, vial illustrations, and a shelf. This makes storage location clear, but it spreads the most important inventory facts across summary cards, storage tabs, and individual vial cards.

Observed issues:

- The default view prioritizes storage location over compound-level decision-making.
- Users must switch to "By compound" to compare ready vials, dry reserves, estimated doses left, active vial, and status.
- Active vial cards hide destructive actions until hover, which is weak on touch devices and less discoverable for keyboard users.
- Dry vial groups use clickable `div` headers instead of semantic buttons.
- The storage view has useful detail, but the decorative shelf treatment takes space without helping inventory maintenance.
- The compound list has good search and chips, but rows read like cards rather than a compact operating list for comparing compounds.
- Empty states explain the problem but do not always keep the next action close to the empty section.

Screenshots captured during audit:

- `test-results/ui-audit/inventory-current-desktop.png`
- `test-results/ui-audit/inventory-current-mobile.png`

## Research Applied

- Nielsen Norman Group describes dashboards as single-task, at-a-glance views for critical information, not expansive exploration views: https://www.nngroup.com/articles/dashboards-preattentive/
- NN/g data-table guidance says inventory-like lists should support finding records, comparing data, viewing/editing a row, and taking actions: https://www.nngroup.com/articles/data-tables/
- NN/g alert-fatigue guidance says dashboards should guide attention to critical values without unprioritized alert noise: https://www.nngroup.com/videos/alert-fatigue-user-interfaces/
- Material Design data-table guidance places filters and chips close to the data they affect: https://m2.material.io/components/data-tables
- W3C WCAG 2.2 target-size guidance requires pointer targets to be at least 24 by 24 CSS pixels or have sufficient spacing: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Vercel Web Interface Guidelines flag icon-only buttons without labels, non-semantic clickable elements, hidden hover-only actions, `transition-all`, hardcoded number/date formats, and missing focus states.

## Considered Approaches

### Option A: Tune the Existing Storage Default

Keep the refrigerator/freezer shelf as the first screen and improve the vial cards.

Pros: Lowest change risk, preserves the current visual concept.

Cons: Still makes users work harder to compare compounds and decide what needs action.

### Option B: Make Compound Overview the Default

Make "By compound" the default operating view. Treat storage as a secondary shelf-management view. Improve the compound rows into a compact, scan-friendly inventory list with visible actions and status.

Pros: Best match for the main user jobs: compare, find, maintain, and act. Supports both desktop and mobile.

Cons: Requires updating tests that currently expect storage as the default.

### Option C: Merge Storage and Compound Views

Create one unified page with compound rows and expandable storage details.

Pros: Fewer modes.

Cons: Higher implementation risk and more state complexity. Could bury shelf-order management.

## Recommended Direction

Implement Option B.

The compound overview should become the default because it is the best first screen for tracking inventory health. The storage view remains available for shelf-level management, drag ordering, and visual vial inspection.

## Implementation Plan

Files to modify:

- `app/(dashboard)/reconstitution/_components/ReconstitutionClient.tsx`
  - Default to `viewMode = 'compound'`.
  - Keep storage mode available.
  - Improve toggle labeling and focus styles.
- `app/(dashboard)/reconstitution/_components/InventoryDashboard.tsx`
  - Reframe top metrics around ready stock, dry reserves, and attention.
  - Add `aria-label` to the sound icon button.
  - Tighten card radius and reduce decorative transitions.
- `app/(dashboard)/reconstitution/_components/CompoundInventoryView.tsx`
  - Add result count, active filter feedback, clear filters, and no-results empty state.
  - Use table-like responsive rows for compound, ready stock, dry reserve, active vial, doses left, status, and actions.
  - Add visible focus states and `aria-pressed` to filters.
- `app/(dashboard)/reconstitution/_components/VialInventory.tsx`
  - Make destructive action discoverable with an accessible label.
  - Add a linear remaining-MG progress indicator to support quick comparison.
  - Remove decorative shelf strip.
- `app/(dashboard)/reconstitution/_components/DryInventoryList.tsx`
  - Convert clickable group header to a semantic button with `aria-expanded`.
  - Keep expiry and count visible in the header.

Tests to add/update:

- Update `ReconstitutionClient.test.tsx` so default mode is the compound overview.
- Add `CompoundInventoryView.test.tsx` coverage for result count, no-results state, and active filter clearing.
- Add `VialInventory.test.tsx` coverage for the remaining amount progressbar and accessible discard button.
- Add `DryInventoryList.test.tsx` coverage for semantic expandable group buttons.

## Success Criteria

- The first Inventory screen shows the compound-level operating list.
- Users can see ready count, dry reserve, remaining active vial amount, doses-left estimate, and attention status without opening each vial.
- Storage mode still supports current shelf tasks.
- Key actions remain visible and keyboard/touch accessible.
- Existing userId-scoped data access and Decimal math remain unchanged.
- Component tests pass.
- Browser verification covers desktop and mobile Inventory views.
