# Log Dose by Syringe Units — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Let users log a dose by entering the syringe units they drew (pre-filled to the planned units), showing the resulting actual dose live and logging that dose. Falls back to mcg entry when no reconstituted vial exists.

**Architecture:** New pure inverse helper `syringeUnitsToDose` (units → dose) beside the existing `doseToSyringeUnits`; the tracker page passes each compound's active-vial concentration to the calendar; the log panel renders a units input + dose readout (client-side compute via the pure helpers), logging the computed dose through the existing per-dose override path. Spec: `docs/superpowers/specs/2026-06-16-log-dose-by-units-design.md`.

**Tech:** Decimal-only safety domain (100% branch coverage on the new helper); Vitest globals OFF; React 19 client island. Conventions: TDD; `pnpm typecheck` + touched tests per task; full `pnpm check` before finishing.

**Verified facts:**
- `doseToSyringeUnits(dose, vialConcentration, syringeStandard) => { computable:true; units:Decimal; injectionVolMl:Decimal } | { computable:false; reason }` in `lib/reconstitution/domain/doseUnits.ts`. `getVolumePerUnit(syringeStandard)` from `./syringe`. `vialConcentration = { totalMg:string; bacWaterMl:string|null } | null`.
- `DoseAmount` (as imported by doseUnits.ts) has `unit: 'mcg'|'mg'|'IU'|'mL'`.
- Tracker page (`app/(dashboard)/tracker/page.tsx`) already resolves `resolveActiveVial(userId, compoundId)` per compound (~lines 229-239) to build `doseUnitsByCompoundId`; reuse that vial's concentration.
- `TrackerCalendar.tsx` already has: `editAmount` state + a mcg DOSE field (the prior per-dose override), `syringeStandard` prop, a single `effectiveAmount` computed in the inline log handler (`handleInlineSave`, used by both online + offline paths), and clears edit state on success. The card event `e` has `compoundId`, `doseAmount`, `doseUnit`.

---

## Task 1: `syringeUnitsToDose` inverse helper (pure, TDD 100%)

**Files:** Modify `lib/reconstitution/domain/doseUnits.ts`; modify `lib/reconstitution/domain/doseUnits.test.ts` (add a describe block).

- [ ] **Step 1 — failing tests** (add to doseUnits.test.ts). Compute expected by hand: U-100 `volPerUnit = 0.01 mL/unit`.
```ts
describe('syringeUnitsToDose (inverse of doseToSyringeUnits)', () => {
  // 15 mg/mL concentration: totalMg '15', bacWaterMl '1'.
  const conc = { totalMg: '15', bacWaterMl: '1' };
  it('mcg: 3.0 units @ U-100, 15 mg/mL → 450 mcg', () => {
    const r = syringeUnitsToDose('3.0', conc, 'U100', 'mcg');
    expect(r).not.toBeNull();
    expect(r!.unit).toBe('mcg');
    expect(Number(r!.amount)).toBeCloseTo(450, 6); // 0.03 mL × 15 mg/mL = 0.45 mg = 450 mcg
  });
  it('mcg: 2.5 units → 375 mcg', () => {
    expect(Number(syringeUnitsToDose('2.5', conc, 'U100', 'mcg')!.amount)).toBeCloseTo(375, 6);
  });
  it('mg target returns mg', () => {
    const r = syringeUnitsToDose('3.0', conc, 'U100', 'mg');
    expect(r!.unit).toBe('mg'); expect(Number(r!.amount)).toBeCloseTo(0.45, 6);
  });
  it('IU is 1:1 with units, concentration-independent', () => {
    expect(syringeUnitsToDose('2', null, 'U100', 'IU')).toEqual({ amount: expect.any(String), unit: 'IU' });
    expect(Number(syringeUnitsToDose('2', null, 'U100', 'IU')!.amount)).toBeCloseTo(2, 6);
  });
  it('mL target = injection volume, concentration-independent', () => {
    expect(Number(syringeUnitsToDose('3', null, 'U100', 'mL')!.amount)).toBeCloseTo(0.03, 6);
  });
  it('returns null for mcg/mg target with no concentration', () => {
    expect(syringeUnitsToDose('3', null, 'U100', 'mcg')).toBeNull();
    expect(syringeUnitsToDose('3', { totalMg: '15', bacWaterMl: null }, 'U100', 'mcg')).toBeNull();
  });
  it('returns null for zero / negative / non-numeric units', () => {
    expect(syringeUnitsToDose('0', conc, 'U100', 'mcg')).toBeNull();
    expect(syringeUnitsToDose('-1', conc, 'U100', 'mcg')).toBeNull();
    expect(syringeUnitsToDose('abc', conc, 'U100', 'mcg')).toBeNull();
  });
  it('round-trips with doseToSyringeUnits', () => {
    const back = doseToSyringeUnits({ amount: '450', unit: 'mcg' }, conc, 'U100');
    expect(back.computable && Number(back.units.toFixed(4))).toBe(3);
  });
});
```
(Implementer: import `syringeUnitsToDose` + `doseToSyringeUnits` at the top of the test; verify exact numbers.)

