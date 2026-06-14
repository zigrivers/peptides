# ADR-017: Compound Research via Local Model + Server-Side Web Search

## Status
Accepted

## Context
Users want to ask free-text questions about a compound and get a **cited** answer, from
both the Tracker compound modal and the Catalog/reference detail view. The operator runs a
**local open-source model** (a 35B orchestrator on `localhost`, OpenAI-compatible API)
that we want to use for this feature — both to avoid per-call frontier-provider cost and
because the operator prefers local inference for this exploratory, research-only use.

ADR-010 governs the AI provider layer: it allows only **bounded** AI uses (no dose
recommendations, no stack optimization, no "safety clearance" language), requires that AI
**never block user-facing flows**, and defines an `Anthropic → Gemini → DeepSeek`
fall-through for the *paid* provider chain. ADR-010 explicitly considered and rejected a
self-hosted local model as a *general* provider due to operational burden. This ADR does
**not** reverse that: it introduces the local model as a **dedicated, env-gated provider
for one new bounded operation only**, and crucially **forbids falling back to a paid
provider** for it.

This is a new AI operation (`compound_research`) that is multi-step (plan searches → run
searches server-side → synthesize), so it does not fit `AIClient`'s single-shot failover
orchestrator. A run can take ~2–3 minutes on the local model, which also rules out a single
opaque synchronous request.

## Decision

### Provider
- Add `lib/ai/infrastructure/localModelClient.ts`, a lazy, **side-effect-free**,
  env-gated factory mirroring `deepseekClient.ts`. It returns `null` unless
  `LOCAL_LLM_BASE_URL` is set, uses `@ai-sdk/openai-compatible`'s `createOpenAICompatible`,
  and **resolves the model id at runtime** from `GET {base}/models` (in-flight-promise
  deduped, TTL-cached), overridable via `LOCAL_LLM_MODEL`. Never hardcode a model alias.
  `maxRetries: 0` is applied **per call** on `generateObject`/`generateText` (it is not a
  factory option) so a local failure aborts instantly. Reachability and feature-enabled
  helpers are TTL-cached and never throw.
- Pin **`@ai-sdk/openai-compatible@^2.0.50`** — this is the line compatible with the
  installed `ai@6` / `@ai-sdk/provider@3.0.10` / `@ai-sdk/provider-utils@4.0.x` tree (the
  `3.0.0-beta` line is a pre-release, NOT "v3 like the other adapters"). After install,
  confirm a single deduped `@ai-sdk/provider`/`provider-utils` copy; a required type cast on
  the factory's model would signal a duplicate install to fix, not to paper over.
- Default `LOCAL_LLM_BASE_URL = http://127.0.0.1:8001/v1`.
- A feature flag `COMPOUND_RESEARCH_ENABLED` plus a cheap reachability check gate the
  feature. **When the flag is off or the endpoint is unreachable, the feature is
  hidden/disabled with a clear message — we do NOT silently fall back to Anthropic/Gemini/
  DeepSeek.** This is the key constraint distinguishing this operation from every other AI
  use in the app.

### Web search (server-side only)
- Add `lib/research/webSearch.ts`. **Tavily primary** (`@tavily/core`, `searchDepth:
  'basic'` **plus `includeRawContent:'markdown'`** — `basic` alone returns only snippets,
  so raw content is required to feed real text to the small-context model; normalize
  `content = rawContent ?? content`), **DuckDuckGo fallback** (`duck-duck-scrape`, keyless,
  snippet-only, with retry/backoff + small in-memory cache and try/catch around its thrown
  anomaly/VQD errors). Provider selected by `WEB_SEARCH_PROVIDER` (default `tavily`);
  auto-fallback to DDG when `TAVILY_API_KEY` is missing or Tavily errors. `TAVILY_API_KEY`
  is **server-only**, never sent to the client. Log which provider served each request.
- **SSRF boundary:** `webSearch` passes only the query string to the provider SDK; the
  server never issues an outbound fetch to any model- or result-supplied URL. Page text
  comes only from the provider response. Source URLs are client-side links only, never
  dereferenced server-side. Fetched page content is treated as **untrusted** input to the
  synthesis prompt (prompt-injection mitigation), backed by the output content guard below.

