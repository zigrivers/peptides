# Reconstitution Syringe-Units Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Show, live, the syringe units to draw for each dosing range (Conservative/Typical/Aggressive) in the Add Reconstituted Vial modal, with a suggested-volume hint + syringe-capacity warning.

**Architecture:** A pure, 100%-covered domain helper `buildReconstitutionPreview` (wraps the existing `buildDoseUnitsDisplay`) returns rows + hint + warning as strings; the modal renders it reactively. Spec: `docs/superpowers/specs/2026-06-15-reconstitution-units-preview-design.md`.

**Tech:** Decimal-only (safety domain), Vitest (globals OFF), React 19 client island. Conventions: TDD; reconstitution domain stays 100% branch coverage; `pnpm typecheck` + touched tests per task; full `pnpm check` before finishing.

**Key facts (verified):**
- `buildDoseUnitsDisplay(dose, { totalMg, bacWaterMl } | null, syringeStandard, syringeSize?)` → `{ computable, unitsText, warning? }` (strings; Decimal internal). In `lib/reconstitution/domain/doseUnits.ts`.
- `DoseAmount = { amount: string; unit: 'mcg'|'mg'|'IU'|'mL'; ... }` in `lib/reference/domain/types.ts`.
- `SyringeStandard = 'U100'|'U40'`, `SyringeSize = '0.3'|'0.5'|'1.0'`, `syringeMaxUnits(std, size)` in doseUnits/syringe.
- Modal `AddActiveVialModal.tsx`: has `selectedCompound.profile` (with `dosingLow/dosingTypical/dosingHigh`), `totalMg`, `bacWaterMl` state. Does NOT yet take syringe props.
- `ReconstitutionClient.tsx` already receives `syringeStandard` + `syringeSize`; just doesn't pass them to the modal (render ~line 340).

---

## Task 1: `buildReconstitutionPreview` domain helper (pure, TDD 100%)

**Files:** Create `lib/reconstitution/domain/reconstitutionPreview.ts`; Test `lib/reconstitution/domain/reconstitutionPreview.test.ts`.

- [ ] **Step 1 — failing tests.** Cover: (a) mg ranges at 1/2/3 mL → expected units via buildDoseUnitsDisplay; (b) `concentrationText` like `"10 mg in 2 mL (5 mg/mL)"`; (c) hint fires when typical units < 5 and suggests a volume landing ~20u (e.g. 10mg vial, typical 250mcg, 1 mL → 2.5u → hint suggests ~2 mL... compute exact: 2.5u→ target 20u → suggested 8 mL clamped to ≤10 → assert hint mentions a larger volume); (d) NO hint when typical already ≥5u; (e) capacity `warning` when a range exceeds `syringeSize` max and none when within; (f) `computable:false` (empty rows, null hint/warning) for `ranges:null`, zero/non-numeric totalMg or bacWaterMl; (g) IU/mL ranges pass through without throwing.