- [ ] **Step 2 — run, confirm fail.** `pnpm vitest run lib/reconstitution/domain/doseUnits.test.ts`.

- [ ] **Step 3 — implement** in `doseUnits.ts` (reuse the file's `Decimal`, `getVolumePerUnit`, and the same `parsePositive` guard used by `doseToSyringeUnits`):
```ts
export function syringeUnitsToDose(
  units: string,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: SyringeStandard,
  targetUnit: DoseAmount['unit'],
): { amount: string; unit: DoseAmount['unit'] } | null {
  const u = parsePositive(units);
  if (u === null) return null;
  const injectionVolMl = u.times(getVolumePerUnit(syringeStandard));
  switch (targetUnit) {
    case 'mL':
      return { amount: formatDecimalForDoseDisplay(injectionVolMl, 3), unit: 'mL' };
    case 'IU':
      return { amount: formatDecimalForDoseDisplay(u, 2), unit: 'IU' };
    case 'mcg':
    case 'mg': {
      if (!vialConcentration || vialConcentration.bacWaterMl === null) return null;
      const totalMg = parsePositive(vialConcentration.totalMg);
      const bacWaterMl = parsePositive(vialConcentration.bacWaterMl);
      if (totalMg === null || bacWaterMl === null) return null;
      const doseMg = injectionVolMl.times(totalMg).dividedBy(bacWaterMl);
      const amountDec = targetUnit === 'mg' ? doseMg : doseMg.times(1000);
      return { amount: formatDecimalForDoseDisplay(amountDec, targetUnit === 'mg' ? 3 : 1), unit: targetUnit };
    }
    default:
      return null;
  }
}
```
(`formatDecimalForDoseDisplay` already exists as a private fn in this file — reuse it; if its precision rounding differs, keep amounts numerically faithful for the tests, adjusting decimals as needed. Ensure `DoseAmount` is the type doseUnits.ts already imports.)

- [ ] **Step 4 — run, confirm pass; `pnpm typecheck`; confirm new lines covered** (`pnpm check:coverage` — the new function must be 100%; the file's pre-existing debt is tracked separately as PR D, don't chase it, but your new branches must all be hit).

- [ ] **Step 5 — commit.** `git add lib/reconstitution/domain/doseUnits.ts lib/reconstitution/domain/doseUnits.test.ts && git commit -m "feat(reconstitution): syringeUnitsToDose — convert drawn units back to a dose"`

---

## Task 2: Units input + dose readout in the log panel (+ concentration plumbing)

**Files:** Modify `app/(dashboard)/tracker/page.tsx`, `app/(dashboard)/tracker/_components/TrackerCalendar.tsx`, `app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx`.

- [ ] **Step 1 — failing component test.** With a compound that has a concentration (pass a new `vialConcentrationByCompoundId={{ 'compound-x': { totalMg: '15', bacWaterMl: '1' } }}` prop) and a planned dose of 450 mcg: expanding the log panel shows a units input pre-filled to the planned units (`3.0`), a readout containing the actual dose (`450 mcg`); changing units to `2.5` updates the readout to `375 mcg`; clicking Log Dose calls `logDoseAction` with `amount` ≈ `{ amount: '375', unit: 'mcg' }`. Second test: with NO concentration for the compound, the mcg dose field is shown (today's behavior) and there is no units input.

- [ ] **Step 2 — run, confirm fail.**

- [ ] **Step 3 — page plumbing** (`page.tsx`): in the existing per-compound `resolveActiveVial` loop (~229-239), also record the concentration into a map; pass it to `<TrackerCalendar vialConcentrationByCompoundId={...} />`. Build:
```ts
const vialConcentrationByCompoundId: Record<string, { totalMg: string; bacWaterMl: string | null }> = {};
// inside the same loop where `vial`/`vialConcentration` are computed:
if (vialConcentration) vialConcentrationByCompoundId[compoundId] = vialConcentration;
```

- [ ] **Step 4 — TrackerCalendar:**
  - Add prop `vialConcentrationByCompoundId?: Record<string, { totalMg: string; bacWaterMl: string | null }>` (default `{}` via a module-const, like the other map props).
  - Import `doseToSyringeUnits`, `syringeUnitsToDose` from `@/lib/reconstitution/domain/doseUnits`.
  - Add `editUnits` state: `const [editUnits, setEditUnits] = useState<Record<string, string>>({});`
  - In the DOSE field block, compute `const conc = vialConcentrationByCompoundId[e.compoundId] ?? null;`
    - If `conc` (units mode): compute `plannedUnits` = `doseToSyringeUnits({ amount: e.doseAmount, unit: e.doseUnit }, conc, syringeStandard)` → `.units.toFixed(1)` (guard non-computable → fall back to dose mode). Render: label `DOSE` with `Planned: {plannedUnits} units · {e.doseAmount} {e.doseUnit}`; number input bound to `editUnits[e.id] ?? plannedUnits` (step `0.5`, min `0`); a readout `→ actual dose: {fmt}` where `fmt` comes from `syringeUnitsToDose(editUnits[e.id] ?? plannedUnits, conc, syringeStandard, e.doseUnit)` → `"{amount} {unit}"` (or nothing if null); a reset control that clears `editUnits[e.id]`. Wrap the readout in `aria-live="polite"`.
    - Else (dose mode): render the existing `editAmount` mcg field unchanged.
  - In `handleInlineSave`, replace the single `effectiveAmount` computation so that, in units mode, it derives from units:
    ```ts
    const conc = vialConcentrationByCompoundId[event.compoundId] ?? null;
    const plannedUnits = conc ? doseToSyringeUnits({ amount: event.doseAmount, unit: event.doseUnit }, conc, syringeStandard) : null;
    let effectiveAmount = { amount: event.doseAmount, unit: event.doseUnit }; // default = planned
    if (conc && plannedUnits?.computable) {
      const unitsStr = (editUnits[event.id] ?? plannedUnits.units.toFixed(1)).trim();
      const dose = unitsStr ? syringeUnitsToDose(unitsStr, conc, syringeStandard, event.doseUnit) : null;
      if (dose) effectiveAmount = dose;
    } else {
      const trimmed = (editAmount[event.id] ?? '').trim();
      effectiveAmount = { amount: trimmed !== '' ? trimmed : event.doseAmount, unit: event.doseUnit };
    }
    ```
    Use `effectiveAmount` for BOTH the online `logDoseAction` call and the offline enqueue (already the case). Clear `editUnits[event.id]` on success alongside `editAmount`.
- [ ] **Step 5 — run** the full `TrackerCalendar.test.tsx` + new tests + `pnpm typecheck`. All green, no regressions (the prior override tests now run in dose-mode paths — they pass compounds without a concentration map, so they stay on the mcg field; confirm).
- [ ] **Step 6 — commit.** `git add` the three files → `git commit -m "feat(tracker): log a dose by syringe units with a live actual-dose readout"`

---

## Final verification
- [ ] `pnpm check` green.
- [ ] Dispatch a holistic review of the branch diff (esp. units↔dose correctness, the units-mode logging amount, and dose-mode fallback unchanged).
- [ ] Optional dev smoke: KPV scheduled dose with an active vial → units field pre-filled to 3.0, readout 450 mcg; change to 2.5 → 375 mcg; log → row shows the drawn dose.

## Self-review notes
- Spec coverage: inverse helper (T1), concentration plumbing (T2 step3), units field + readout + pre-fill + reset (T2 step4), mcg fallback (T2), units-mode logging via effectiveAmount online+offline (T2). Covered.
- Type consistency: `syringeUnitsToDose(units, conc, std, targetUnit)` identical in T1/T2; `vialConcentrationByCompoundId` shape identical in page + calendar; `editUnits` naming consistent.
