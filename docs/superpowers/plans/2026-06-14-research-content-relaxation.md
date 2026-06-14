# Research Content Relaxation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the compound research answer state regulatory status ("not FDA-approved") and descriptive dose figures in its free-text lead, surfaced with a "research purposes only" warning, while still blocking affirmative approval claims and prescriptive/personalized dosing.

**Architecture:** Make the global `containsDisallowedPhrase` negation-aware (block affirmative approval/clearance *claims*, allow their negated/absent forms). Remove the dose-figure stripping from the research answer's `directAnswer` (the `containsPrescriptivePhrase` guard already blocks the unsafe forms). Add a conditional dose-figures warning banner in the research panel. Amend ADR-010 + ADR-017.

**Tech Stack:** TypeScript (strict), Vitest, React 19 / Next.js client component, Zod.

**Source of truth:** `docs/superpowers/specs/2026-06-14-research-content-relaxation-design.md`.

---

## Ground rules
- Branch: `feature/research-content-relaxation` (already checked out; spec committed there).
- TDD: failing test → watch fail → implement → watch pass → commit. Vitest globals OFF — always `import { describe, it, expect } from 'vitest'`.
- Single test file: `pnpm test tests/acceptance/<file>`. Full gate: `pnpm check`.
- This change is deterministic guard/UI logic — no DB, no migration, no live-model run required.

## File structure
| File | Responsibility | Task |
|------|----------------|------|
| `lib/ai/domain/schemas.ts` | Negation-aware `containsDisallowedPhrase` + `isAffirmativeApprovalClaim` | 1 |
| `tests/acceptance/AI-disallowed-phrase.test.ts` *(new)* | Guard unit fixtures | 1 |
| `lib/research/application/compoundResearch.ts` | Drop dose-figure stripping in `applyGuards`; relax `SYNTH_SYSTEM` | 2 |
| `lib/research/domain/guards.ts` | Remove `stripDoseFigureSentences`; (Task 3) add `shouldShowDoseWarning` | 2, 3 |
| `tests/acceptance/RES-compoundResearch.test.ts` | Rework dose-figure tests | 2 |
| `tests/acceptance/RES-guards.test.ts` | Remove strip block; (Task 3) add warning-helper block | 2, 3 |
| `app/(dashboard)/reference/_components/CompoundResearchPanel.tsx` | Conditional dose-warning banner | 3 |
| `docs/adrs/ADR-010-*.md`, `docs/adrs/ADR-017-*.md` | Revision notes | 4 |

---

### Task 1: Negation-aware disallowed-phrase guard

**Files:**
- Modify: `lib/ai/domain/schemas.ts`
- Test: `tests/acceptance/AI-disallowed-phrase.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/acceptance/AI-disallowed-phrase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { containsDisallowedPhrase } from '@/lib/ai/domain/schemas';

describe('containsDisallowedPhrase (negation-aware)', () => {
  it('allows descriptive absence-of-approval statements', () => {
    expect(containsDisallowedPhrase('GHK-Cu is not FDA-approved')).toBe(false);
    expect(containsDisallowedPhrase('It lacks FDA approval')).toBe(false);
    expect(containsDisallowedPhrase('is not yet FDA-approved')).toBe(false);
    expect(containsDisallowedPhrase('not clinically approved')).toBe(false);
    expect(containsDisallowedPhrase('there is no safety clearance')).toBe(false);
    expect(containsDisallowedPhrase('GHK-Cu remains investigational')).toBe(false);
  });
  it('blocks affirmative approval/clearance claims', () => {
    expect(containsDisallowedPhrase('GHK-Cu is FDA-approved')).toBe(true);
    expect(containsDisallowedPhrase('FDA-approved for wound healing')).toBe(true);
    expect(containsDisallowedPhrase('It is clinically approved')).toBe(true);
    expect(containsDisallowedPhrase('approved by the FDA for therapeutic use')).toBe(true);
    expect(containsDisallowedPhrase('This compound has safety clearance')).toBe(true);
    expect(containsDisallowedPhrase('It is EMA approved in Europe')).toBe(true);
  });
  it('blocks despite a distant unrelated negation (proximity guard)', () => {
    expect(containsDisallowedPhrase('This non-peptide compound is FDA-approved')).toBe(true);
    expect(containsDisallowedPhrase('It is not a steroid and is FDA-approved')).toBe(true);
  });
  it('a trailing negation does not rescue an affirmative claim', () => {
    expect(containsDisallowedPhrase('FDA-approved, though not for this use')).toBe(true);
  });
  it('always blocks personalized dose-recommendation phrasing', () => {
    expect(containsDisallowedPhrase('the recommended dose for you is 2 mg')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/acceptance/AI-disallowed-phrase.test.ts`
