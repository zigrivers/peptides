# Reconstitution Syringe-Units Preview — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — pending implementation plan
**Domain:** `lib/reconstitution` (safety-critical — `Decimal` only, 100% branch coverage)

## Problem / Goal

In the **Add Reconstituted Vial** modal, once a user picks a compound, vial size (mg), and
BAC water volume (mL), they have no feedback on what that concentration means in practice.
They can't easily decide how much BAC water to add. Show, live, the **syringe units they'd
draw for each dosing-guidance range** (Conservative / Typical / Aggressive) at the entered
concentration, so they can see how 1 mL vs 2 mL changes the units and pick a volume that's
easy to measure.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Layout | **Live 3-range preview** card under BAC Water; recomputes as vial size / BAC water change |
| Smart guidance | **Add a suggested-volume hint** (nudge when the typical dose is too small to measure precisely, and warn when a dose nears/exceeds the syringe capacity) |
| Compute location | **Client-side**, via the existing pure `buildDoseUnitsDisplay` (returns strings, `Decimal` internal — no float, no `Decimal` crossing the prop boundary). Instant feedback as the user types. |
| Ranges source | `selectedCompound.profile.dosingLow / dosingTypical / dosingHigh` (already available to the modal) |

## Non-goals (YAGNI)
- No volume-comparison matrix (chose the live preview; the user compares by editing BAC water).
- No change to how vials are saved or to the dosing-units math itself — this is a read-only preview.
- No persistence; nothing stored. Pure derived display.
- No change to other modal fields (expiry auto-population, freezer pull, etc.).

## Architecture

### A. Domain helper (new, pure, 100%-covered)
`lib/reconstitution/domain/reconstitutionPreview.ts`:

```ts
export type ReconPreviewRow = {
  label: 'Conservative' | 'Typical' | 'Aggressive';
  doseText: string;            // e.g. "500 mcg"
  unitsText: string | null;    // from buildDoseUnitsDisplay, e.g. "≈ 10.0 units (U-100)"
  exceedsSyringe: boolean;     // true when units > syringe capacity (only if syringeSize known)
};

export type ReconstitutionPreview = {
  computable: boolean;             // false when ranges/inputs missing or invalid
  concentrationText: string | null; // "10 mg in 2 mL (5 mg/mL)"
  rows: ReconPreviewRow[];         // [] when not computable
  hint: string | null;            // suggested-volume nudge (💡)
  warning: string | null;         // syringe-capacity warning (⚠)
};

export function buildReconstitutionPreview(input: {
  ranges: { low: DoseAmount; typical: DoseAmount; high: DoseAmount } | null;
  totalMg: string;
  bacWaterMl: string;
  syringeStandard: SyringeStandard;
  syringeSize?: SyringeSize;
}): ReconstitutionPreview;
```

- Each row's `unitsText` comes from `buildDoseUnitsDisplay(dose, { totalMg, bacWaterMl }, syringeStandard, syringeSize)`. `exceedsSyringe` from that helper's `warning` (units > syringe max).
- `concentrationText`: `{totalMg} mg in {bacWaterMl} mL ({mg/mL} mg/mL)` with the mg/mL computed via `Decimal` (one–two decimals).
- Returns `computable: false` (empty rows, null hint/warning) when ranges are absent, or `totalMg`/`bacWaterMl` are non-positive/unparseable — so the UI simply hides the card.

**Hint logic (named constants, documented):**
- `MIN_PULLABLE_UNITS = 5`, `TARGET_TYPICAL_UNITS = 20`.
- Units scale linearly with BAC water (for mcg/mg doses), so a suggested volume is exact:
  `suggestedMl = bacWaterMl × (TARGET_TYPICAL_UNITS / typicalUnits)`, rounded to the nearest
  0.5 mL, clamped to [0.5, 10].
- If the **typical** dose is computable and `typicalUnits < MIN_PULLABLE_UNITS`:
  `hint = "💡 At {bac} mL the typical dose is only {typicalUnits}u — hard to measure precisely. Try ~{suggestedMl} mL → ~{unitsAtSuggested}u."`
  (Only when `suggestedMl` differs meaningfully from the current value.)
