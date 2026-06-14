# Compound Research Enhancement — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming) — pending implementation plan
**Supersedes (in part):** ADR-017 synthesis/output/persistence sections (to be amended, not replaced)

## Problem

The "Ask about [compound]" feature (ADR-017) behaves like a **citation extractor**, not a
research assistant. For a specific, multi-part question it returns a short generic summary
plus 2–4 topic-fragment "findings," each linking to a source — it does not digest the
sources and answer the question.

**Concrete failure case.** Question: *"What does the research say about a 56-year-old man
taking GHK-Cu, and at what dose amounts and frequency?"* The response was a generic
paragraph about GHK-Cu for tissue/skin/hair plus three fragments like "GHK-Cu is a
biologically active peptide that declines with age." It never addressed age relevance,
never surfaced dose amounts, and never addressed frequency — most of what was asked.

### Root causes (from reading the current pipeline)

1. **Question-blind synthesis.** `lib/research/application/compoundResearch.ts` asks the
   model to "synthesize a cited answer … every finding must cite a source" and return
   `{summary, findings[], sourcesUsed}`. It never instructs the model to decompose the
   question or answer each part. Output free-associates topic atoms.
2. **Source starvation.** `MAX_SOURCES_FOR_SYNTHESIS = 3` × `MAX_SOURCE_CONTENT_CHARS =
   1200` ⇒ the model sees ~3.6 KB of evidence total. Dose/frequency specifics are exactly
   the fine-grained detail truncated away. (A speed compromise — the latency ceiling is now
   lifted.)
3. **Generic query planning.** The planner emits 1–3 broad queries about the compound, not
   targeted queries per sub-question. The searches never retrieve the dose content, so
   synthesis cannot cite what was never fetched.
4. **Single shallow pass.** No per-source reading, extraction, or refinement.
5. **Answer-poor schema.** `summary` + `findings[claim,url]` has nowhere for a direct
   answer, structured dose/protocol data, or an explicit "sources don't address X."
6. **Findings welded to the save unit.** Because a "finding" *is* the savable card, the
   model is nudged toward short atomic claims rather than a real answer.

## Goal

Turn the feature into an assistant that **decomposes the question, digests many sources, and
returns a cited, structured answer that directly addresses each part** — including
descriptively-reported dosing — while staying inside ADR-010 (no dose recommendations, no
stack optimization, no safety-clearance language; AI never blocks user flows; local-only
provider with no paid fallback).

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Output shape | **Labeled sections form** (structured) |
| Orchestration | **Decompose + adaptive gap-fill** |
| Dose reporting | **Descriptive + evidence-tier labels** |
| Save model | **Selective per-section save** |
| Progress UX | **Rich step timeline** (no answer-streaming) |
| Latency | **No hard ceiling**; show a progress indicator instead |

## Architecture

The plan→search→synthesize spine is unchanged. Each stage is deepened and the output
contract + persistence are redesigned. The run remains a streaming NDJSON Route Handler
(`app/api/reference/[catalogItemId]/research/route.ts`); the local model remains the only
provider (no paid fallback); search remains server-side only (SSRF boundary preserved).

### 1. Pipeline

**Plan (1 model call).** Planner output becomes:

```
{ subQuestions: string[], queries: string[] }
```

- `subQuestions`: the user's question decomposed into its parts (e.g., "Is there
  age-relevant data?", "What dose amounts are reported?", "What frequency?").
- `queries`: 3–5 **targeted** queries seeded with dose/population/frequency terms (e.g.
  `GHK-Cu dosage mg protocol`, `GHK-Cu older adults`, `GHK-Cu injection frequency duration`).

**Search.** Each query → `webSearch` (Tavily primary, DDG fallback) → dedupe by
`normalizeUrl` → keep up to **8 sources** (today: 3), at **~3,000 chars/source** (today:
1,200), bounded by an overall input-character cap (`MAX_TOTAL_SOURCE_CHARS`) so we stay
within the local model's context window. When the cap would be exceeded, earlier (higher-
ranked, less-duplicated) sources win and the rest are dropped; the count of dropped sources
is logged (no silent truncation).

**Synthesize (1 model call).** One deep pass over the full evidence block fills the labeled
sections. The prompt instructs the model to address **every `subQuestion`** or explicitly
mark it unanswered ("the sources do not address …").

**Adaptive gap-fill (0–1 extra call).** After the first synthesis, if **either**:
- `directAnswer` is flagged insufficient (a boolean `needsMoreEvidence` the model returns,
  OR an empty `directAnswer`), **or**
