# Regimen "Summary" View Improvements — Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming) — pending implementation plan
**Surface:** `app/(dashboard)/regimen/_components/RegimenClient.tsx` → `RegimenSummaryView`

## Problem / Goal

The Regimen → Summary table under-informs and is inconsistent. Most visibly, the "Dose / Frequency"
cell shows only the raw protocol unit (`450 mcg` OR `5 mg` OR `2 IU`) plus cadence — **no syringe
units**, no normalized amount, so rows aren't comparable and don't tie back to what the user actually
draws. It also omits cycle progress (the headline on the tracker card) and the plain-language "why".

Make the Summary a genuinely useful at-a-glance view of each active regimen.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Dose amount format | **mg-normalized primary, natural unit secondary** — `0.45 mg (450 mcg)` |
| Layout | **Split columns**: Dose · Units · Frequency (was one "Dose / Frequency" cell) |
| Scope | **Enriched**: dose fix + **cycle progress** (week X of Y / rest) + **"why" one-liner** + reordered columns |
| Units source | The compound's active **RECONSTITUTED** vial concentration (already loaded for runout) |
| Compute location | **Server-built display strings** (page.tsx), passed to the client (no `Decimal` props). NB: this component already does some client-side `Decimal` math for runout; new dose/units display is built server-side for cleanliness/consistency with the tracker. |

## Non-goals (YAGNI)
- No next-dose / adherence / cost-per-week (that was the "full rethink" option — not chosen).
- No change to the runout forecast logic or the cards view.
- No change to how doses are stored or logged.
- No batch edits from the Summary.

## Architecture

### A. Server-built per-protocol display (page.tsx)
`app/(dashboard)/regimen/page.tsx` already loads protocols + vials (`RECONSTITUTED`/`DRY`,
`totalMg`/`bacWaterMl`/`remainingMg`) + each user's `syringeStandard`. Add a per-protocol display map
passed to the client:
```ts
type RegimenDoseDisplay = {
  doseText: string;        // "0.45 mg (450 mcg)"  | "5 mg" | "2 IU"
  unitsText: string | null;// "≈ 3.0 units (U-100)" | "· reconstitute to see units" | null
  frequencyText: string;   // formatScheduleFrequency(schedule)
  perDayNote: string | null;// "×2/day" for twice-daily, else null
};
doseDisplayByProtocolId: Record<string, RegimenDoseDisplay>
```
Built with existing safety-domain helpers:
- **Units:** pick the compound's active reconstituted vial (same selection the runout uses) →
  `buildDoseUnitsDisplay(dose, { totalMg, bacWaterMl }, syringeStandard)` → `unitsText`. No vial →
  `· reconstitute to see units`.
- **mg-normalized amount:** mcg → `/1000` mg; mg → as-is; **IU/mL → `convertDoseToMg(dose, vial,
  syringeStandard)`** (needs the vial). When mg isn't derivable (IU/mL with no vial), show the natural
  unit only (no parenthetical). Always keep the natural unit in parens when normalization applied
  (`0.45 mg (450 mcg)`); when the natural unit IS mg, just `5 mg`.
- Format mg with the app's dose-display precision (reuse the reconstitution formatter); avoid trailing
  zeros.

### B. Cycle progress (plumb + render) — HEAVIER PATH (cycle-DB-accurate, chosen)
- Reuse the tracker's exact `getWeekInfo(proto, profile, todayStr, cycles)` (currently exported +
  unit-tested in `TrackerCalendar.tsx`; `WeekInfo` interface + `parseAsUTCDay` helper alongside).
  **Extract these into a shared pure module** `lib/tracker/domain/cycleProgress.ts`, have
  `TrackerCalendar.tsx` import from there (no behavior change), and move the existing `getWeekInfo`
  unit tests to `cycleProgress.test.ts`.
- Plumb `cycleLengthWeeks` + `restPeriodWeeks` from `compound.profile` (NOT currently mapped in
  page.tsx) into the client protocol shape.
- **Fetch the cycle records** for the active protocols' `cycleId`s and build a
  `cycles: Record<cycleId, { startDate: string; endDate: string | null }>` map (the accurate source
  for cycle start + rest date), passed to the client.
