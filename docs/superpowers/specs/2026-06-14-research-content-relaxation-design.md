# Research Content Relaxation — Design Spec

**Date:** 2026-06-14
**Status:** Approved (brainstorming) — pending implementation plan
**Touches:** ADR-010 (AI disallowed-language policy) + ADR-017 (compound research). Both get a Revision note; neither is reversed.

## Problem

The compound research feature (ADR-017, enhanced 2026-06-13) over-censors **descriptive**
research content in the free-text `directAnswer`, so users see a neutral fallback
(`NO_PROSE_SUMMARY`) instead of a real lead:

1. **Regulatory status is filtered.** The global `containsDisallowedPhrase`
   (`lib/ai/domain/schemas.ts`) matches `/\b(fda|ema)[\s-]*approved\b/i` regardless of
   negation, so the model's truthful *"GHK-Cu is not FDA-approved"* trips the guard and the
   whole lead is withheld. Observed on every live GHK-Cu run.
2. **Dose figures are stripped.** `applyGuards` runs `stripDoseFigureSentences` over
   `directAnswer`; when the model (asked about dosing) packs figures into the lead, every
   sentence is removed and the lead collapses to the fallback.

Both are over-caution: the dangerous forms (approval *claims*, *prescriptive/personalized*
dosing) are already blocked by other guards. The app's users are informed adults using it
with full knowledge that it is informational, not prescriptive (project context). The fix is
to surface descriptive research content with a clear **research-purposes warning** rather than
censor it.

## Goal

Let the research answer state, descriptively and cited:
- **regulatory status** ("not FDA-approved", "investigational", "lacks FDA approval"), and
- **dose figures** ("studies report 1–2 mg/day subcutaneously"),

in the free-text lead, while still blocking affirmative approval/safety **claims** and
**prescriptive/personalized** dosing — and showing a "for research purposes only" warning
whenever dose figures appear.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Regulatory policy line | Allow absence-of-approval (negated); block affirmative approval/clearance claims |
| Dose figures in `directAnswer` | Permit (stop stripping); rely on the prescriptive guard for safety |
| Dose warning form | **Conditional warning banner** shown when dose figures are present |
| Guard scope | Change the **global** `containsDisallowedPhrase` (both callers benefit, strictly safer) |

## Non-goals (YAGNI)

- The "About" section (richer FDA-stance content, FDA-sentiment research) — a **separate**
  brainstorm/spec/PR.
- Changing `containsPrescriptivePhrase` (it stays exactly as-is; it is the safety line).
- Per-figure inline tagging or an always-on merged disclaimer (both rejected).
- Removing the structured `dosing[]` section (kept — it adds tiering + per-item citations).
- Any change to the local-only provider, SSRF, citation invariant, or audit behavior.

## Architecture

### 1. Negation-aware regulatory guard — `lib/ai/domain/schemas.ts`

Today `DISALLOWED_PHRASES` is a flat list tested with `.some(re => re.test(text))`. Split the
intent into two categories:

- **Approval/clearance claim patterns** (negation-aware): `clinically approved`,
  `(fda|ema)[\s-]*approved`, `approved by the (fda|ema)`, `safety[\s-]*clearance`. A match is
  **disallowed only when it is an affirmative claim** — i.e. no negation token precedes the
  phrase within its clause.
- **Always-disallowed patterns** (unchanged, context-free): `recommended dose for you`
  (personalized recommendation — a different category, never permitted).

New helper:

```ts
// Negation tokens that flip an approval phrase from a CLAIM to a descriptive ABSENCE.
// (Deliberately excludes "non"/"un" prefixes: they cause distant false-negatives like
// "this NON-peptide is FDA-approved", and "unapproved"/"non-approved" don't contain a
// \bapproved\b boundary anyway, so they're already permitted.)
const NEGATION = /\b(not|no|never|cannot|can'?t|isn'?t|aren'?t|wasn'?t|lacks?|lacking|without|absence of|yet to be|fails? to)\b/i;

// True only when an approval/clearance phrase appears as an AFFIRMATIVE claim
// (no negation immediately governing it).
function isAffirmativeApprovalClaim(text: string): boolean { /* see below */ }
```

