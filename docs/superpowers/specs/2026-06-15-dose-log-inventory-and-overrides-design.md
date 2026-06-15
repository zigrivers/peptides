# Dose-Logging UX: Friendly Inventory, Cadence, & Per-Dose Override — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — pending implementation plan
**Relates to:** ADR-? (no new ADR; behavioral change in tracker + reconstitution reuse)

## Problem / Goal

Three related friction points on the Daily Tracker's dose card:

1. **Raw error leak.** Logging a dose surfaces a bare `insufficient_inventory` code. The
   chain: a `LOGGED` dose auto-resolves the active vial and calls
   `decrementVialInventory`, which throws `insufficient_inventory` when the vial can't
   cover the dose; the action's generic `unknown` catch dumps the raw message to the UI.
   (A second path — zero vials — already logs with a *soft* warning, but that warning is
   silently dropped by the inline log flow and never shown.)
2. **No cadence reminder.** The card shows the dose and route but not how often the dose
   is taken, so users lack an at-a-glance reminder of their schedule.
3. **No per-dose amount override.** The logged amount is forced to the protocol's planned
   dose; users can't record that they actually took a different amount on a given day.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Insufficient inventory: block vs allow | **Allow with a non-blocking warning** (never hard-fail) |
| Add-inventory affordance | **Reuse the existing `AddActiveVialModal`**, pre-filled with the compound |
| After adding inventory | **Auto-retry the log** so the dose binds to + decrements the new vial |
| Cadence placement | **Append to the route line** — `Subq · Every other day` |
| Dose override interaction | **Editable Dose field in the log panel**, pre-filled with the planned amount |
| Dose override scope | **Amount only**, one-time per log; unit stays the regimen's unit; regimen unchanged |

## Non-goals (YAGNI)

- No high-dose-range safety warning wiring (`dose_above_high_range` is defined but not
  currently emitted; adding it is out of scope — the override does not regress any gate).
- No unit conversion / unit override in the dose field (amount only; unit shown read-only).
- No partial decrement on shortfall (avoids stranded remainders / negative inventory).
- No change to batch logging (`BatchLogService`) — it has its own hard-fail behavior; this
  spec is the individual inline log flow only.
- No change to the regimen/protocol planned dose — overrides are per-occurrence.
- No new identity-scoping exceptions; all reads/writes stay userId-scoped.

## Architecture

### A. Inventory never hard-fails the log

`lib/tracker/application/DoseLogService.ts` (new-log path, ~line 364–393):

- When `status === 'LOGGED'` and a vial is resolved (`effectiveVialId`), attempt the
  decrement. If the vial **fully covers** the dose → decrement as today (no change).
