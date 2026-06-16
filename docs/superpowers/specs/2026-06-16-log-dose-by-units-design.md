# Log Dose by Syringe Units — Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming) — pending implementation plan
**Domain:** `lib/reconstitution` (safety-critical — `Decimal` only, 100% branch coverage) + tracker UI

## Problem / Goal

When logging a dose, people actually measure what they drew in **syringe units**, not in mcg/mg.
Today the manual dose field is in the dose unit (mcg). Let the user enter the **syringe units they
drew** (against their default syringe standard) and show the **actual dose** those units represent
at the active vial's concentration — then log that actual dose. This is the inverse of the dose
amount the card already converts to units ("450 mcg ≈ 3.0 units (U-100)").

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Input model | **Units input + live dose readout** — replace the mcg field with a syringe-units field, pre-filled to the planned dose's units; the resulting actual dose updates as they type |
| No active vial | **Fall back to dose (mcg) entry** — units↔dose needs a concentration; without a reconstituted vial, show the existing dose-amount field |
| Compute location | **Client-side** via pure domain helpers (return strings; `Decimal` internal — no float, no `Decimal` across the prop boundary) |
| Logged value | The **computed actual dose** in the protocol's planned unit (mcg/mg/IU/mL). The DoseLogService per-dose override (already built) accepts it. |

## Non-goals (YAGNI)
- No change to how the card header renders the planned dose/units.
- No storing of "units" as a separate field — the dose amount is authoritative; units are always
  re-derived from the logged dose + vial for display (existing `buildLoggedDoseDisplay`).
- No batch-logging change; individual inline log flow only.
- No new syringe-size capacity gating here (the units field reflects what the user drew).

## Architecture

### A. Domain helper (new, pure, 100%-covered) — the inverse of `doseToSyringeUnits`
`lib/reconstitution/domain/doseUnits.ts` (co-located with its inverse):

```ts
// Returns the dose that drawing `units` syringe units yields at the given concentration,
// expressed in `targetUnit` (the protocol's planned unit). null when not computable
// (mcg/mg target with no concentration). Pure; Decimal internal.
export function syringeUnitsToDose(
  units: string,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: SyringeStandard,
  targetUnit: DoseUnit,
): { amount: string; unit: DoseUnit } | null;
```
Inverse rules (mirror `doseToSyringeUnits`):
- parse `units` as a positive Decimal; else `null`.
- `injectionVolMl = units × getVolumePerUnit(syringeStandard)`.
- `mL`   → `amount = injectionVolMl`.
- `IU`   → `amount = units` (1 IU = 1 syringe unit in this app; concentration-independent).
- `mcg`/`mg` → needs concentration; `doseMg = injectionVolMl × (totalMg / bacWaterMl)`;
  `amount = doseMg` (mg) or `doseMg × 1000` (mcg). `null` if concentration missing/invalid.
- Format `amount` with the app's display precision (reuse the existing formatting helper).

Plus a tiny display formatter for the readout (e.g. `"450 mcg"`), or the component formats the
returned `{amount, unit}` directly.

### B. Concentration plumbing (server → client)
`app/(dashboard)/tracker/page.tsx` already calls `resolveActiveVial(userId, compoundId)` per
compound to build `doseUnitsByCompoundId` (lines ~229-239). Capture that same vial's
concentration into a new map and pass it to the calendar:
```ts
vialConcentrationByCompoundId: Record<string, { totalMg: string; bacWaterMl: string | null }>
```
(Only compounds with an active vial appear in the map — absence drives the mcg fallback.) Add the
prop to `TrackerCalendar` (default `{}`).

### C. Tracker log panel (`TrackerCalendar.tsx`)
For each loggable event, in the expanded log panel where the DOSE field lives:
- `const concentration = vialConcentrationByCompoundId[e.compoundId] ?? null;`
- **Units mode** (when `concentration != null`):
  - Compute the **planned units** client-side: `doseToSyringeUnits(plannedDose, concentration,
    syringeStandard).units` → `.toFixed(1)` to pre-fill the field.
  - State `editUnits[e.id]` (string), pre-filled to planned units; reset restores it.
  - Render: `DOSE — Planned: {plannedUnits} units · {plannedDoseText}` / input `[ {units} ] units (U-100|U-40)` / readout `→ actual dose: {syringeUnitsToDose(...) formatted}`.
  - On change, recompute the readout live; if units invalid/empty, readout shows nothing and the
    log falls back to the planned dose (mirrors the existing blank-field fallback).
  - The `aria-live="polite"` readout announces the computed dose.
- **Dose mode** (when `concentration == null`): keep the existing mcg dose-amount field
  (`editAmount`) exactly as today.
- **On log (both online + offline paths):** compute the amount to send:
  - units mode → `syringeUnitsToDose(editUnits ?? plannedUnits, concentration, syringeStandard, plannedUnit)`; if it yields null/invalid, send the planned dose.
  - dose mode → existing `editAmount ?? planned` behavior.
  - Reuse the single `effectiveAmount` computed once (as the prior override fix did) so online and
    offline stay consistent. Clear `editUnits[e.id]` on success alongside `editAmount`.

### D. Boundaries unchanged
- DoseLogService already accepts a per-dose `amount` in the planned unit and validates it
  (positive, unit matches planned) — the computed dose flows straight in. No service change.
- `buildLoggedDoseDisplay` already re-derives units for the logged row from the stored dose +
  vial, so the logged card stays consistent with what was entered.

## Components / boundaries

| Unit | Responsibility |
|------|----------------|
| `lib/reconstitution/domain/doseUnits.ts` | add `syringeUnitsToDose` (inverse); pure, 100% covered |
| `lib/reconstitution/domain/doseUnits.test.ts` | inverse cases: mcg/mg with concentration at 1/2.5/3 units; IU & mL (concentration-independent); null when concentration missing for mcg/mg; invalid/zero units; round-trips with `doseToSyringeUnits` |
| `app/(dashboard)/tracker/page.tsx` | build + pass `vialConcentrationByCompoundId` |
| `app/(dashboard)/tracker/_components/TrackerCalendar.tsx` | units field + dose readout + pre-fill + reset; mcg fallback; compute `effectiveAmount` from units for online & offline logging |
| `app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx` | units field shows + pre-fills planned units; editing units updates readout; logs the computed dose; mcg fallback when no concentration |

## Testing
- **Domain (TDD, 100%):** `syringeUnitsToDose` inverse correctness (e.g. U-100, 15 mg/mL: 3.0 u →
  0.03 mL → 450 mcg; 2.5 u → 375 mcg); IU 2.0 u → 2 IU; mL passthrough; `null` for mcg target with
  null concentration; invalid/zero/non-numeric units → null; consistency with `doseToSyringeUnits`
  (units→dose→units stable).
- **Component (jsdom):** with a concentration for the compound, the DOSE field is a units input
  pre-filled to the planned units, a dose readout renders, editing units changes the readout, and
  Log Dose calls `logDoseAction` with the computed dose amount; without a concentration, the mcg
  field is shown and behaves as today.
- Full `pnpm check` green; reconstitution-domain coverage stays 100% for the new helper.

## Open items for the plan
- Exact readout precision for the actual dose (reuse `buildLoggedDoseDisplay`/existing formatter
  conventions: mcg whole-ish, mg 1–2 dp).
- Confirm `plannedUnit` source on the client event (`e.doseUnit`) and `plannedDose` (`{amount: e.doseAmount, unit: e.doseUnit}`).
- Keep the units field's `step`/decimals friendly (allow 0.5 increments; accept any positive decimal).