- the `dosing` array is empty **and** the question asked about dosing (detected from
  `subQuestions`/question text containing dose/frequency/amount terms),

then run **one** targeted follow-up search round (queries focused on the missing dimension,
e.g. `GHK-Cu subcutaneous dose clinical study`) and re-synthesize **once** over the
combined source set. Bounded to a single retry — never loops.

### 2. Output contract

Replaces `{ summary, findings[], sourcesUsed }`:

```ts
interface ResearchAnswer {
  directAnswer: string;                       // addresses each sub-question; states gaps
  evidence: { point: string; sourceUrls: string[] }[];
  dosing: { text: string; tier: DoseTier; sourceUrls: string[] }[];
  caveatsGaps: string[];                       // what sources don't cover / limitations
  sourcesUsed: { title: string; url: string }[];
  needsMoreEvidence: boolean;                  // drives gap-fill; not shown to user
}
type DoseTier = 'clinical' | 'non_clinical' | 'unclear';
```

- Every `evidence` and `dosing` item MUST cite ≥1 fetched source (citation invariant
  preserved — same URL-normalized validation against the sources actually shown to the
  model).
- `caveatsGaps` items are free text (no citation required — they describe absence).
- Zod schema uses `.nullable()` (not `.optional()`) per ADR-017's JSON-mode reliability
  rule. `needsMoreEvidence` defaults to `false`.

### 3. Safety / dose-line enforcement (ADR-010)

**Synthesis prompt** requires dosing to be:
- **Descriptive and attributed** — report what a source states, not advice.
- **Tier-tagged** — `clinical` (trial/peer-reviewed/reputable database), `non_clinical`
  (community/forum/vendor protocol), or `unclear`.
- **Never 2nd-person, never personalized** to the user's stated profile (e.g. the "56yo").
- Accompanied by a standing note that figures are reported use, not a recommendation, and
  that age-/profile-specific data is absent when it is.

**Guard (post-synthesis), in `compoundResearch.ts`:**
1. Drop uncited `evidence`/`dosing` items (URL-normalize both sides; keep only items citing
   a source actually shown to the model).
2. Run existing `containsDisallowedPhrase()` over `directAnswer`, each `evidence.point`,
   each `dosing.text`, and each `caveatsGaps` item.
