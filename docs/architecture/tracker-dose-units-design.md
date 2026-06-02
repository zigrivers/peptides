# Tracker "Units to Draw" — Design Spec

**Status:** Approved design (pre-implementation)
**Date:** 2026-06-02
**Related:** `lib/reconstitution/domain/ReconstitutionCalculator.ts`, `lib/reconstitution/domain/syringe.ts`, `docs/adrs/ADR-008-testing-strategy.md`, `.claude/rules/safety-math.md`

## 1. Problem & Goal

The Tracker shows a scheduled dose as a mass (e.g. `1 mg`), but the user has to draw
that dose on an insulin syringe and has no idea how many **units** to pull. We will
show, alongside each scheduled dose, the number of syringe units to draw — derived
from the user's syringe standard (default **U-100**) and the **reconstituted vial they
are actually drawing from**.

Worked example (the reported case): a `1 mg` dose drawn from a 20 mg vial reconstituted
with 2 mL BAC water = 10 mg/mL → 0.1 mL → **10 units (U-100)** (or 4 units on U-40).

## 2. Decisions (resolved during brainstorming)

| Question | Decision |
|----------|----------|
| Where to show units | **All dose surfaces:** calendar day-panel/tooltip, protocol detail page, batch-log review, dashboard "due today". |
| Display format | **Inline with standard:** `1 mg  ≈ 10 units (U-100)`. |
| Multiple reconstituted vials | **User selects the vial they're drawing from** (per-compound), default = today's FIFO pick. Selector shown only when ≥2 reconstituted vials exist for the compound. |
| Selection ↔ logging | The selected vial **drives both the displayed units and the vial deducted on log** (no display/log mismatch possible). |
| No active reconstituted vial (mcg/mg dose) | **Accurate-only:** show units only when a real vial concentration exists; otherwise show `1 mg · reconstitute to see units`. Never estimate a concentration. |
| Syringe standard | The **subject's** `User.syringeStandard` (default `U100`); managed users use their own. |

## 3. Architecture

### 3.1 Domain: a single source of truth for the math

Add a pure function (Decimal-only) in `lib/reconstitution/domain` — e.g.
`doseToSyringeUnits`:

```
doseToSyringeUnits(
  dose: DoseAmount,                       // { amount, unit: 'mcg'|'mg'|'IU'|'mL' }
  vialConcentration: { totalMg, bacWaterMl } | null,
  syringeStandard: 'U100' | 'U40'
): { computable: true; units: Decimal; injectionVolMl: Decimal }
 | { computable: false; reason: 'needs_vial' }
```

Rules:
- **mcg / mg** → requires `vialConcentration`. Delegates to `ReconstitutionCalculator`
  (`mg → mcg ×1000`; `units = injectionVolMl / volPerUnit`). If concentration is null →
  `{ computable: false, reason: 'needs_vial' }`.