- If `syringeSize` is known and **any** range exceeds the syringe max:
  `warning = "⚠ At {bac} mL the {label} dose ({units}u) exceeds your {max}-unit syringe — consider less BAC water."` (report the highest offending range).
- `hint`/`warning` are independent and may both appear; both are advisory (never block saving).
- IU- or mL-dosed ranges: `buildDoseUnitsDisplay` already handles them; the hint logic only
  triggers off the typical row's computed units regardless of unit.

### B. Modal UI (`AddActiveVialModal.tsx`)
- Add props: `syringeStandard: SyringeStandard` (default `'U100'`) and `syringeSize?: SyringeSize`.
- `useMemo` the preview from `profile?.dosingLow/Typical/High`, `totalMg`, `bacWaterMl`,
  `syringeStandard`, `syringeSize`. Recomputes reactively on every relevant change.
- Render a **Syringe preview** card directly **below the BAC Water Volume field** (the input
  that drives it), shown only when `preview.computable`:
  - Header line: `Syringe preview — {concentrationText} · {U-100|U-40}`.
  - Three rows: `{label}  {doseText}  →  {units}` (right-aligned units; mono/tabular).
  - A row whose `exceedsSyringe` is true is de-emphasized/flagged inline.
  - `hint` (💡, neutral/info styling) and `warning` (⚠, amber) below the rows when present.
- Accessible: the card is `aria-live="polite"` so screen readers announce updated units as
  inputs change; rows are a simple description list, not a layout table.

### C. Prop threading
- `app/(dashboard)/reconstitution/page.tsx` already resolves `syringeStandard` and selects
  `syringeSize`. Thread `syringeStandard` + `syringeSize` through `ReconstitutionClient` to the
  `AddActiveVialModal` render (add to the client's props if not already passed).
- The tracker's inline add-inventory modal (added earlier) passes no syringe settings → the
  defaults (`'U100'`, no `syringeSize`) apply; the preview still renders units (no capacity
  warning there). Acceptable; tracker is not the primary reconstitution surface.

## Components / boundaries

| Unit | Responsibility |
|------|----------------|
| `lib/reconstitution/domain/reconstitutionPreview.ts` | Pure preview builder (rows + hint + warning); 100% covered |
| `lib/reconstitution/domain/reconstitutionPreview.test.ts` | Range→units, concentration text, hint thresholds, capacity warning, edge/invalid inputs |
| `app/(dashboard)/reconstitution/_components/AddActiveVialModal.tsx` | Render the preview card; new syringe props; reactive memo |
| `app/(dashboard)/reconstitution/_components/ReconstitutionClient.tsx` | Forward `syringeStandard` + `syringeSize` to the modal |
| `app/(dashboard)/reconstitution/page.tsx` | Pass `syringeSize` through (already passes `syringeStandard`) |

## Testing
- **Domain (TDD, 100%):** mcg & mg ranges → correct units at 1/2/3 mL; concentration text;
  `MIN_PULLABLE_UNITS` hint fires when typical < 5u and suggests a volume that lands ~20u;
  no hint when typical already comfortable; capacity `warning` when a range exceeds `syringeSize`
  and none when within; `computable: false` for missing ranges / zero / non-numeric inputs;
  IU/mL ranges pass through without crashing.
- **Component (jsdom):** card hidden until compound + valid totalMg + valid bacWaterMl; shows 3
  rows with units; updates when bacWaterMl changes (1 mL vs 2 mL differ); hint/warning render
  when triggered; card hidden when the compound has no profile/ranges.
- Full `pnpm check` green; reconstitution-domain coverage stays 100%.

## Open items for the plan
- Exact rounding/formatting for `concentrationText` mg/mL (reuse the app's display conventions).
- Confirm `syringeSize` is available to `ReconstitutionClient` or add the prop pass-through.
- Whether to show a subtle positive state ("all doses measurable") — default: show nothing when
  neither hint nor warning applies (keep the card quiet).