3. **New prescriptive-phrasing guard** (`containsPrescriptivePhrase()`): reject items
   phrased as personal instruction — 2nd-person dosing imperatives and profile
   personalization (e.g. "you should", "you can take", "take N mg", "for a 56-year-old,
   dose…"). Rejected `dosing`/`evidence` items are dropped; if `directAnswer` itself is
   prescriptive it is replaced with a policy-withheld message.
4. Force a tier on every surviving `dosing` item (default `unclear` if missing/invalid).
5. Prune `sourcesUsed` to those still referenced after dropping items.

Output stays labeled **"Unverified — not medical advice."** in the UI.

### 4. Persistence / save model

**Selective per-section save.** A saved note = `question` + the **sections the user
checked**, each with its citations.

New schema (additive migration — see below):

```
CompoundResearchNote          (id, userId, catalogItemId, question, createdAt)
  └─ CompoundResearchNoteSection (id, noteId, type, content, order)
       └─ CompoundResearchNoteCitation (id, sectionId, title, url)
```

- `type` ∈ `direct_answer | evidence | dosing | caveats` (string-enum).
- `content` holds the rendered text of that section (for `dosing`, the tier is embedded in
  the rendered text, e.g. "[community protocol] …").
- All reads `where: { userId, catalogItemId }`; delete scoped by `{ id, userId }`. **No new
  identity-scoping exception.**
- Save action zod bounds: ≤4 sections per note, ≤25 citations per section, `http(s)` URLs
  only, capped text lengths.

**Migration (additive — honors the data-safety rule):**
- The current `CompoundResearchNote` stores `question`, `answerSummary`, one `claim`, and
  citations. We **do not drop or rewrite** existing rows.
- Add the new `CompoundResearchNoteSection` table and move citation ownership forward via an
  additive migration. Existing notes are preserved and rendered through a **legacy path**
  (render `claim` + its citations as a single read-only block) so no saved data is lost or
  reset. Implementation plan will specify the exact `ALTER`/`CREATE` steps; `prisma migrate`
  reset is never used on dev/prod.

### 5. Progress UX (rich timeline)

Extend the NDJSON `ProgressEvent` union:

```
{ phase: 'planning' }
{ phase: 'searching';   queries: string[] }
{ phase: 'sources_found'; count: number }
{ phase: 'synthesizing' }
{ phase: 'gap_filling';  query: string }      // conditional
{ phase: 'result';       result: ResearchAnswer }
{ phase: 'error';        code: string }
```

- `useCompoundResearch` accumulates events into an ordered checklist with completed/active
  states and an elapsed timer.
- The final answer renders **only after the guard runs** — nothing shown is later
  retracted (deliberate: no answer-token streaming, to avoid showing then removing a dose
  line in a medical feature).
- The panel renders the labeled sections (Direct answer / Evidence / Reported dosing &
  protocols / Caveats & gaps / Sources) with per-section save checkboxes.

### 6. ADR + tests

**Amend ADR-017** with a "Revision (2026-06-13)" section documenting: deepened
orchestration (decompose + adaptive gap-fill), the new `ResearchAnswer` output contract,
section-based persistence, and the prescriptive-phrasing guard. The local-only /
no-paid-fallback / SSRF / citation invariants are **unchanged**. No new ADR number unless
preferred later.

**Tests** (Vitest; follow `tests/acceptance/` TDD skeleton-first per project rules):
- Planner decomposition: question → `subQuestions` + targeted `queries` (mock model).
- Deep synthesis fills all sections; addresses each sub-question or marks it unanswered.
- Citation invariant: uncited `evidence`/`dosing` items dropped; `sourcesUsed` pruned.
- `containsPrescriptivePhrase()` unit cases (accept descriptive, reject prescriptive/
  personalized).
- Gap-fill trigger logic: fires on empty dosing + dosing question; fires on
  `needsMoreEvidence`; does NOT fire otherwise; never loops past one retry.
- Source budgeting: dedupe + 8-source cap + char cap + dropped-count logging.
- Section save/delete round-trip (identity-scoped); legacy-note rendering.
- One **real end-to-end run** against the live local model before sign-off (per ADR-017;
  if the local endpoint is unreachable, stop and report — do not fake with a cloud model).

## Components / boundaries

| Unit | Responsibility | Changes |
|------|----------------|---------|
| `lib/research/domain/schemas.ts` | Zod: plan, answer, save inputs | New `queryPlanSchema` (subQuestions+queries), `researchAnswerSchema`, updated `saveNotesInputSchema` (sections) |
| `lib/research/domain/types.ts` | TS types | `ResearchAnswer`, `DoseTier`, section types, `SavedResearchNote` (sections) |
| `lib/research/domain/guards.ts` *(new)* | `containsPrescriptivePhrase()` | New, unit-tested |
| `lib/research/application/compoundResearch.ts` | Orchestration | Decompose, deep synthesis, gap-fill, new guard, new events |
| `lib/research/application/localStructuredOutput.ts` | Structured-output helper | Unchanged (reused for both calls) |
| `lib/research/infrastructure/webSearch.ts` | Server-side search | Unchanged (maxResults raised at call site) |
| `lib/research/infrastructure/CompoundResearchNoteRepo.ts` | Persistence | Section-aware reads/writes; legacy read path |
| `app/api/reference/[catalogItemId]/research/route.ts` | Stream run | New event types; pass through |
| `app/actions/reference/*` | Save/list/delete | Section-shaped save input |
| `app/(dashboard)/reference/_components/CompoundResearchPanel.tsx` | UI | Sectioned answer, timeline, per-section save |
| `app/(dashboard)/reference/_components/useCompoundResearch.ts` | Stream client | Accumulate timeline events |
| `prisma/schema.prisma` + migration | DB | New section table (additive) |

## Tunable defaults (chosen, changeable)

- `MAX_SOURCES_FOR_SYNTHESIS = 8`
- `MAX_SOURCE_CONTENT_CHARS = 3000`
- `MAX_TOTAL_SOURCE_CHARS` ≈ 24,000 (context-budget guard)
- Gap-fill: **one** bounded retry
- Per-query `maxResults = 5`

## Non-goals (YAGNI)

- No answer-token streaming (explicitly declined).
- No per-source map-reduce extraction (declined for latency).
- No multi-round agentic loop beyond the single gap-fill retry.
- No "pin key facts" highlights (declined).
- No paid-provider fallback (ADR-010 / ADR-017 constraint).
- No new identity-scoping exception.

## Open items for the plan

- Exact additive migration SQL for the section table + legacy preservation.
- Precise prescriptive-phrase pattern list (start conservative; expand via test cases).
- Context-budget trimming order when `MAX_TOTAL_SOURCE_CHARS` is hit.
