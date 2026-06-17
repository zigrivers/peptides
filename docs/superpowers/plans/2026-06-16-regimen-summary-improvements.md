# Regimen Summary Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make the Regimen → Summary table inform users uniformly: dose as **mg (natural unit) + syringe units + frequency**, plus **cycle progress** (week X of Y / rest, cycle-DB-accurate) and a plain-language **"why"** one-liner.

**Architecture:** (1) extract the tracker's `getWeekInfo` into a shared pure module; (2) add a pure `buildRegimenDoseDisplay` (mg-normalized + units) to the reconstitution domain; (3) plumb cycle records + profile cycle fields + server-built dose displays from the regimen page into a reworked `RegimenSummaryView`. Spec: `docs/superpowers/specs/2026-06-16-regimen-summary-improvements-design.md`.

**Tech:** Decimal-only safety domain (100% on new helpers), Vitest globals OFF, React 19. TDD; `pnpm typecheck` + touched tests per task; full `pnpm check` before finishing.

**Verified facts:**
- `getWeekInfo(proto, profile, eventDateStr, cycles)` + `interface WeekInfo` (line ~182) + `parseAsUTCDay` (line ~198) are in `app/(dashboard)/tracker/_components/TrackerCalendar.tsx`; unit-tested in `TrackerCalendar.test.tsx` (`describe('getWeekInfo Unit Tests'` ~line 1363). `getWeekInfo` is used in TrackerCalendar at ~line 1174.
- `cycles` shape: `Record<cycleId, { startDate: string; endDate: string | null }>`. `Cycle` model: `{ id, userId, name, startDate, endDate?, status }`.
- `doseToSyringeUnits(dose, vialConcentration, syringeStandard) => { computable:true; units:Decimal; injectionVolMl:Decimal } | {computable:false}` and `buildDoseUnitsDisplay(...)` in `lib/reconstitution/domain/doseUnits.ts`; private `parsePositive`, `formatDecimalForDoseDisplay` there.
- Regimen page (`app/(dashboard)/regimen/page.tsx`) already loads protocols (with `compound.profile`), vials (`RECONSTITUTED`/`DRY`, `totalMg`/`bacWaterMl`/`remainingMg`), and per-user `syringeStandard`. It does NOT currently map `cycleLengthWeeks`/`restPeriodWeeks` or fetch `Cycle` records.
- Summary table = `RegimenSummaryView` in `RegimenClient.tsx`; current columns Compound | Dose / Frequency | Start | Runout | Categories; dose cell = `{p.dose.amount} {p.dose.unit} · {formatScheduleText(p.schedule)}`. `formatScheduleText` already delegates to `formatScheduleFrequency`. `getCompoundWhyStatement` in `lib/reference/domain/whyStatements.ts`.

---

## Task 1: Extract `getWeekInfo` into a shared pure module

**Files:** Create `lib/tracker/domain/cycleProgress.ts` + `lib/tracker/domain/cycleProgress.test.ts`; modify `app/(dashboard)/tracker/_components/TrackerCalendar.tsx` and `TrackerCalendar.test.tsx`.

