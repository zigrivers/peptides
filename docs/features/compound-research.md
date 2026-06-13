# Compound Research

**Status:** Accepted  
**Date:** 2026-06-13  
**ADR:** `docs/adrs/ADR-017-compound-research.md`  
**Design spec:** `docs/superpowers/specs/2026-06-13-compound-research-design.md`

---

## What It Does

A signed-in user opens any compound — either via the Tracker's `CompoundInfoModal` or the Catalog detail page (`/reference/[slug]`) — and types a free-text question about that compound. The feature:

1. Sends the question to the server, where a **local open-source model** (OpenAI-compatible API, operator-hosted) plans 1–3 focused web search queries.
2. The server runs those searches (Tavily primary, DuckDuckGo fallback) and collects page text.
3. The local model synthesizes a **cited answer** from the fetched sources. Every claim must reference at least one fetched URL; uncited claims are dropped before the result reaches the client.
4. The answer streams back to the UI as NDJSON progress events (`planning → searching → synthesizing → result`), keeping the connection alive during the ~150s generation window.
5. The user reviews the results and **selectively saves** individual findings as private notes. Saved notes render on both the Tracker modal and the Catalog detail page, each labeled **"Unverified — not medical advice."**

**Drafts are never persisted.** Only user-approved findings are written to the database.

---

## Enabling the Feature

The feature is **hidden and disabled** unless `COMPOUND_RESEARCH_ENABLED=true` AND the local endpoint is reachable. It never falls back to a paid frontier provider (Anthropic, Gemini, DeepSeek).

| Variable | Default | Notes |
|---|---|---|
| `COMPOUND_RESEARCH_ENABLED` | `"false"` | Must be exactly `"true"` to enable |
| `LOCAL_LLM_BASE_URL` | `"http://127.0.0.1:8001/v1"` | OpenAI-compatible endpoint; must be reachable |
| `LOCAL_LLM_API_KEY` | `"not-needed"` | Set if the local endpoint requires auth |
| `LOCAL_LLM_MODEL` | `""` | Optional; if blank, resolved from `GET {base}/models` |
| `LOCAL_LLM_DISABLE_THINKING` | `"true"` | Injects `chat_template_kwargs.enable_thinking=false` into each chat-completion request; disable only if your model is not a reasoning model (reasoning models are otherwise too slow) |
| `WEB_SEARCH_PROVIDER` | `"tavily"` | `tavily` or `ddg` |
| `TAVILY_API_KEY` | `""` | Server-only; if absent, DuckDuckGo is used |

Reachability is TTL-cached (30 s) per process. When the flag is off or the endpoint is unreachable, the UI renders a disabled/informational state — no error is surfaced to the user as a failure.

---

## Architecture and Data Flow

```
Client (browser)
  └─ POST /api/reference/[catalogItemId]/research   ← streaming NDJSON
        │
        ├─ auth() + rate-limit (5 runs/hr/user, in-memory, per-process)
        │
        └─ lib/research/application/compoundResearch.ts
              │
              ├─ 1. PLAN   → lib/ai/infrastructure/localModelClient.ts
              │              (generateObject / generateText + Zod parse fallback)
              │
              ├─ 2. SEARCH → lib/research/infrastructure/webSearch.ts
              │              Tavily (includeRawContent:'markdown') → DDG fallback
              │              In-memory cache, 5 min TTL
              │
              └─ 3. SYNTHESIZE → localModelClient (same local model)
                     │
                     └─ Post-synthesis guard:
                          • Drop claims with no fetched-URL citation
                          • Drop claims matching containsDisallowedPhrase() (ADR-010)
                          • Prune orphaned sourcesUsed entries
```

**Progress events** (NDJSON, one JSON object per line):

| Phase | Payload |
|---|---|
| `planning` | _(none)_ |
| `searching` | `{ queries: string[] }` |
| `synthesizing` | _(none)_ |
| `result` | `{ result: ResearchResult }` |
| `error` | `{ code: string }` |

**Save / list / delete** are separate server actions (`lib/research/application/CompoundResearchNoteService.ts`): `saveResearchNotes`, `listResearchNotes`, `deleteResearchNote`. All reads and writes are scoped by `userId`.

---

## Data Model

Two new tables, both per-user-private (no identity-scoping exception needed):

**`CompoundResearchNote`** — one row per saved finding, linked to `CatalogItem` and owned by `userId`. Stores the originating `question`, optional `answerSummary`, and the `claim` text.

**`CompoundResearchNoteCitation`** — child rows per note; each holds a `title` and `url` from the fetched search results. These are user-web-source citations, deliberately separate from the admin-curated global `Citation` table.

Audit category `Research`, actions `RESEARCH_NOTE_SAVED` and `RESEARCH_NOTE_DELETED`. Audit events carry `catalogItemId` and `citationCount` in metadata — no prompt, question, or answer content is logged.

---

## Safety and Guarantees

- **Citation requirement.** Every saved claim must cite at least one URL that was actually fetched during the run. Hallucinated or unchecked URLs are dropped by URL-normalized comparison.
- **Disallowed-phrase guard (ADR-010).** The synthesizer's system prompt forbids dosing recommendations, approval/safety-clearance language, and interaction claims. Post-synthesis, `containsDisallowedPhrase()` re-checks the summary and each claim; violations are dropped or replaced with `"Summary withheld (policy)."`.
- **SSRF boundary.** `webSearch` passes only the query string to the provider SDK. The server never fetches any URL that came from the model output or search results. Source URLs are surfaced as client-side links only.
- **No prompt/answer content in audit logs.** Audit events use fixed-label error classification only, consistent with `AIClient` (ADR-009).
- **Saved notes are always labeled "Unverified — not medical advice."** This label is enforced at the UI layer on both surfaces.
- **No paid-provider fallback.** If the local model is unavailable, the feature hides — it does not transparently route to Anthropic, Gemini, or DeepSeek.

---

## Caveats

- **Rate limit is best-effort.** The 5 runs/hr/user guard uses an in-memory per-process Map. Effective limit is `5 × running instances` and resets on redeploy. This is acceptable because the feature only operates when the local model is reachable (typically single-operator, one instance), and the real serialization bottleneck is local generation. For Tavily **billing protection**, set an account-level spend cap in the Tavily dashboard — the in-process rate limiter is not a billing guard.
- **Generation is slow.** The local model budget is ~150 s per run; the streaming approach keeps the UI responsive during this window.
- **Tavily `includeRawContent` credit cost.** Using `includeRawContent:'markdown'` on the Tavily `basic` search depth returns full page text, which is required for synthesis quality but may raise per-search credit consumption above a plain `basic` request.

---

## Related Documents

- ADR-017: `docs/adrs/ADR-017-compound-research.md` — decision record covering provider choice, orchestration, persistence, and SSRF/safety constraints.
- Design spec: `docs/superpowers/specs/2026-06-13-compound-research-design.md`