Expected: FAIL — the negated cases currently return `true` (old guard matches "FDA-approved" regardless of negation).

- [ ] **Step 3: Implement the negation-aware guard**

Replace lines 21–31 of `lib/ai/domain/schemas.ts` (the `DISALLOWED_PHRASES` const + `containsDisallowedPhrase`) with:

```ts
/** Always disallowed regardless of context — a personalized recommendation, never permitted. */
const ALWAYS_DISALLOWED = [
  /\brecommended\s+dose\s+for\s+you\b/i,
] as const;

/**
 * Approval/clearance phrases. Disallowed ONLY as an AFFIRMATIVE claim — the AI may state the
 * ABSENCE of approval ("not FDA-approved", "no safety clearance") as a cautionary fact (ADR-010
 * Revision 2026-06-14). Note `(fda|ema)[\s-]*approved` matches "approved", not "approval", so
 * "lacks FDA approval" is permitted by virtue of not matching at all.
 */
const APPROVAL_CLAIM_PATTERNS = [
  /safety[\s-]*clearance/i,
  /clinically\s+approved/i,
  /\bapproved\s+by\s+the\s+(fda|ema)\b/i,
  /\b(fda|ema)[\s-]*approved\b/i,
] as const;

/**
 * Negation tokens that flip an approval phrase from a CLAIM to a descriptive ABSENCE.
 * Deliberately excludes "non"/"un" prefixes (they cause distant false-negatives like
 * "this NON-peptide is FDA-approved"; "unapproved"/"non-approved" lack a \bapproved\b
 * boundary anyway, so they never match the approval patterns).
 */
const NEGATION = /\b(not|no|never|cannot|can'?t|isn'?t|aren'?t|wasn'?t|lacks?|lacking|without|absence of|yet to be|fails? to)\b/i;

/** Words of context immediately before an approval phrase searched for a governing negation. */
const NEG_WINDOW_WORDS = 4;

/** Back-compat export: the full set of phrases the guard is concerned with. */
export const DISALLOWED_PHRASES = [...ALWAYS_DISALLOWED, ...APPROVAL_CLAIM_PATTERNS] as const;

/**
 * True when an approval/clearance phrase appears as an AFFIRMATIVE claim — i.e. there is no
 * negation token in the bounded window immediately preceding it (within its clause). The bounded
 * window prevents a distant unrelated negation from wrongly rescuing an affirmative claim.
 */
export function isAffirmativeApprovalClaim(text: string): boolean {
  for (const pattern of APPROVAL_CLAIM_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(0, m.index);
      const clauseStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf('\n')) + 1;
      const window = before.slice(clauseStart).trim().split(/\s+/).slice(-NEG_WINDOW_WORDS).join(' ');
      if (!NEGATION.test(window)) return true; // affirmative — no governing negation nearby
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width loop
    }
  }
  return false;
}

export function containsDisallowedPhrase(text: string): boolean {
  if (ALWAYS_DISALLOWED.some((re) => re.test(text))) return true;
  return isAffirmativeApprovalClaim(text);
}
```