`containsDisallowedPhrase(text)` returns true iff **any** always-disallowed pattern matches
**OR** `isAffirmativeApprovalClaim(text)` is true.

`isAffirmativeApprovalClaim` algorithm (robust to "is **not yet** FDA-approved", "**lacks**
FDA approval"): for each approval/clearance pattern, find each match; look back over a
**bounded window immediately preceding the match** — the text from the start of its clause
(split on `/[.;\n]|,\s/`) up to the match, capped at the last ~8 words — for a `NEGATION`
token. If one is found in that window the match is descriptive (allowed); otherwise it is an
affirmative claim (disallowed). Return true on the first affirmative match. The bounded window
prevents a distant, unrelated negation ("this **non**-peptide ... is **FDA-approved**") from
wrongly rescuing an affirmative claim.

Blast radius is two callers — `compoundResearch.ts` (research) and
`draftCompoundProfile.ts` (admin profile drafting, human-reviewed before publish). Both
benefit identically; the relaxation only ever *permits* a cautionary "not approved" and never
permits an affirmative claim, so no caller becomes less safe.

### 2. Stop stripping dose figures — `lib/research/application/compoundResearch.ts`

In `applyGuards`, replace the directAnswer block:

```ts
// BEFORE
let directAnswer = ans.directAnswer;
if (!clean(directAnswer)) directAnswer = NO_PROSE_SUMMARY;
else if (containsDoseFigure(directAnswer)) {
  const stripped = stripDoseFigureSentences(directAnswer);
  directAnswer = stripped.length > 0 ? stripped : NO_PROSE_SUMMARY;
}

// AFTER
const directAnswer = clean(ans.directAnswer) ? ans.directAnswer : NO_PROSE_SUMMARY;
```

- `clean(t) = !containsDisallowedPhrase(t) && !containsPrescriptivePhrase(t)` — unchanged, but
  `containsDisallowedPhrase` is now negation-aware (§1). Descriptive doses pass
  `containsPrescriptivePhrase` (it only flags imperatives/personalization), so they survive.
- Remove the `stripDoseFigureSentences` import/use here. `containsDoseFigure` is no longer used
  in `compoundResearch.ts` (it moves to the panel, §4).
- `NO_PROSE_SUMMARY` stays for the disallowed/prescriptive case (and the panel's save-skip
  check stays in sync, unchanged).
- evidence / dosing / caveatsGaps guard logic is unchanged (cited + `clean`).

### 3. Synthesis prompt — `SYNTH_SYSTEM` in `compoundResearch.ts`

Remove the two constraints added on 2026-06-13:
- "Put ALL numeric dose/frequency detail in dosing[] (NEVER in directAnswer)" → soften to:
  "directAnswer may summarize key reported dose ranges descriptively; put the full per-protocol
  breakdown in dosing[]."
- "do NOT use regulatory/approval wording ... state regulatory status in caveatsGaps instead"
  → remove. The model may state regulatory status (e.g. "not FDA-approved") in directAnswer.

Keep unchanged: descriptive/attributed/cited, never advice, never personalized, never 2nd
person; every evidence/dosing item cites a fetched source; tier-tag dosing.

### 4. Conditional dose warning — `app/(dashboard)/reference/_components/CompoundResearchPanel.tsx`

`guards.ts` is pure and dependency-free, so the client panel may import `containsDoseFigure`.
Render a warning when dose figures are present anywhere in the answer:

```tsx
import { containsDoseFigure } from '@/lib/research/domain/guards';
const DOSE_WARNING = 'Dose figures are reported from studies and protocols for informational purposes only — not dosing advice.';
const showDoseWarning = !!result && (result.dosing.length > 0 || containsDoseFigure(result.directAnswer));
```

Render `showDoseWarning` as an emphasized line (warning style, e.g. amber) directly under the
result, alongside the existing `DISCLAIMER` ("Unverified — not medical advice."), which stays.

### 5. `guards.ts` cleanup

- `containsDoseFigure` — **kept** (now consumed by the panel).
- `stripDoseFigureSentences` — **removed** (no remaining caller); remove its unit tests.
- `containsPrescriptivePhrase`, `containsDoseFigure`, `DOSE_INTENT_TERMS`,
  `isDoseIntentQuestion` — unchanged.

### 6. ADR Revisions

- **ADR-010** — add a Revision: the disallowed "approval/safety-clearance language" rule
  targets **affirmative claims**; the AI **may** state the **absence** of approval as a
  cautionary fact (negation-aware). Personalized recommendations ("recommended dose for you")
  remain disallowed.
- **ADR-017** — add a Revision: descriptive dose figures are permitted in the research answer
  (including the free-text lead), surfaced with a "research purposes only" warning; the
  earlier "no dose numbers in directAnswer" rule is superseded. Prescriptive/personalized
  dosing remains blocked by `containsPrescriptivePhrase`; the structured tiered `dosing[]`
  section is retained.

## Components / boundaries

| Unit | Change |
|------|--------|
| `lib/ai/domain/schemas.ts` | `DISALLOWED_PHRASES` split; `isAffirmativeApprovalClaim` + `NEGATION`; negation-aware `containsDisallowedPhrase` |
| `lib/research/application/compoundResearch.ts` | Drop dose-figure stripping in `applyGuards`; relax `SYNTH_SYSTEM`; remove `stripDoseFigureSentences`/`containsDoseFigure` usage |
| `lib/research/domain/guards.ts` | Remove `stripDoseFigureSentences` (+ tests); keep `containsDoseFigure` |
| `app/(dashboard)/reference/_components/CompoundResearchPanel.tsx` | Conditional dose-warning banner using `containsDoseFigure` |
| `docs/adrs/ADR-010-*.md`, `docs/adrs/ADR-017-*.md` | Revision notes |

## Testing

- **Negation-aware guard** (`lib/ai/domain/schemas.ts`) unit fixtures:
  - ALLOW (return false): "GHK-Cu is not FDA-approved", "lacks FDA approval", "is not yet
    FDA-approved", "not clinically approved", "no safety clearance", "remains investigational".
  - BLOCK (return true): "GHK-Cu is FDA-approved", "FDA-approved for wound healing",
    "clinically approved", "approved by the FDA", "safety clearance", "recommended dose for you".
  - BLOCK despite a distant unrelated negation (proximity guard): "This non-peptide compound is
    FDA-approved" → true; "It is not a steroid and is FDA-approved" → true.
  - ALLOW with negation following the phrase only when it actually negates: "FDA-approved,
    though not for this use" → **true** (affirmative claim; the trailing "not" does not rescue it).
- **Orchestration** (`tests/acceptance/RES-compoundResearch.test.ts`): rework the two
  dose-figure tests — a descriptive dose-figure `directAnswer` is now **kept verbatim** (not
  stripped, not redirected); a prescriptive `directAnswer` ("you should take 2 mg") still →
  `NO_PROSE_SUMMARY`; prescriptive evidence still dropped; disallowed dosing still dropped.
  Remove the obsolete "redirects ... entirely dose figures" test.
- **guards** (`tests/acceptance/RES-guards.test.ts`): remove the `stripDoseFigureSentences`
  block; keep `containsDoseFigure` tests.
- **Warning trigger**: a small assertion that `showDoseWarning` is true when `dosing` is
  non-empty or `directAnswer` has a figure, false otherwise (unit-level on the boolean, or a
  panel render test consistent with existing panel test style).
- **Full gate** `pnpm check` green; no live model run required for this change (deterministic
  guard/UI logic), though a quick local re-run is a nice confirmation if convenient.

## Open items for the plan

- Final tuning of the bounded preceding-window size (~8 words) for
  `isAffirmativeApprovalClaim`, and handling of multiple matches in one string (return true on
  the first affirmative). A negation that *follows* the phrase must not rescue it (only the
  preceding window counts) — covered by the "though not for this use" BLOCK fixture.
- Confirm `draftCompoundProfile.ts` has no test asserting the old "FDA-approved blocked
  regardless of negation" behavior; update if present.
