# Regimen UI Audit and Improvement Pass

**Date:** 2026-06-18
**Branch:** `codex/regimen-ui-audit`
**Surface:** `app/(dashboard)/regimen/page.tsx` and `app/(dashboard)/regimen/_components/RegimenClient.tsx`

## Current Information Architecture

The server page loads the signed-in user, managed active users, every protocol for those subjects, active or dry vials, cycle records, and server-built dose display strings. The client then renders:

- A header with a new protocol link.
- A subject selector, cards/summary toggle, and deactivated toggle.
- Card view by default, including a refill planner, protocol cards, lifecycle actions, and a mocked PubMed research feed.
- Summary view as an optional table of active/current or upcoming protocols with compound, dose, units, frequency, cycle, and runout.

## UX Problems

- The most practical view is not the default. Users land on large cards, refill widgets, and research content before the compact regimen comparison table.
- "Needs attention today" is not visible as a first-order concept. Inventory gaps, low stock, active schedules, upcoming starts, and paused regimens are scattered across cards and filters.
- Actions are not aligned with scanning. Edit, pause, resume, clone, and deactivate live at the bottom of each card; the summary table has no direct action column.
- Status language leaks internal terms such as `ACTIVE`, `PAUSED`, and `DEACTIVATED` instead of plain labels like "Taking now" or "Paused".
- The card view is visually heavier than the task requires. Rounded oversized cards, hover scale, decorative feed content, and a separate refill planner make the page feel more like a dashboard than a work surface.
- Mobile summary rows are promising, but the default card grid still creates long scrolling and pushes critical inventory/timing details away from primary actions.
- Accessibility issues to address while editing: consistent visible focus rings, no hover-only actions, semantic buttons/links, live error updates, and large enough tap targets.

## Research Sources

- Nielsen Norman Group, "Dashboards: Making Charts and Graphs Easier to Understand": dashboards should communicate critical, quickly consumed information for action, not become broad portals.
  https://www.nngroup.com/articles/dashboards-preattentive/
- Nielsen Norman Group, "Visual Hierarchy": use size, color, proximity, and common regions to direct users to the most important information.
  https://www.nngroup.com/videos/visual-hierarchy/
- Nielsen Norman Group, "Progressive Disclosure": initially show the most important options and defer specialized or advanced material.
  https://www.nngroup.com/articles/progressive-disclosure/
- Material Design, "Data tables": tables organize rows and columns for scanning and comparison.
  https://m2.material.io/components/data-tables
- Material Design, "Top Tips for Data Visualization and Accessibility": facilitate comparisons, focus on what matters, and provide structure.
  https://m3.material.io/blog/data-visualization-accessibility
- W3C WAI WCAG 2.2, Target Size Minimum: target size or spacing reduces accidental activation; important controls should be comfortably sized.
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C WAI WCAG 2.2, Focus Appearance: keyboard focus needs to be clearly visible and discernible.
  https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- NHS Digital Service Manual, Warning callout: warnings should be concise, specific, self-contained, and reserved for important health-impacting information.
  https://service-manual.nhs.uk/design-system/components/warning-callout
- CDC Health Literacy, Plain Language: reduce public-health jargon with common, everyday terms.
  https://www.cdc.gov/health-literacy/php/develop-materials/plain-language.html
- Home Office accessibility guidance for error messages: explain what went wrong, suggest how to fix it, and do not rely on color alone.
  https://design.homeoffice.gov.uk/accessibility/interactivity/error-messages
- Vercel Web Interface Guidelines fetched 2026-06-18 from:
  https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

## Design Principles for This View

- Default to a regimen workspace, not a decorative dashboard: compact comparison first, secondary research/detail content behind a less dominant path.
- Put attention first: a top strip should summarize due today, inventory issues, paused regimens, and total active regimens for the selected subject.
- Use a table on desktop for comparison; use stacked semantic row cards on mobile with the same labels and no hidden critical fields.
- Keep primary row actions visible: log/view daily tracker, edit, pause or resume, and maintain inventory. Put destructive deactivate behind the detailed card view or a less prominent row control.
- Use plain status labels: "Taking now", "Paused", "Upcoming", "Completed", "Inactive".
- Use alert hierarchy sparingly. Reserve strong red/amber styles for missing inventory or low runout. Avoid multiple warning blocks.
- Keep density calm: smaller headings, tabular numbers, restrained borders, no hover scale, no decorative feed as primary content.
- Preserve accessibility: semantic table, labels for form controls, focus-visible rings, aria-live for async errors, and min-height around 44px for important controls.

## Recommended Direction

Make Summary the default view and rename it conceptually as the active workspace. The top of the page should show a concise "today and maintenance" strip for the selected subject. The main table should carry the comparison fields users need repeatedly: compound, dose, schedule, cycle timing, inventory/runout, status, and actions. Keep Cards as a secondary details view for users who want research benefits, side effects, citations, clone, and deactivation controls.

Remove the mocked PubMed feed from the main Regimen experience. The reference catalog and compound profile pages are better homes for research. This keeps Regimen focused on maintaining and acting on plans.

## Implementation Plan

1. Add focused tests around the new default state and user-facing labels:
   - Summary table is visible by default.
   - The refill planner and PubMed feed are not visible in the default workspace.
   - The attention strip reports due today, inventory issues, paused regimens, and active regimen count.
   - Rows show plain status labels and visible action links/buttons.
   - Subject changes update the attention strip and summary rows.
   - Empty state guides users to create a protocol.
2. Refactor `RegimenClient`:
   - Default `viewMode` to `summary`.
   - Add helper functions for status labels, due-today detection, attention metrics, and action copy.
   - Add a compact attention strip above filters/table.
   - Add Status and Actions columns to the summary table.
   - Add focus-visible styles and `aria-live` for error banners.
   - Keep cards view available but remove the mocked PubMed feed.
3. Preserve existing data contracts:
   - No schema changes.
   - No new dose math path using `Float`; keep existing `Decimal` usage.
   - No change to server actions or audit-writing mutations.
4. Update tests first, verify they fail, then implement.
5. Verify with unit tests, typecheck, lint, browser QA at desktop and mobile widths, and project check if practical.

## Success Criteria

- A user landing on `/regimen` can immediately answer: what am I taking, what is due today, what is low or missing, where am I in the cycle, and what action should I take next?
- Active/current regimens are scannable in one dense table on desktop and readable stacked rows on mobile.
- Row actions are visible without requiring hover and use the correct element type: links for navigation, buttons for lifecycle mutations.
- Internal status strings are not shown to users in the primary table.
- The layout remains usable at mobile width without clipped labels, cramped buttons, or hidden critical information.
- Focused tests pass, and browser QA shows no obvious overlaps or broken states.