- Render per protocol via `getWeekInfo`: cycled → `Week {weekNumber} of {totalWeeks}` + muted
  `· rest ~{restStartDate}`; continuous → `Continuous`. (`restStartDate` comes from the cycle's
  `endDate` when present, else start + cycleLength — exact per the existing logic.)

### C. "Why" one-liner
- Use `getCompoundWhyStatement(compound.name)` (`lib/reference/domain/whyStatements.ts`). Render as a
  muted, single-line (truncated, `title` tooltip) sub-line under the compound name. Omit if null.

### D. Columns (reordered for scanning)
Desktop table (mobile keeps the existing stacked `md:hidden`-label pattern):

| # | Column | Content |
|---|--------|---------|
| 1 | **Compound** | name (link) + route badge + timing label; sub-line: "why" one-liner (truncated); sub-line: category chips |
| 2 | **Dose** | `0.45 mg (450 mcg)` + `×2/day` note when twice-daily |
| 3 | **Units** | `≈ 3.0 units (U-100)` or `· reconstitute to see units` |
| 4 | **Frequency** | `Daily` / `Every other day` / `Twice daily` |
| 5 | **Cycle** | `Week 2 of 4 · rest ~Jul 3` / `Continuous`; small `Started <date>` underneath |
| 6 | **Runout** | unchanged (badge + days-left) |

(Categories + Start fold into columns 1 / 5 to keep the count at 6. Final column count/order is
tunable during implementation if it reads too dense.)

ASCII (desktop row):
```
Compound            Dose              Units              Frequency  Cycle              Runout
KPV  SubQ           0.45 mg           ≈ 3.0 units        Daily      Week 2 of 4        ● 18 days
Cools gut & skin…   (450 mcg)         (U-100)                       rest ~Jul 3        left
[anti-inflammatory]                                                 Started May 12
```

### E. Accessibility & honest framing
- Keep the semantic `<table aria-label="Active regimen summary">` and the mobile per-cell labels;
  add labels for the new columns.
- "reconstitute to see units" mirrors the tracker's wording.
- No "FDA-approved" implications (none added here).

## Components / boundaries

| Unit | Responsibility |
|------|----------------|
| `app/(dashboard)/regimen/page.tsx` | build `doseDisplayByProtocolId`; plumb `cycleLengthWeeks`/`restPeriodWeeks` |
| `lib/reconstitution/domain/...` | reuse `buildDoseUnitsDisplay` + `convertDoseToMg`; add a small mg-normalize display helper if one doesn't fit (TDD, 100%) |
| `RegimenSummaryView` (RegimenClient.tsx) | new split columns + cycle + why; render server-built strings |
| `RegimenClient.test.tsx` | dose/units/frequency split renders; mg-normalized + natural unit; "reconstitute to see units" when no vial; cycle label; why one-liner |

## Testing
- Domain: any new mg-normalize/display helper at 100% (mcg→mg, mg passthrough, IU/mL via vial,
  no-vial fallback, invalid inputs).
- Component: Summary renders Dose (mg + natural), Units (or reconstitute fallback), Frequency, and a
  cycle label across active rows; existing Summary tests (`RegimenClient.test.tsx`) updated for the
  new columns; no-vial and continuous-protocol cases covered.
- Full `pnpm check` green.

## Resolved
- **Cycle accuracy:** heavier, cycle-DB-accurate path chosen — extract & reuse `getWeekInfo` and
  fetch cycle records for exact week/rest dates.
- **Column density:** tune during build (merge Frequency into Dose or fold "Started" into Compound
  if 6 columns read too dense on desktop).

## Note for the plan
- mg-normalization stays in the **domain** with no application-layer import: derive mg from
  `doseToSyringeUnits(...).injectionVolMl × (totalMg/bacWaterMl)` for IU/mL (and `amount/1000`
  for mcg, identity for mg) — no need for `convertDoseToMg`, keeping the new `buildRegimenDoseDisplay`
  in `lib/reconstitution/domain/doseUnits.ts` beside the other display builders.