### Orchestration
- Add `lib/ai/application/compoundResearch.ts` — a multi-step loop (NOT `AIClient`):
  (1) local model plans 1–3 queries, (2) server searches + dedupes, (3) local model
  synthesizes `{ summary, findings:[{claim, sourceUrls[]}], sourcesUsed[] }`. Both the
  planning and synthesis calls go through one shared structured-output helper that tries
  `generateObject` and, on `NoObjectGeneratedError` only (mlx-style endpoints are
  inconsistent at JSON mode), falls back to `generateText` + strict-parse + Zod-validate;
  timeout/abort/network errors do **not** trigger the parse fallback (they fail closed).
  Zod schemas use `.nullable()` rather than `.optional()` for JSON-mode reliability.
  **Every claim must cite at least one fetched source URL**; a post-synthesis guard
  URL-normalizes both sides, drops uncited/hallucinated claims, prunes orphaned
  `sourcesUsed`, and runs the existing `containsDisallowedPhrase()` over the summary and
  every claim (ADR-010). Reuse the existing timeout pattern with an overall budget (~150s)
  and an explicit `maxDuration` on the run endpoint; audit events carry **no prompt,
  answer, or search-query content** — fixed-label error classification only, consistent
  with `AIClient`. New `AIOperation` value `compound_research`.

### Persistence (per-user private)
- New `CompoundResearchNote` model linked to **`CatalogItem`** (works for peptides and
  supplements) and owned by `userId` (identity-scoped — **no** new scoping exception
  needed). Citations stored in a note-owned `CompoundResearchNoteCitation` table
  (`title`, `url`) mirroring the existing `*Citation` shape; we deliberately do **not**
  reuse the admin `Citation` table (those are global, `userId`-less reference rows).
- **Drafts are not persisted.** A research run returns results to the client; only
  user-approved findings are written, via `saveCompoundResearchNotes`. No `status` enum,
  no draft-cleanup cron.
- New audit category `Research` with actions `RESEARCH_NOTE_SAVED`,
  `RESEARCH_NOTE_DELETED`.

### Execution model (resolved blocker)
- The **run is a streaming `POST` Route Handler**
  (`app/api/reference/[catalogItemId]/research/route.ts`) that emits NDJSON progress events
  (`planning` → `searching` → `synthesizing` → `result`|`error`), not a single ~180s
  synchronous server action. Streaming keeps the connection alive with data flowing
  (defeating proxy/LB/client idle timeouts), surfaces progress, and is fully compatible with
  "no draft persistence" — the terminal `result` event carries the answer, held client-side
  until save. This supersedes the original "`runCompoundResearch` server action" wording.
- `auth()` session required; zod-validate (`question` 1–500 chars); **feature-gate**
  (disabled/unreachable → terminal `error` event the UI renders as a disabled state);
  **best-effort rate-limit 5 runs/hour/user**; never leaks secrets. No DB write.

### Server actions
- `saveCompoundResearchNotes(input)` — persists only user-approved findings + their
  citations (zod-bounded: ≤25 findings, `http(s)` URLs only, capped text lengths) in a
  `withAudit` transaction; **every write carries `userId`.**
- `deleteCompoundResearchNote(noteId)` — delete scoped by `{ id, userId }` (never `{ id }`).
- All reads are `where: { userId, catalogItemId }`. No new identity-scoping exception.

### Required edits to existing files
`prisma/schema.prisma` gains `researchNotes CompoundResearchNote[]` back-relations on
`User` and `CatalogItem`; `lib/ai/domain/types.ts` extends `AIOperation`;
`lib/audit/domain/AuditEvent.ts` adds the `Research` category and two actions. These are
closed unions / bidirectional relations — omitting them fails `typecheck`/`prisma:validate`.

### Disallowed (reaffirms ADR-010)
- No dose recommendations, stack optimization, interaction analysis, or "safety
  clearance"/"approved" language in research output. Saved notes are always labeled
  **"Unverified — not medical advice."**

## Alternatives Considered
- **Reuse `AIClient` failover with the local model added to the chain.** Rejected:
  `AIClient` is single-shot; research is a plan→search→synthesize loop. Adding the local
  model to the paid chain would also risk silently answering with a paid provider, which
  this feature must not do.
- **Persist drafts with a `draft|saved` status + cleanup cron.** Rejected as unnecessary
  complexity; persisting only on save removes throwaway rows and a cleanup job.
- **Global/shared notes on the compound.** Rejected: would require a CLAUDE.md
  identity-scoping exception and would surface one user's unverified web research to all
  users. Per-user private keeps the identity model clean.
- **Reuse the admin `Citation` table for note sources.** Rejected: it is `userId`-less
  global reference data; mixing user web sources in would break the identity model.