```ts
import { describe, it, expect } from 'vitest';
import { buildReconstitutionPreview } from './reconstitutionPreview';

const ranges = {
  low: { amount: '250', unit: 'mcg' as const },
  typical: { amount: '500', unit: 'mcg' as const },
  high: { amount: '1000', unit: 'mcg' as const },
};

describe('buildReconstitutionPreview', () => {
  it('computes units per range at the entered concentration', () => {
    const p = buildReconstitutionPreview({ ranges, totalMg: '10', bacWaterMl: '2', syringeStandard: 'U100' });
    expect(p.computable).toBe(true);
    expect(p.concentrationText).toBe('10 mg in 2 mL (5 mg/mL)');
    expect(p.rows.map((r) => r.label)).toEqual(['Conservative', 'Typical', 'Aggressive']);
    expect(p.rows[1].doseText).toBe('500 mcg');
    expect(p.rows[1].unitsText).toContain('10.0 units');
  });

  it('hints toward a larger volume when the typical dose draws < 5 units', () => {
    const p = buildReconstitutionPreview({ ranges, totalMg: '10', bacWaterMl: '1', syringeStandard: 'U100' });
    // typical 500mcg @ 10mg/1mL = 5.0u — boundary; use a smaller dose to force <5u:
    expect(p.hint === null || typeof p.hint === 'string').toBe(true);
  });

  it('warns when a range exceeds the syringe capacity', () => {
    // 10mg in 5mL → 2mg/mL; high 1000mcg = 0.5mL = 50u > 30u (0.3mL U-100 syringe max)
    const p = buildReconstitutionPreview({ ranges, totalMg: '10', bacWaterMl: '5', syringeStandard: 'U100', syringeSize: '0.3' });
    expect(p.warning).toMatch(/exceeds/i);
    expect(p.rows.some((r) => r.exceedsSyringe)).toBe(true);
  });

  it('is not computable without ranges or with bad inputs', () => {
    expect(buildReconstitutionPreview({ ranges: null, totalMg: '10', bacWaterMl: '2', syringeStandard: 'U100' }).computable).toBe(false);
    expect(buildReconstitutionPreview({ ranges, totalMg: '0', bacWaterMl: '2', syringeStandard: 'U100' }).computable).toBe(false);
    expect(buildReconstitutionPreview({ ranges, totalMg: 'abc', bacWaterMl: '2', syringeStandard: 'U100' }).computable).toBe(false);
  });
});
```
(Implementer: refine the threshold tests to exact expected numbers; pick a typical dose that yields <5u to assert the hint string concretely.)

- [ ] **Step 2 — run, confirm fail.** `pnpm vitest run lib/reconstitution/domain/reconstitutionPreview.test.ts`.

- [ ] **Step 3 — implement** `reconstitutionPreview.ts`:
  - Parse `totalMg`/`bacWaterMl` with the domain's positive-Decimal parser (reuse the same approach as doseUnits — import a shared `parsePositive` or `new Decimal` guarded). If either non-positive/NaN, or `ranges` is null → return `{ computable:false, concentrationText:null, rows:[], hint:null, warning:null }`.
  - `concentrationText = "{totalMg} mg in {bacWaterMl} mL ({mgPerMl} mg/mL)"`, `mgPerMl = totalMg/bacWaterMl` via Decimal, formatted (drop trailing zeros / ≤2 dp).
  - Rows: for `['Conservative'→low, 'Typical'→typical, 'Aggressive'→high]`, call `buildDoseUnitsDisplay(dose, { totalMg, bacWaterMl }, syringeStandard, syringeSize)`. `doseText = "{amount} {unit}"`. `unitsText = display.unitsText`. `exceedsSyringe = !!display.warning`.
  - Hint: constants `MIN_PULLABLE_UNITS = 5`, `TARGET_TYPICAL_UNITS = 20`. Compute typical units via `doseToSyringeUnits(typical, {totalMg,bacWaterMl}, syringeStandard)`; if computable and `units < MIN_PULLABLE_UNITS`: `suggestedMl = round(bacWaterMl * (TARGET_TYPICAL_UNITS / units) * 2)/2` (nearest 0.5), clamp [0.5,10]; only set hint if `suggestedMl !== bacWaterMl`. Format: `"💡 At {bac} mL the typical dose is only {units}u — hard to measure precisely. Try ~{suggestedMl} mL → ~{unitsAtSuggested}u."` (compute unitsAtSuggested = units * suggestedMl / bac).
  - Warning: if `syringeSize` given and any row `exceedsSyringe`, pick the highest offending range: `"⚠ At {bac} mL the {label} dose ({units}u) exceeds your {max}-unit syringe — consider less BAC water."` (`max = syringeMaxUnits(std,size)`).
  - All numeric formatting via Decimal `toFixed(1)` for units; never float.

- [ ] **Step 4 — run, confirm pass; check coverage 100%** for the new file: `pnpm vitest run lib/reconstitution/domain/reconstitutionPreview.test.ts` then `pnpm check:coverage` (or confirm via the gate later). `pnpm typecheck`.

- [ ] **Step 5 — commit.** `git add lib/reconstitution/domain/reconstitutionPreview.ts lib/reconstitution/domain/reconstitutionPreview.test.ts && git commit -m "feat(reconstitution): pure syringe-units preview builder (3 ranges + hint + capacity warning)"`

---

## Task 2: Render the preview in the modal + wire syringe props

