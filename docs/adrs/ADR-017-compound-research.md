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
orchestrator.

## Decision

### Provider
- Add `lib/ai/infrastructure/localModelClient.ts`, a lazy, **side-effect-free**,
  env-gated factory mirroring `deepseekClient.ts`. It returns `null` unless
  `LOCAL_LLM_BASE_URL` is set, uses `@ai-sdk/openai-compatible`'s `createOpenAICompatible`
  with **`maxRetries: 0`** (fail instantly when the local stack is unreachable), and
  **resolves the model id at runtime** from `GET {base}/models` (cached), overridable via
  `LOCAL_LLM_MODEL`. Never hardcode a model alias.
- Default `LOCAL_LLM_BASE_URL = http://127.0.0.1:8001/v1`.
- A feature flag `COMPOUND_RESEARCH_ENABLED` plus a cheap reachability check gate the
  feature. **When the flag is off or the endpoint is unreachable, the feature is
  hidden/disabled with a clear message — we do NOT silently fall back to Anthropic/Gemini/
  DeepSeek.** This is the key constraint distinguishing this operation from every other AI
  use in the app.

### Web search (server-side only)
- Add `lib/research/webSearch.ts`. **Tavily primary** (`@tavily/core`, `searchDepth:
  'basic'`, prefer cleaned page content), **DuckDuckGo fallback** (`duck-duck-scrape`,
  keyless, with retry/backoff + small in-memory cache). Provider selected by
  `WEB_SEARCH_PROVIDER` (default `tavily`); auto-fallback to DDG when `TAVILY_API_KEY` is
  missing or Tavily errors. `TAVILY_API_KEY` is **server-only**, never sent to the client.
  Log which provider served each request.

### Orchestration
- Add `lib/ai/application/compoundResearch.ts` — a multi-step loop (NOT `AIClient`):
  (1) local model plans 1–3 queries, (2) server searches + dedupes, (3) local model
  synthesizes `{ summary, findings:[{claim, sourceUrls[]}], sourcesUsed[] }` via
  `generateObject`. Because local (mlx-style) endpoints are inconsistent at JSON mode, a
  `generateText` + strict-parse **fallback is built regardless**. **Every claim must cite
  at least one fetched source URL**; a post-synthesis guard drops uncited claims. Reuse
  the existing timeout + audit pattern with a generous ~180s timeout; audit events carry
  **no prompt or answer content** (operation + provider + error class only), consistent
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

### Server actions
- `runCompoundResearch(compoundId, question)` and `saveCompoundResearchNotes(compoundId,
  approvedFindings)` — both require a NextAuth session, validate with zod, and are
  `userId`-scoped. `runCompoundResearch` is **rate-limited to 5 runs/hour/user** (protects
  the local model and Tavily credits) and never throws to the user (failures return an
  `error` field; disabled/unreachable returns a disabled state).

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

## Consequences
- **Benefits**: A cited, on-demand research assistant at zero per-call frontier cost when
  the local stack is up; clean identity scoping; no new scoping exception; compatible with
  ADR-010's non-blocking guarantee.
- **Costs**: Feature availability depends on the operator's local stack being reachable
  from the deployment — by design it is simply hidden when not. Local generation is slow
  (~180s timeouts). Local JSON-mode unreliability forces a `generateText` parse fallback to
  maintain. One optional `TAVILY_API_KEY` to manage (DDG works keyless). Non-deterministic
  output requires eval/test coverage (ADR-008).

## Traces
- ADR-010 (AI strategy — bounded uses, non-blocking; this ADR adds a local-only operation
  that must not fall back to paid providers).
- ADR-009 (audit logging — research audit events, no prompt content).
- ADR-016 (local-first CI — no GitHub Actions added).
- CLAUDE.md identity-scoping rule (per-user private notes satisfy it with no exception).
- Design spec: `docs/superpowers/specs/2026-06-13-compound-research-design.md`.