- [ ] **Step 1:** Move `interface WeekInfo`, `function parseAsUTCDay`, and `function getWeekInfo` verbatim from `TrackerCalendar.tsx` into `lib/tracker/domain/cycleProgress.ts` (export `WeekInfo` and `getWeekInfo`; keep `parseAsUTCDay` module-private unless a test needs it — it doesn't). Preserve logic exactly.
- [ ] **Step 2:** In `TrackerCalendar.tsx`, remove those definitions and `import { getWeekInfo, type WeekInfo } from '@/lib/tracker/domain/cycleProgress';`. Keep all call sites identical.
- [ ] **Step 3:** Move the `describe('getWeekInfo Unit Tests', ...)` block from `TrackerCalendar.test.tsx` into `cycleProgress.test.ts` (import `getWeekInfo` from `./cycleProgress`). Leave the rest of TrackerCalendar.test.tsx intact.
- [ ] **Step 4:** Run `pnpm vitest run lib/tracker/domain/cycleProgress.test.ts "app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx"` + `pnpm typecheck`. All green (pure move — no behavior change).
- [ ] **Step 5:** Commit. `git add lib/tracker/domain/cycleProgress.ts lib/tracker/domain/cycleProgress.test.ts "app/(dashboard)/tracker/_components/TrackerCalendar.tsx" "app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx" && git commit -m "refactor(tracker): extract getWeekInfo into lib/tracker/domain/cycleProgress"`

---

## Task 2: `buildRegimenDoseDisplay` domain helper (pure, TDD 100%)

**Files:** Modify `lib/reconstitution/domain/doseUnits.ts` + `lib/reconstitution/domain/doseUnits.test.ts`.

- [ ] **Step 1 — failing tests** (new describe block). Verify numbers by hand (U-100 volPerUnit=0.01):
```ts
describe('buildRegimenDoseDisplay', () => {
  const conc = { totalMg: '10', bacWaterMl: '2' }; // 5 mg/mL
  it('mcg dose with a vial: mg-normalized + units', () => {
    const d = buildRegimenDoseDisplay({ amount: '450', unit: 'mcg' }, conc, 'U100');
    expect(d.doseText).toBe('0.45 mg (450 mcg)');           // 450 mcg = 0.45 mg
    expect(d.unitsText).toContain('units (U-100)');          // 0.45mg / 5mg/mL = 0.09mL → 9.0u
  });
  it('mg dose stays mg (no parenthetical)', () => {
    expect(buildRegimenDoseDisplay({ amount: '5', unit: 'mg' }, conc, 'U100').doseText).toBe('5 mg');
  });
  it('mcg dose with NO vial: natural unit only, units = reconstitute prompt', () => {
    const d = buildRegimenDoseDisplay({ amount: '450', unit: 'mcg' }, null, 'U100');
    expect(d.doseText).toBe('0.45 mg (450 mcg)');            // mcg→mg needs no vial
    expect(d.unitsText).toBe('· reconstitute to see units');
  });
  it('IU dose with a vial: mg derived from concentration', () => {
    const d = buildRegimenDoseDisplay({ amount: '2', unit: 'IU' }, conc, 'U100');
    // 2 IU → 2 units → 0.02 mL × 5 mg/mL = 0.10 mg
    expect(d.doseText).toBe('0.1 mg (2 IU)');
    expect(d.unitsText).toContain('2.0 units');
  });
  it('IU dose with NO vial: natural unit only (mg not derivable)', () => {
    expect(buildRegimenDoseDisplay({ amount: '2', unit: 'IU' }, null, 'U100').doseText).toBe('2 IU');
  });
  it('mL dose: mg from concentration when present, else natural', () => {
    expect(buildRegimenDoseDisplay({ amount: '0.1', unit: 'mL' }, conc, 'U100').doseText).toBe('0.5 mg (0.1 mL)');
  });
  it('invalid amount → natural unit text, null/► safe units', () => {
    const d = buildRegimenDoseDisplay({ amount: 'abc', unit: 'mcg' }, conc, 'U100');
    expect(typeof d.doseText).toBe('string'); // never throws
  });
});
```
(Implementer: confirm exact mg/units numbers; adjust formatting expectations to the helper's `formatDecimalForDoseDisplay` output — assert numerically where rounding is ambiguous.)

- [ ] **Step 2 — run, confirm fail.**
- [ ] **Step 3 — implement** in `doseUnits.ts`:
```ts
export type RegimenDoseDisplay = { doseText: string; unitsText: string | null };
export function buildRegimenDoseDisplay(
  dose: DoseAmount,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: SyringeStandard,
): RegimenDoseDisplay {
  const unitsDisplay = buildDoseUnitsDisplay(dose, vialConcentration, syringeStandard);
  const unitsText = unitsDisplay.unitsText; // "≈ N units (U-100)" | "· reconstitute to see units" | null
  const amount = parsePositive(dose.amount);
  const natural = `${dose.amount} ${dose.unit}`;
  if (amount === null) return { doseText: natural, unitsText };
  // mg-normalized
  let mg: Decimal | null = null;
  if (dose.unit === 'mg') return { doseText: natural, unitsText };       // already mg
  if (dose.unit === 'mcg') mg = amount.dividedBy(1000);
  else { // IU / mL → derive mg from concentration via injection volume
    const res = doseToSyringeUnits(dose, vialConcentration, syringeStandard);
    const totalMg = vialConcentration ? parsePositive(vialConcentration.totalMg) : null;
    const bac = vialConcentration?.bacWaterMl ? parsePositive(vialConcentration.bacWaterMl) : null;
    if (res.computable && totalMg && bac) mg = res.injectionVolMl.times(totalMg).dividedBy(bac);
  }
  if (mg === null) return { doseText: natural, unitsText };               // can't normalize → natural only
  return { doseText: `${formatDecimalForDoseDisplay(mg, 2)} mg (${natural})`, unitsText };
}
```
(Use the file's existing `DoseAmount`, `SyringeStandard`, `parsePositive`, `formatDecimalForDoseDisplay`, `doseToSyringeUnits`, `buildDoseUnitsDisplay`, `Decimal`. `formatDecimalForDoseDisplay` precision: pick 2 dp for mg, trimming trailing zeros so `0.45`/`0.1`/`0.5` read clean — adjust to match tests.)

- [ ] **Step 4 — run pass; `pnpm typecheck`; confirm new fn branches covered.**
- [ ] **Step 5 — commit.** `git add lib/reconstitution/domain/doseUnits.ts lib/reconstitution/domain/doseUnits.test.ts && git commit -m "feat(reconstitution): buildRegimenDoseDisplay (mg-normalized dose + syringe units)"`

---

## Task 3: Regimen page plumbing + reworked Summary columns

**Files:** Modify `app/(dashboard)/regimen/page.tsx`, `app/(dashboard)/regimen/_components/RegimenClient.tsx`, `app/(dashboard)/regimen/_components/RegimenClient.test.tsx`.

- [ ] **Step 1 — failing component test** (extend the existing `RegimenClient summary view` describe): with a protocol (KPV 450 mcg, daily) + an active reconstituted vial (10 mg / 2 mL) for that compound + `syringeStandard 'U100'`, switching to Summary shows: dose `0.45 mg (450 mcg)`, a units string `units (U-100)`, frequency `Daily` in their own cells; a cycle label (`Continuous` or `Week X of Y` if a cycle is set); and the compound's why one-liner. A second case: no vial → units cell shows `reconstitute to see units` and dose still shows `0.45 mg (450 mcg)`. (Build the display props the way the page will — the test renders `RegimenClient` with the new props; mirror existing summary tests' setup.)

- [ ] **Step 2 — run, confirm fail.**

- [ ] **Step 3 — page.tsx:**
  - Map `cycleLengthWeeks` + `restPeriodWeeks` into `compound.profile` (add to the existing profile map for both the CompoundProfile and SupplementProfile branches — null on supplement).
  - Fetch `Cycle` records for the active protocols' non-null `cycleId`s (`prisma.cycle.findMany({ where: { id: { in: cycleIds }, userId: { in: allUserIds } }, select: { id, startDate, endDate } })`); build `cyclesByUser`-agnostic `cycles: Record<string,{startDate:string;endDate:string|null}>` (ISO strings).
  - Build `doseDisplayByProtocolId: Record<string, { doseText:string; unitsText:string|null; frequencyText:string; perDayNote:string|null }>`: for each protocol, find the compound's active RECONSTITUTED vial (first match by compoundId+userId) → `vialConcentration`; `buildRegimenDoseDisplay(p.dose, vialConcentration, syringeStandard)` for doseText/unitsText; `frequencyText = formatScheduleFrequency(schedule)`; `perDayNote` = `'×2/day'` when the schedule is TwiceDaily/TwiceSpecificDaysOfWeek else null. (syringeStandard is per the protocol's owning user.)
  - Pass `cycles` and `doseDisplayByProtocolId` to `<RegimenClient ... />`.

- [ ] **Step 4 — RegimenClient.tsx / RegimenSummaryView:**
  - Thread new props: `cycles?: Record<string,{startDate:string;endDate:string|null}>` (default `{}`), `doseDisplayByProtocolId?: Record<string, {...}>` (default `{}`). Pass into `RegimenSummaryView`.
  - Import `getWeekInfo` from `@/lib/tracker/domain/cycleProgress` and `getCompoundWhyStatement` from `@/lib/reference/domain/whyStatements`.
  - Rework the table head/body to columns: **Compound** (name+route+timing; sub-line why one-liner truncated w/ `title`; sub-line category chips) | **Dose** (`doseText` + muted `perDayNote`) | **Units** (`unitsText ?? '—'`, amber/muted style for the reconstitute prompt) | **Frequency** (`frequencyText`) | **Cycle** (`getWeekInfo(p, p.compound.profile, todayStr, cycles)` → `Week W of T` + muted `· rest ~<formatUTCDate(restStartDate)>`, or `Continuous`; small `Started <formatUTCDate(startDate)>`) | **Runout** (unchanged). Keep the mobile stacked `md:hidden` labels for every cell, including the new ones. Drop the standalone Start + Categories columns (folded into Cycle/Compound). If desktop reads too dense, fold Frequency into the Dose cell — implementer's judgment.
  - Use `doseDisplayByProtocolId[p.id]`; if missing (shouldn't happen for active rows) fall back to the old `{amount} {unit} · {freq}` string so nothing crashes.

- [ ] **Step 5 — update existing summary tests** in `RegimenClient.test.tsx` for the new columns (they currently assert the combined "Dose / Frequency" text and table structure). Keep their intent; assert the new split cells.

- [ ] **Step 6 — run** `pnpm vitest run "app/(dashboard)/regimen/_components/RegimenClient.test.tsx"` (full) + `pnpm typecheck`. Green.
- [ ] **Step 7 — commit.** `git add` the three files → `git commit -m "feat(regimen): Summary shows mg+units+frequency, cycle progress, and why"`

---

## Final verification
- [ ] `pnpm check` green.
- [ ] Holistic review of the branch diff (dose/units/mg correctness, cycle accuracy via getWeekInfo + cycle records, no-vial fallback, a11y labels on new columns, density).
- [ ] Optional dev smoke: Regimen → Summary shows per row `0.45 mg (450 mcg)` · `≈ N units (U-100)` · `Daily` · cycle label · runout; no-vial compound shows the reconstitute prompt.

## Self-review notes
- Spec coverage: getWeekInfo reuse (T1), mg+units helper (T2), cycle records + profile cycle fields + dose displays + new columns + why (T3). Covered.
- Type consistency: `RegimenDoseDisplay`/`doseDisplayByProtocolId` shapes match across page + client; `cycles` shape identical to getWeekInfo's param; `getWeekInfo` imported from the new module in both TrackerCalendar and RegimenClient.
