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