(Leave the `citationSchema` and the doc comment above `DISALLOWED_PHRASES` intact; only the const + function are replaced.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/acceptance/AI-disallowed-phrase.test.ts`
Expected: PASS (all 5 blocks).

- [ ] **Step 5: Verify the existing draft-profile guard tests still pass (affirmative claims still blocked)**

Run: `pnpm test tests/acceptance/AI-draft-profile.test.ts`
Expected: PASS — its cases ("is approved by the FDA", "is an FDA-approved drug", "EMA approved", "has safety clearance for use") are all affirmative, so they remain blocked.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.
```bash
git add lib/ai/domain/schemas.ts tests/acceptance/AI-disallowed-phrase.test.ts
git commit -m "feat(ai): make disallowed-phrase guard negation-aware (allow 'not FDA-approved')"
```

---

### Task 2: Stop stripping dose figures from the research answer

**Files:**
- Modify: `lib/research/application/compoundResearch.ts`
- Modify: `lib/research/domain/guards.ts`
- Modify: `tests/acceptance/RES-compoundResearch.test.ts`
- Modify: `tests/acceptance/RES-guards.test.ts`

- [ ] **Step 1: Rework the orchestration tests (write the new expectations first)**

In `tests/acceptance/RES-compoundResearch.test.ts`:

(a) Replace the test currently titled `'strips dose figures from directAnswer and drops prescriptive/disallowed items'` (the whole `it(...)` block) with:

```ts
  it('keeps descriptive dose figures in directAnswer; still drops prescriptive/disallowed items', async () => {
    // evidence becomes [] after the prescriptive drop → gap-fill triggers, but all gap searches return
    // the already-seen https://a.com, so gapSources is empty → no 2nd synthesis (2 mockTry calls).
    const synthResult = {
      directAnswer: 'GHK-Cu is studied for skin. Some report 1-2 mg per day. It is not FDA-approved.',
      evidence: [{ point: 'You should take 2 mg daily.', sourceUrls: ['https://a.com'] }], // prescriptive -> dropped
      dosing: [
        { text: 'Topical 1-2% daily in cosmetic studies.', tier: 'clinical', sourceUrls: ['https://a.com'] },
        { text: 'FDA-approved for healing.', tier: 'clinical', sourceUrls: ['https://a.com'] }, // affirmative claim -> dropped
      ],
      caveatsGaps: ['No age-specific data.'],
      sourcesUsed: [{ title: 'S', url: 'https://a.com' }],
      needsMoreEvidence: false,
    };
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['dose?'], queries: ['GHK-Cu dose'] })
      .mockResolvedValueOnce(synthResult);
    mockWebSearch.mockResolvedValue([{ title: 'S', url: 'https://a.com', snippet: 's', content: 'c' }]);

    const res = await runCompoundResearch({ ...baseInput, question: 'what dose and how often?' }, () => {});

    expect(res.directAnswer).toContain('studied for skin');
    expect(res.directAnswer).toContain('1-2 mg');        // dose figure KEPT (no longer stripped)
    expect(res.directAnswer).toContain('not FDA-approved'); // negated regulatory status KEPT
    expect(res.evidence).toHaveLength(0);                 // prescriptive dropped
    expect(res.dosing).toHaveLength(1);                   // affirmative-claim dosing dropped, descriptive kept
    expect(res.dosing[0].tier).toBe('clinical');
  });

  it('withholds a prescriptive directAnswer with the NO_PROSE_SUMMARY placeholder', async () => {
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['q'], queries: ['q'] })
      .mockResolvedValueOnce({
        directAnswer: 'You should take 2 mg subcutaneously every day.', // prescriptive -> withheld
        evidence: [{ point: 'Studied for skin repair.', sourceUrls: ['https://a.com'] }],
        dosing: [], caveatsGaps: [], sourcesUsed: [{ title: 'A', url: 'https://a.com' }], needsMoreEvidence: false,
      });
    mockWebSearch.mockResolvedValue([{ title: 'A', url: 'https://a.com', snippet: 's', content: 'c' }]);
    const res = await runCompoundResearch({ ...baseInput, question: 'what is known about it?' }, () => {});
    expect(res.directAnswer).not.toMatch(/take 2 mg/i);
    expect(res.directAnswer).toMatch(/not shown here/i);  // NO_PROSE_SUMMARY
  });