**Files:** Modify `app/(dashboard)/reconstitution/_components/AddActiveVialModal.tsx` and `app/(dashboard)/reconstitution/_components/ReconstitutionClient.tsx`; Test `app/(dashboard)/reconstitution/_components/AddActiveVialModal.test.tsx`.

- [ ] **Step 1 — failing component test.** In the existing modal test file, add: rendering with a compound whose `profile` has dosing ranges + valid totalMg + bacWaterMl shows a "Syringe preview" with three labels (Conservative/Typical/Aggressive) and a units string; changing bacWaterMl changes the units; the card is absent before totalMg/bacWaterMl are set and when the compound has no profile. (Mirror the existing modal test's render/setup; the modal already mocks `@/app/actions/reconstitution/inventory-actions`.)

- [ ] **Step 2 — run, confirm fail.**

- [ ] **Step 3 — implement modal:**
  - Add to `Props`: `syringeStandard?: SyringeStandard` (default `'U100'`), `syringeSize?: SyringeSize`. Import the types from `@/lib/reconstitution/domain/doseUnits`.
  - Destructure with default `syringeStandard = 'U100'`.
  - `const preview = useMemo(() => buildReconstitutionPreview({ ranges: profile ? { low: profile.dosingLow, typical: profile.dosingTypical, high: profile.dosingHigh } : null, totalMg, bacWaterMl, syringeStandard, syringeSize }), [profile, totalMg, bacWaterMl, syringeStandard, syringeSize]);` — guard that `profile.dosingLow` etc. exist (the profile type may have them optional; coerce/skip if missing).
  - Render directly below the BAC Water Volume field, only when `preview.computable`:
    ```tsx
    <div aria-live="polite" className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
      <p className="font-semibold text-foreground/80">Syringe preview — {preview.concentrationText} · {syringeStandard === 'U100' ? 'U-100' : 'U-40'}</p>
      <dl className="mt-1.5 space-y-0.5">
        {preview.rows.map((r) => (
          <div key={r.label} className={`flex items-baseline justify-between ${r.exceedsSyringe ? 'text-amber-600 dark:text-amber-400' : ''}`}>
            <dt className="text-foreground/70">{r.label} <span className="text-foreground/50">· {r.doseText}</span></dt>
            <dd className="font-mono tabular-nums">{r.unitsText ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {preview.hint && <p className="mt-1.5 text-foreground/70">{preview.hint}</p>}
      {preview.warning && <p className="mt-1 text-amber-600 dark:text-amber-400">{preview.warning}</p>}
    </div>
    ```
    (Match the modal's existing class vocabulary; adjust tokens to neighbors.)
  - Import `buildReconstitutionPreview` from `@/lib/reconstitution/domain/reconstitutionPreview`.
- [ ] **Step 4 — wire ReconstitutionClient.** In the `<AddActiveVialModal ... />` render (~line 340), add `syringeStandard={syringeStandard}` and `syringeSize={syringeSize}` (both already in scope). Leave the tracker's `<AddActiveVialModal>` call site untouched (defaults apply there).
- [ ] **Step 5 — run modal tests + full file + `pnpm typecheck`.** All green.
- [ ] **Step 6 — commit.** `git add` the modal, client, and test → `git commit -m "feat(reconstitution): live syringe-units preview in the add-vial modal"`

---

## Final verification
- [ ] `pnpm check` green (incl. reconstitution-domain 100% coverage via `pnpm check:coverage`).
- [ ] Dispatch a final holistic review of the branch diff.
- [ ] Manual smoke (optional): open Add Reconstituted Vial, pick a compound with ranges, set 10mg + try 1 vs 2 mL → units update; small-volume hint + capacity warning appear appropriately.

## Self-review notes
- Spec coverage: 3-range live preview (T1+T2), suggested-volume hint + capacity warning (T1), client compute via pure helper (T1), prop threading (T2), tracker default (T2). Covered.
- Type consistency: `buildReconstitutionPreview` signature + `ReconstitutionPreview`/`ReconPreviewRow` shapes identical across T1/T2; `syringeStandard`/`syringeSize` types from doseUnits used in both modal and helper.