- **Client-side web search.** Rejected: would leak `TAVILY_API_KEY` and is not reliably
  available; search runs server-side only.
- **Single synchronous ~180s server action for the run.** Rejected: fragile behind
  proxy/LB/client idle timeouts, blank-spinner UX, and the heaviest possible blocking flow
  (against ADR-010's spirit). Streaming Route Handler chosen instead.
- **Job + poll (enqueue, return runId, poll for status).** Rejected for v1: needs a
  transient store, which fights the "persist only on save / no draft rows" decision. The
  stream delivers the same long-run resilience without persisting drafts.

## Consequences
- **Benefits**: A cited, on-demand research assistant at zero per-call frontier cost when
  the local stack is up; clean identity scoping; no new scoping exception; compatible with
  ADR-010's non-blocking guarantee.
- **Costs**: Feature availability depends on the operator's local stack being reachable
  from the deployment — by design it is simply hidden when not. Local generation is slow
  (~150s budget). Local JSON-mode unreliability forces a `generateText` parse fallback to
  maintain (on both model calls). Tavily `includeRawContent` may raise per-search credit
  cost vs. plain `basic`. One optional `TAVILY_API_KEY` to manage (DDG works keyless).
  Non-deterministic output requires eval/test coverage (ADR-008).
- **Rate-limit caveat**: `createRateLimiter` is an in-memory per-process Map, so "5/hr/user"
  is **best-effort**, not a hard cross-instance quota (effective limit `5 × instances`,
  resets on redeploy). Acceptable because the feature only runs where the local model is
  reachable (single-operator/self-hosted, typically one instance) and the real bottleneck is
  serialized local generation. For Tavily **billing** protection, set an account-level spend
  cap in the Tavily dashboard — the limiter is not a billing guard.

## Traces
- ADR-010 (AI strategy — bounded uses, non-blocking; this ADR adds a local-only operation
  that must not fall back to paid providers).
- ADR-009 (audit logging — research audit events, no prompt content).
- ADR-016 (local-first CI — no GitHub Actions added).
- CLAUDE.md identity-scoping rule (per-user private notes satisfy it with no exception).
- Design spec: `docs/superpowers/specs/2026-06-13-compound-research-design.md`.

---

## Revision (2026-06-13)

**Source of truth:** `docs/superpowers/specs/2026-06-13-compound-research-enhancement-design.md`

### What changed

#### Deepened orchestration

The planner prompt now decomposes the user question into **1–6 atomic sub-questions** and
produces **3–5 targeted queries** (raised from 1–3) that together cover each sub-question,
including dose/amount/frequency/population angles as distinct queries. Synthesis is
explicitly instructed to address every sub-question or mark it unanswered.

**Deeper budgeted search.** `MAX_SOURCES_FOR_SYNTHESIS` raised from 3 to **8**;
`MAX_SOURCE_CONTENT_CHARS` raised from 1 200 to **3 000** per source. A `MAX_TOTAL_SOURCE_CHARS`
backstop (24 000) is applied after dedup+cap and silently truncates no sources — dropped
source count is logged via `console.warn`. `PER_QUERY_MAX_RESULTS = 5`.

**Single objective-triggered adaptive gap-fill.** After the first synthesis pass and its
guard run, exactly **one** follow-up round fires iff any of the following objective conditions
hold: `directAnswer` is empty or shorter than `MIN_DIRECT_ANSWER_CHARS` (80 chars); zero
`evidence` items survive the citation guard; or `dosing` is empty and the question is
dose-related (detected by matching `DOSE_INTENT_TERMS` — a fixed list in `guards.ts` — against
the lowercased question and each sub-question). `needsMoreEvidence` (a boolean the model may
return) is **advisory only** — it can raise the gap-fill trigger but never suppress an
objective trigger. Gap-fill queries are built in code (not by re-invoking the planner), so a
gap-fill round adds exactly one extra model call (re-synthesis). The shared `seen` Set
deduplicates across both rounds; the combined set is re-capped to 8 sources and the char
backstop. A second-round `needsMoreEvidence` is ignored — no further retries. **Exactly one**
`phase: 'result'` event is emitted per run, after all gap-fill and guard passes complete.
Nothing shown to the user is ever retracted.

#### Structured `ResearchAnswer` contract

Replaces `{ summary, findings[], sourcesUsed }`:

```ts
interface ResearchAnswer {
  directAnswer: string;               // prose conclusions; NO dose figures
  evidence: { point: string; sourceUrls: string[] }[];
  dosing: { text: string; tier: DoseTier; sourceUrls: string[] }[];
  caveatsGaps: string[];
  sourcesUsed: { title: string; url: string }[];
  needsMoreEvidence: boolean;         // advisory; never shown or saved
}
type DoseTier = 'clinical' | 'non_clinical' | 'unclear';
```

Every `evidence` and `dosing` item must cite ≥ 1 fetched source URL (citation invariant,
enforced both at the Zod schema layer and by the post-synthesis guard). `directAnswer`
carries no specific dose amounts or frequencies — those belong in `dosing[]` where citation
enforcement applies.

#### Expanded ADR-010 guard pipeline

Applied after each synthesis pass (initial and gap-fill):

1. **Citation invariant** — URL-normalize both sides; keep only items citing a source
   actually shown to the model.
2. **Disallowed-phrase guard** — existing `containsDisallowedPhrase()` now covers
   `directAnswer`, every `evidence.point`, every `dosing.text`, and every `caveatsGaps`
   item (previously covered summary + claims only).
3. **Prescriptive-phrase guard** — new `containsPrescriptivePhrase()` in
   `lib/research/domain/guards.ts` rejects 2nd-person dosing imperatives and profile
   personalization (e.g. "you should take", "for a 56-year-old, dose at…"). Applied to the
   same four targets as step 2.
4. **Dose-figure-in-directAnswer guard** — if `directAnswer` matches a dose-figure pattern
   (`\d+(mg|mcg|iu|ml|units?)` or `\d+x(daily|weekly|…)`), offending sentences are stripped
   by `stripDoseFigureSentences()`; if all sentences carry figures the field is replaced with
   a policy-withheld message.
5. **Tier normalization** — force a valid `DoseTier` on every surviving `dosing` item
   (default `unclear`).
6. **Prune `sourcesUsed`** to those still referenced after items are dropped.

Guard ordering: steps 1–4 run as a single pass per item; tier normalization and prune run
once over survivors.

#### Section-based persistence (additive, non-destructive migration)

`CompoundResearchNote.claim` is relaxed to **nullable** (preserving all existing rows).
Two new tables are added:

- **`CompoundResearchNoteSection`** — `(id, noteId FK→Note cascade, type, content Text,
  tier String?, order Int)`. `type ∈ {direct_answer, evidence, dosing, caveats}`, validated
  in the app layer (plain `String` column, not a Postgres enum, to keep the migration
  additive). `tier` set only on `dosing` sections (the validated `DoseTier`), null otherwise.
- **`CompoundResearchNoteSectionCitation`** — `(id, sectionId FK→Section cascade, title, url)`.

**Legacy discrimination:** a note is legacy iff it has zero sections (`claim` is non-null);
it is new iff it has ≥ 1 section (`claim` is null). The repo's `listForUserAndCompound`
includes `sections.citations` (new) and the legacy `citations`; the panel renders them
appropriately. No saved data is lost or altered.

**Whole-note delete** cascades via FK through sections and section-citations — sections are
never deleted directly. Identity scoping: creates stamp `userId` on the parent note; reads
are `where: { userId, catalogItemId }`; deletes are `where: { id, userId }`. No new
identity-scoping exception is introduced.

#### New progress events (streamed only, never audited)

Two new `ProgressEvent` phases added to the union:

- `{ phase: 'sources_found'; count: number }` — emitted after each search round.
- `{ phase: 'gap_filling'; query: string }` — emitted if the gap-fill round fires.

These events are streamed to the user's own browser only and are **never written to the
audit log**. Audit remains exactly as before: fixed-label `AI_REQUEST_INITIATED` /
`AI_REQUEST_FAILED` under category `Security`, carrying no question, answer, or query
content. The `Research` category (`RESEARCH_NOTE_SAVED` / `RESEARCH_NOTE_DELETED`) remains
for save/delete only.

### Invariants unchanged

The following invariants from the original decision are **unchanged** by this revision:

- **Local-only provider / no paid fallback.** The feature is hidden when the local endpoint
  is unreachable; it never routes to Anthropic, Gemini, or DeepSeek.
- **SSRF boundary.** `webSearch` passes only the query string to the provider SDK; the
  server never fetches any URL from model output or search results.
- **Citation invariant.** Every `evidence` and `dosing` item must cite ≥ 1 URL that was
  actually fetched during the run.
- **Fixed-label audit.** Research-run audit events carry no prompt, answer, sub-question,
  or search-query content — fixed-label error classification only (ADR-009).
- **No identity-scoping exception.** Per-user private notes, no new exception needed.

---

## Revision (2026-06-14)

**Source of truth:** `docs/superpowers/specs/2026-06-14-research-content-relaxation-design.md` §2–§5, §6.

### Descriptive dose figures are now permitted in `directAnswer`

The 2026-06-13 revision's rule — *"directAnswer carries no specific dose amounts or
frequencies — those belong in dosing[] where citation enforcement applies"* — is
**superseded** by this revision.

Descriptive dose figures (e.g. "studies report 1–2 mg/day subcutaneously") are now
**permitted in the free-text `directAnswer`**. The safety rationale for the old rule was that
dose figures in the prose lead might constitute dosing advice; however, the
`containsPrescriptivePhrase` guard already blocks the genuinely unsafe forms (imperatives,
personalized/2nd-person dosing such as "you should take 2 mg"). Stripping descriptive figures
was over-censorship that collapsed informative research leads into the `NO_PROSE_SUMMARY`
placeholder.

The structured tiered `dosing[]` section is **retained** — it provides per-protocol
source citation enforcement and `DoseTier` tagging that the prose lead does not. Descriptive
figures in `directAnswer` complement the structured section; they do not replace it.

### `directAnswer` is withheld only for prescriptive or disallowed phrasing

`directAnswer` is replaced by the `NO_PROSE_SUMMARY` placeholder **only when** it trips the
content guard — i.e. it contains:

- **prescriptive/personalized phrasing** (`containsPrescriptivePhrase`): 2nd-person dosing
  imperatives, personalized recommendations ("you should take", "for a 56-year-old, dose
  at…"), or
- **an affirmative approval/clearance claim** (`containsDisallowedPhrase`, now
  negation-aware per ADR-010 Revision 2026-06-14).

Descriptive dose figures and cautionary regulatory-status statements ("not FDA-approved",
"investigational", "lacks FDA approval") do **not** trigger the placeholder.

### Dose-figures warning banner

Whenever the research answer contains dose figures — either in `directAnswer` or in the
structured `dosing[]` section — the UI renders a **"research purposes only" warning banner**
alongside the result:

> *Dose figures are reported from studies and protocols for informational purposes only —
> not dosing advice.*

This banner is conditional on `shouldShowDoseWarning(directAnswer, dosing.length)` (exported
from `lib/research/domain/guards.ts`). The existing `DISCLAIMER` ("Unverified — not medical
advice.") remains in place unconditionally.

### Guard pipeline changes

Step 4 of the 2026-06-13 guard pipeline — **Dose-figure-in-directAnswer guard**
(`stripDoseFigureSentences`) — is **removed**. The updated pipeline is:

1. Citation invariant (unchanged).
2. Disallowed-phrase guard — `containsDisallowedPhrase()`, now negation-aware (ADR-010
   Revision 2026-06-14). Applied to `directAnswer`, every `evidence.point`, every
   `dosing.text`, and every `caveatsGaps` item.
3. Prescriptive-phrase guard — `containsPrescriptivePhrase()` (unchanged). Applied to the
   same four targets.
4. ~~Dose-figure-in-directAnswer guard~~ — **removed**.
5. Tier normalization (renumbered from 5, unchanged).
6. Prune `sourcesUsed` (renumbered from 6, unchanged).

### Synthesis prompt (`SYNTH_SYSTEM`) relaxation

The two constraints added on 2026-06-13 that prohibited dose figures and regulatory wording
in `directAnswer` are removed from the synthesis system prompt. The model is now instructed:

> "directAnswer may summarize key reported dose ranges and regulatory status descriptively
> (e.g. 'studies report 1-2 mg/day'; 'not FDA-approved'); put the full per-protocol
> breakdown in dosing[]. Never phrase anything as advice, a recommendation, personalized,
> or 2nd-person."

Unchanged instructions: descriptive/attributed/cited, never advice, never personalized, never
2nd person; every evidence/dosing item cites a fetched source; tier-tag dosing.

### Invariants unchanged by this revision

- **Prescriptive/personalized dosing remains blocked.** `containsPrescriptivePhrase` is
  unchanged and continues to catch 2nd-person imperatives and profile personalization.
- **Local-only provider, SSRF boundary, citation invariant, fixed-label audit,
  no identity-scoping exception** — all unchanged (see 2026-06-13 revision).