- If the resolved vial **cannot cover** the dose (the `decrementVialInventory` shortfall,
  which currently throws `insufficient_inventory`), **catch it**, **skip the decrement**,
  and push a `{ code: 'insufficient_inventory', message }` warning instead of throwing.
  Carry the compound name in the message (e.g. *"Your active Testosterone vial couldn't
  cover this dose."*). The dose still logs (`vialId` stored as `null`).
- Zero vials (existing soft-warning path, ~line 251) is unchanged but the warning message
  is unified with the above.
- **Re-bind on retry:** an existing `LOGGED` dose whose stored `vialId` is `null` is no
  longer treated as an idempotent no-op when inventory is now available. On a re-log,
  re-resolve the active vial, decrement it, and set `vialId`. Guarded so it decrements
  **at most once** (only fires when `existing.vialId === null` and a covering vial now
  exists). This is what makes "auto-retry after adding inventory" reconcile inventory.

`decrementVialInventory` itself is unchanged (still throws on shortfall); the *new-log
path* wraps the call and converts the shortfall to a warning. The thrown sentinel is
matched precisely (`/^insufficient_inventory$/`) so unrelated failures still propagate.

### B. Per-dose amount override

- The action `app/actions/tracker/log-dose.ts` already accepts `amount`. `DoseLogService`
  currently overrides it with `protocol.dose` for new logs (the "authoritative amount").
  Change: **use the caller-supplied `amount`** as the logged amount (validated: positive
  Decimal, allowed unit). The protocol's planned dose remains the *default* the UI
  pre-fills; the regimen row is never mutated.
- Validation: reject non-positive / unparseable amounts (`invalid_input`). Unit must equal
  the protocol's dose unit (UI sends it read-only); mismatches are rejected defensively.
- Inventory decrement (§A) uses the **actual logged amount**, so an overridden dose
  deducts the right quantity.

### C. Cadence on the card

- Extract a single shared humanizer `formatScheduleFrequency(schedule): string` into
  `lib/tracker/domain/schedule.ts` (or co-located domain util), covering all variants:
  `Daily → "Daily"`, `TwiceDaily → "Twice daily"`, `EOD → "Every other day"`,
  `SpecificDaysOfWeek → "Mon, Wed, Fri"`, `TwiceSpecificDaysOfWeek → "Twice daily on …"`,
  `CustomInterval → "Every N days"`. Replace the duplicated inline versions in
  `RegimenClient.tsx` and `CreateProtocolForm.tsx` with this shared util (no behavior
  change there).
- Add an optional `scheduleSummary?: string` to the `CalendarEvent` type, populated from
  the owning protocol's `schedule` when building both scheduled and logged events.
- Render it on the route line: `Subq · Every other day`. Omit gracefully when unknown.

### D. Inline add-inventory + auto-retry (UI)

`app/(dashboard)/tracker/_components/TrackerCalendar.tsx`:

- **Surface warnings.** The inline log flow currently ignores `result.warnings` on
  success. Add `logWarnings` state keyed by event id; on a successful log carrying an
  `insufficient_inventory` warning, store it and render a friendly, non-error styled note
  on the (now `LOGGED`) card with a **[+ Add inventory]** button.
- **Dose field.** In the expanded log panel (where site + notes live), add an optional
  **Dose** input pre-filled with the planned amount, a `Planned: {amount} {unit}` hint, a
  reset control, and a subtle "changed" indicator. State keyed by event id (mirrors
  `editNotes` / `editSite`). The edited amount flows into `logDoseAction({ amount })`.
- **Add-inventory modal.** Clicking **[+ Add inventory]** opens `AddActiveVialModal`
  pre-filled with the event's compound (`compoundId`). On `onSuccess`, close the modal and
  **auto-retry** the same dose log (same site / notes / amount) so it binds + decrements
  the new vial and the warning clears.

`app/(dashboard)/tracker/page.tsx`:

- Fetch the user's dry vials (`getDryVialsForUser` → `serializeVial`) and assemble the
  compounds list shape the modal expects (`Pick<Compound,'id'|'name'|'profile'|'slug'>[]`),
  passing both to `TrackerCalendar`. Existing tracker data is reused; this is additive.

### E. Friendly error mapping

`app/actions/tracker/log-dose.ts`:

- Add an explicit `insufficient_inventory` → friendly message branch (defensive — most
  cases now return as a success-with-warning, but a residual throw must not leak a code).
- Replace the terminal `unknown` fallback's raw `msg` with a friendly generic
  (*"Something went wrong logging this dose. Please try again."*) while preserving the
  already-mapped, intentionally-surfaced messages (protocol not found / not active, etc.).

## Components / boundaries

| Unit | Responsibility |
|------|----------------|
| `lib/tracker/domain/schedule.ts` (new) | `formatScheduleFrequency(schedule)` shared humanizer |
| `lib/tracker/application/DoseLogService.ts` | shortfall→warning; honor caller amount; re-bind vial on retry |
| `app/actions/tracker/log-dose.ts` | friendly error mapping; pass through warnings + amount |
| `app/(dashboard)/tracker/_components/TrackerCalendar.tsx` | cadence on card; dose field; warning display; add-inventory modal + auto-retry |
| `app/(dashboard)/tracker/page.tsx` | provide `dryVials` + compounds list to the calendar |
| `app/(dashboard)/reconstitution/_components/AddActiveVialModal.tsx` | reused as-is (already supports `onSuccess`, `compounds`, `dryVials`) |
| `RegimenClient.tsx`, `CreateProtocolForm.tsx` | swap inline frequency strings for the shared util |

## Testing (TDD)

- **`formatScheduleFrequency`** — each of the 6 variants → expected label; empty/edge days.
- **DoseLogService**
  - LOGGED with a covering vial → decrements, no warning (unchanged).
  - LOGGED with a vial that can't cover → logs, `vialId` null, `insufficient_inventory`
    warning, **no throw**, no decrement.
  - LOGGED with zero vials → logs with the same warning (unchanged behavior, unified msg).
  - Re-log of a `vialId: null` LOGGED dose after inventory exists → binds vial, decrements
    once, warning gone; second re-log does not double-decrement.
  - Caller-supplied amount ≠ planned → logged amount is the caller's; regimen row
    unchanged; decrement uses the actual amount; invalid amounts rejected.
- **log-dose action** — `insufficient_inventory` thrown → friendly message; unknown error
  → friendly generic; mapped errors (not active, etc.) preserved; warnings returned.
- **TrackerCalendar (jsdom)**
  - Cadence renders on the route line (`Subq · Every other day`).
  - Dose field pre-fills planned amount; editing then logging sends the edited amount;
    reset restores planned; "changed" indicator toggles.
  - Insufficient-inventory warning renders friendly (not error-styled) with **Add
    inventory**; clicking opens the modal pre-filled with the compound; modal `onSuccess`
    auto-retries the log.
- Full `pnpm check` green; coverage gates for safety dirs unaffected (no math changes).

## Sequencing note (for the plan)

Independent, shippable slices, low→high risk:
1. Shared `formatScheduleFrequency` + cadence on the card (pure, isolated).
2. Friendly error mapping in the action (small, defensive).
3. DoseLogService: shortfall→warning + honor amount + re-bind on retry (core logic, TDD).
4. UI: warning display + Add-inventory modal + auto-retry + dose field + page plumbing.

## Open items for the plan

- Exact guard for "re-bind vial once" (condition: `existing.status === 'LOGGED' &&
  existing.vialId === null && status === 'LOGGED' && a covering vial resolves`).
- Whether the dose field shows the recomputed unit preview (≈ units / mg). Default: **no**
  live recompute client-side (server recomputes on log); revisit only if trivial.
- Confirm the compounds list shape available on the tracker page matches the modal's
  `Pick<Compound,…>` without extra queries.