- **mL** → `units = mL / getVolumePerUnit(standard)`. No vial needed.
- **IU** → `units = amount` (IU is already syringe units in this app — see
  `InventoryService.convertDoseToMg`'s IU branch, which treats 1 IU = `volPerUnit` mL).
  No vial needed.

This is the **only** place dose→units is computed, so the Tracker, the catalog
planner, and the standalone calculator cannot diverge. 100% branch coverage required
(`.claude/rules/safety-math.md`).

### 3.2 "Drawing-from" vial = the FIFO-active vial

Logging already deducts from the **FIFO-active vial** for `(userId, compoundId)`:

```
vial.findFirst({ where: { userId, compoundId, status: 'RECONSTITUTED' },
                 orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }] })
```
(`lib/tracker/application/BatchLogService.ts`).

Therefore **selecting the drawing-from vial = moving it to the front of the shelf**:
set the chosen vial's `shelfOrder` to `min(siblingShelfOrders) - 1` (single-row update),
within a transaction with an `AuditEvent` (safety-math rule). A new server action —
e.g. `setActiveVialAction(compoundId, vialId)` — performs this, validates the vial is a
`RECONSTITUTED` vial owned by the subject (identity-scoped: `where: { id, userId }`),
emits a new audit action (e.g. `VIAL_SET_ACTIVE`), and revalidates the affected views.

**Why this is the right minimal design:** display and the existing log both read the
same FIFO-active vial, so the "selection drives display AND log" requirement is
satisfied **with no change to the log action**, and the displayed units can never
disagree with the vial that is actually deducted. Trade-off: `shelfOrder` now also
encodes "currently drawing from" (front of shelf). Considered and rejected: an explicit
`Vial.activeForCompound` pointer — clearer semantically but adds a column, a migration,
and a change to every active-vial query, for no behavioral gain.

When the front-of-shelf vial depletes (`status → DEPLETED`), the next vial by
`shelfOrder`/`expiresAt` becomes active automatically — correct, no special handling.

### 3.3 Data flow & display surfaces

Each surface that renders a scheduled dose computes units via §3.1 using the §3.2
active vial and the subject's `syringeStandard`:

- **`TrackerCalendar`** (day-panel + tooltip): the dose string gains `≈ N units (U-100)`
  or the `· reconstitute to see units` prompt.
- **Protocol detail page** (`protocols/[id]`): same, next to the dose.
- **`BatchLogReview`**: per-dose units shown before confirming a batch log.
- **Dashboard "due today"**: same (already consumes `serializeVial`).

The **Tracker page must start fetching `syringeStandard`** (it doesn't today) — mirror
the dashboard/reconstitution pages (`prisma.user.findUnique({ select: { syringeStandard } })`,
default `'U100'`). The data the surfaces need per due-dose: `{ doseUnitsText | needsVial,
syringeStandard, activeVial, reconstitutedVialsForCompound[] }`. The reconstituted-vial
list (for the selector) is only required where the selector renders.

The per-compound **"drawing from [Vial ▾]" selector** renders only when ≥2
`RECONSTITUTED` vials exist for the compound; changing it calls
`setActiveVialAction` and the units re-render. Single-vial users never see it.

### 3.4 Format & copy

- Has active vial / computable: **`1 mg  ≈ 10 units (U-100)`** (units in muted/secondary
  weight; the `(U-100)` reflects the subject's standard).
- mcg/mg dose, no active vial: **`1 mg  · reconstitute to see units`**.
- mL / IU dose: always computable (no vial needed).

### 3.5 Safety guardrails

- Reuse the vial's existing `insufficientMedication` (remaining < dose) and
  `potentialDrawWaste` flags from `serializeVial`.
- Add a **capacity check**: if the dose needs more units than the subject's selected
  syringe size holds, surface a warning (consistent with the catalog planner's overflow
  alert and `WarningPolicy`).

## 4. Testing

- **Domain** (`doseToSyringeUnits`): 100% branch coverage — each unit (`mcg`, `mg`,
  `mL`, `IU`), U-100 and U-40, the no-vial `needs_vial` path, and the reported
  `1 mg / 20 mg / 2 mL → 10 units` case.
- **`setActiveVialAction`**: moves the chosen vial to shelf-front; rejects vials not
  owned by the subject or not `RECONSTITUTED`; writes the audit event; is idempotent.
- **Components**: units render on each surface; the no-vial prompt renders for mcg/mg
  without inventory; the "drawing from" selector appears only with ≥2 vials and updates
  units on change.

## 5. Phased implementation

- **Phase 1:** `doseToSyringeUnits` domain helper (+ tests) and units display on all
  four surfaces using the FIFO-active vial (no selector yet) + the no-vial prompt + the
  Tracker page `syringeStandard` fetch.
- **Phase 2:** the per-compound "drawing from" selector — `setActiveVialAction`
  (shelf-front + audit), the selector UI (≥2 vials), and the capacity-overflow warning.

## 6. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Displayed units differ from what's deducted on log | Eliminated by design: both read the same FIFO-active vial (§3.2). |
| `shelfOrder` overloaded (shelf position vs. active) | Accepted, documented; "front of shelf = drawing from" is a coherent mental model. Explicit pointer rejected as higher-cost (§3.2). |
| Wrong concentration if user has stale/expired vials | Active-vial query filters `status: 'RECONSTITUTED'`; expired/depleted excluded; no-vial → prompt, never an estimate. |
| Unit math drift across the app | Single domain helper (§3.1) is the only dose→units path. |
| Mutation without audit (safety-math rule) | `setActiveVialAction` wraps the `shelfOrder` update + `AuditEvent` in one transaction. |

## 7. Open questions (resolve in the implementation plan)

- Exact new audit action name(s) for the active-vial change (e.g. `VIAL_SET_ACTIVE`).
- Whether `serializeVial` should be extended to carry `unitsPerDose`, or whether the
  surfaces call `doseToSyringeUnits` directly with the active vial (leaning: surfaces
  call the helper; keep `serializeVial` focused on vial state/flags).
- Exact placement/styling of the per-compound selector within the calendar day-panel
  vs. the protocol detail page.