```

(b) DELETE the test titled `'redirects (not policy-withholds) a directAnswer that is entirely dose figures'` (now obsolete — we no longer strip or redirect). Remove the whole `it(...)` block.

- [ ] **Step 2: Update the guards unit tests**

In `tests/acceptance/RES-guards.test.ts`: remove the `stripDoseFigureSentences` import from the top `import { ... }` line, and DELETE the entire `describe('stripDoseFigureSentences', () => { ... })` block. Leave the `containsDoseFigure`, `containsPrescriptivePhrase`, `isDoseIntentQuestion` blocks intact.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test tests/acceptance/RES-compoundResearch.test.ts tests/acceptance/RES-guards.test.ts`
Expected: FAIL — orchestration still strips (`1-2 mg` assertion fails); RES-guards fails to import the still-present-but-soon-removed symbol only after Step 4 (it will currently still pass since the function exists — that's fine; the orchestration test is the red one driving this).

- [ ] **Step 4: Remove dose-figure stripping in `applyGuards`**

In `lib/research/application/compoundResearch.ts`, replace the `directAnswer` block (currently lines ~151–156):

```ts
  let directAnswer = ans.directAnswer;
  if (!clean(directAnswer)) directAnswer = NO_PROSE_SUMMARY;
  else if (containsDoseFigure(directAnswer)) {
    const stripped = stripDoseFigureSentences(directAnswer);
    directAnswer = stripped.length > 0 ? stripped : NO_PROSE_SUMMARY;
  }
```

with:

```ts
  // Descriptive dose figures are allowed in the lead (ADR-017 Revision 2026-06-14); the
  // prescriptive guard inside clean() still blocks "you should take 2 mg" / personalization.
  const directAnswer = clean(ans.directAnswer) ? ans.directAnswer : NO_PROSE_SUMMARY;
```

Then update the import block (lines 7–12) to drop the two now-unused guards:

```ts
import { containsPrescriptivePhrase, isDoseIntentQuestion } from '../domain/guards';
```

(`containsDoseFigure` and `stripDoseFigureSentences` are no longer used in this file.)

- [ ] **Step 5: Relax `SYNTH_SYSTEM`**

In `lib/research/application/compoundResearch.ts`, in the `SYNTH_SYSTEM` string, change the two sentences that forbid doses/regulatory wording in `directAnswer`. Replace this fragment:

```
  'and dosing item MUST cite >=1 sourceUrl copied verbatim from the sources. caveatsGaps lists what the ' +
  'sources do not cover. directAnswer must be plain-language conclusions ONLY: do NOT put dose numbers or ' +
  'units in it, and do NOT use regulatory/approval wording (e.g. "FDA-approved", "clinically approved") — ' +
  'state any regulatory or approval status in caveatsGaps instead. Set needsMoreEvidence true if the ' +
```

with:

```
  'and dosing item MUST cite >=1 sourceUrl copied verbatim from the sources. caveatsGaps lists what the ' +
  'sources do not cover. directAnswer may summarize key reported dose ranges and regulatory status ' +
  'descriptively (e.g. "studies report 1-2 mg/day"; "not FDA-approved"); put the full per-protocol ' +
  'breakdown in dosing[]. Never phrase anything as advice, a recommendation, personalized, or 2nd-person. ' +
  'Set needsMoreEvidence true if the ' +
```

- [ ] **Step 6: Remove `stripDoseFigureSentences` from `guards.ts`**

In `lib/research/domain/guards.ts`: delete the `stripDoseFigureSentences` function (lines ~46–53). Update the file's top doc comment — change the last sentence from "and numeric dose figures must not appear in the free-text directAnswer (they live in dosing[])." to "Descriptive dose figures are permitted in research output; only prescriptive/personalized phrasing is blocked (ADR-017 Revision 2026-06-14)." Keep `containsDoseFigure` (used by the panel in Task 3).

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test tests/acceptance/RES-compoundResearch.test.ts tests/acceptance/RES-guards.test.ts`
Expected: PASS.
Run: `pnpm typecheck && pnpm lint`
Expected: PASS (no unused-import warnings from the dropped guards).

- [ ] **Step 8: Commit**

```bash
git add lib/research/application/compoundResearch.ts lib/research/domain/guards.ts \
  tests/acceptance/RES-compoundResearch.test.ts tests/acceptance/RES-guards.test.ts
git commit -m "feat(research): keep descriptive dose figures in the answer (drop stripping; prescriptive guard remains)"
```

---

### Task 3: Conditional dose-figures warning banner

**Files:**
- Modify: `lib/research/domain/guards.ts`
- Modify: `tests/acceptance/RES-guards.test.ts`
- Modify: `app/(dashboard)/reference/_components/CompoundResearchPanel.tsx`

- [ ] **Step 1: Write the failing helper test**

In `tests/acceptance/RES-guards.test.ts`, add the helper to the top import and add a new describe block at the end of the file:

```ts
// add to the existing import from '@/lib/research/domain/guards':
//   shouldShowDoseWarning

describe('shouldShowDoseWarning', () => {
  it('is true when the dosing section is non-empty', () => {
    expect(shouldShowDoseWarning('Studied for skin.', 2)).toBe(true);
  });
  it('is true when the lead contains a dose figure', () => {
    expect(shouldShowDoseWarning('Studies report 1-2 mg/day.', 0)).toBe(true);
  });
  it('is false when there are no figures and no dosing items', () => {
    expect(shouldShowDoseWarning('GHK-Cu is studied for skin repair and wound healing.', 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/acceptance/RES-guards.test.ts`
Expected: FAIL — `shouldShowDoseWarning` is not exported.

- [ ] **Step 3: Add the helper to `guards.ts`**

Append to `lib/research/domain/guards.ts`:

```ts
/** Whether to show the "research purposes only" dose warning: any dose figure present. */
export function shouldShowDoseWarning(directAnswer: string, dosingCount: number): boolean {
  return dosingCount > 0 || containsDoseFigure(directAnswer);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/acceptance/RES-guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the warning in the panel**

In `app/(dashboard)/reference/_components/CompoundResearchPanel.tsx`:

(a) Add the import + constant near the top (after the existing imports / `DISCLAIMER`):

```tsx
import { shouldShowDoseWarning } from '@/lib/research/domain/guards';
const DOSE_WARNING = 'Dose figures are reported from studies and protocols for informational purposes only — not dosing advice.';
```

(b) In the render, between the `directAnswer` `AnswerSection` and the `{DISCLAIMER}` paragraph (currently lines ~150–151), insert the conditional banner:

```tsx
              </AnswerSection>
              {result && shouldShowDoseWarning(result.directAnswer, result.dosing.length) && (
                <p className="text-xs rounded px-2 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  ⚠ {DOSE_WARNING}
                </p>
              )}
              <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">{DISCLAIMER}</p>
```

(The block is already guarded by `{result && state.phase === 'done' && (`, so `result` is non-null here; the explicit `result &&` keeps the helper call type-safe.)

- [ ] **Step 6: Verify build**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.
Run: `pnpm test tests/acceptance/RES-guards.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/research/domain/guards.ts tests/acceptance/RES-guards.test.ts \
  "app/(dashboard)/reference/_components/CompoundResearchPanel.tsx"
git commit -m "feat(research): show 'research purposes only' warning when dose figures are present"
```

---

### Task 4: ADR revisions + full gate

**Files:**
- Modify: `docs/adrs/ADR-010-*.md`
- Modify: `docs/adrs/ADR-017-compound-research.md`

- [ ] **Step 1: Amend ADR-010**

Add a `## Revision (2026-06-14)` section to the ADR-010 file documenting: the disallowed "approval/safety-clearance language" rule targets **affirmative claims**; the AI **may** state the **absence** of approval ("not FDA-approved", "no safety clearance") as a cautionary fact, enforced by a negation-aware `containsDisallowedPhrase`. "Recommended dose for you" / personalized recommendations remain disallowed.

- [ ] **Step 2: Amend ADR-017**

Add a `## Revision (2026-06-14)` note to `docs/adrs/ADR-017-compound-research.md`: descriptive dose figures are now permitted in the research answer (including the free-text `directAnswer`), surfaced with a "research purposes only" warning when present; the earlier "no dose numbers in directAnswer" rule (2026-06-13 revision) is superseded. Prescriptive/personalized dosing remains blocked by `containsPrescriptivePhrase`; the structured tiered `dosing[]` section is retained.

- [ ] **Step 3: Full gate**

Run: `pnpm check`
Expected: PASS (guard:no-actions + lint + typecheck + full test suite + prisma:validate). If a doc-completeness eval flags anything, fix the doc.

- [ ] **Step 4: Commit**

```bash
git add docs/adrs/ADR-010-*.md docs/adrs/ADR-017-compound-research.md
git commit -m "docs(adr): ADR-010 + ADR-017 revisions for research content relaxation"
```

- [ ] **Step 5: Finish the branch**

Use **superpowers:finishing-a-development-branch**.

---

## Self-review

**Spec coverage:**
- §1 negation-aware guard → Task 1 (incl. proximity + trailing-negation fixtures). ✓
- §2 stop stripping dose figures + safety via prescriptive guard → Task 2 (Steps 4–5). ✓
- §3 synth prompt relaxation → Task 2 Step 5. ✓
- §4 conditional warning banner → Task 3. ✓
- §5 guards.ts cleanup (`stripDoseFigureSentences` removed, `containsDoseFigure` kept) → Task 2 Step 6. ✓
- §6 ADR-010 + ADR-017 revisions → Task 4. ✓
- Testing (negation fixtures; reworked orchestration tests keep figures; prescriptive→NO_PROSE_SUMMARY; warning-trigger; strip tests removed) → Tasks 1–3. ✓

**Placeholder scan:** none — every code step has complete code.

**Type consistency:** `containsDisallowedPhrase`/`isAffirmativeApprovalClaim` signatures match across schemas.ts + tests; `shouldShowDoseWarning(directAnswer, dosingCount)` matches guards.ts definition + panel call + test; `NO_PROSE_SUMMARY` placeholder text ("...not shown here...") matches the existing constant asserted via `/not shown here/i`. The removed `containsDoseFigure`/`stripDoseFigureSentences` imports in compoundResearch.ts are fully dropped (no dangling refs); `containsDoseFigure` remains exported for the panel.
