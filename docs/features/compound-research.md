# Compound Research

**Status:** Accepted  
**Date:** 2026-06-13 (revised; original 2026-06-13)  
**ADR:** `docs/adrs/ADR-017-compound-research.md`  
**Design spec:** `docs/superpowers/specs/2026-06-13-compound-research-enhancement-design.md`

---

## What It Does

A signed-in user opens any compound — either via the Tracker's `CompoundInfoModal` or the
Catalog detail page (`/reference/[slug]`) — and types a free-text question about that compound.
The feature:

1. **Decomposes the question** into 1–6 atomic sub-questions and emits 3–5 targeted search
   queries, each seeded with dose/frequency/population angles as needed.
2. **Searches the web server-side** (Tavily primary, DuckDuckGo fallback) for up to 8
   deduplicated sources, with up to 3 000 chars of content per source and a 24 000-char
   total backstop.
3. **Synthesizes a structured answer** from the fetched sources, addressing every
   sub-question explicitly and putting all numeric dose/frequency detail in a dedicated
   `dosing[]` array (never in the free-text `directAnswer`).
4. **Runs a multi-step guard pipeline** (see Safety section) over the answer.
5. **Optionally runs one adaptive gap-fill round** if objective conditions indicate the
   first answer is incomplete (see Gap-fill section).
6. **Streams progress** back to the UI as NDJSON events, keeping the connection alive
   during the multi-minute generation window.
7. The user reviews the structured answer and **selectively saves** per-section notes.
   Saved notes are labeled **"Unverified — not medical advice."** on every surface.

**Drafts are never persisted.** Only user-approved sections are written to the database.

---

## Enabling the Feature

The feature is **hidden and disabled** unless `COMPOUND_RESEARCH_ENABLED=true` AND the local
endpoint is reachable. It never falls back to a paid frontier provider.

| Variable | Default | Notes |
|---|---|---|
| `COMPOUND_RESEARCH_ENABLED` | `"false"` | Must be exactly `"true"` to enable |
| `LOCAL_LLM_BASE_URL` | `"http://127.0.0.1:8001/v1"` | OpenAI-compatible endpoint; must be reachable |
| `LOCAL_LLM_API_KEY` | `"not-needed"` | Set if the local endpoint requires auth |
| `LOCAL_LLM_MODEL` | `""` | Optional; if blank, resolved from `GET {base}/models` |
| `LOCAL_LLM_DISABLE_THINKING` | `"true"` | Injects `chat_template_kwargs.enable_thinking=false`; disable only for non-reasoning models |
| `WEB_SEARCH_PROVIDER` | `"tavily"` | `tavily` or `ddg` |
| `TAVILY_API_KEY` | `""` | Server-only; if absent, DuckDuckGo is used |

Reachability is TTL-cached (30 s) per process. When the flag is off or the endpoint is
unreachable the UI renders a disabled/informational state — no error is surfaced as a failure.

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
              ├─ 1. PLAN   → localModelClient (generateObject / generateText + Zod fallback)
              │              Output: { subQuestions: string[], queries: string[] }
              │
              ├─ 2. SEARCH → lib/research/infrastructure/webSearch.ts
              │              Tavily (includeRawContent:'markdown') → DDG fallback
              │              Shared seen-Set dedup across all rounds
              │              Up to 8 sources × 3 000 chars; 24 000-char total backstop
              │
              ├─ 3. SYNTHESIZE → localModelClient (structured ResearchAnswer)
              │
              ├─ 4. GUARD  → citation invariant + disallowed-phrase + prescriptive-phrase
              │              + dose-figure-in-directAnswer + tier normalize + prune sourcesUsed
              │
              └─ 5. GAP-FILL (conditional, ≤1 round)
                     → additional search + re-synthesize + re-guard
                     → single terminal result event emitted
```

### Progress Events (NDJSON, one JSON object per line)

| Phase | Payload | Notes |
|---|---|---|
| `planning` | _(none)_ | |
| `searching` | `{ queries: string[] }` | |
| `sources_found` | `{ count: number }` | Emitted after each search round |
| `synthesizing` | _(none)_ | |
| `gap_filling` | `{ query: string }` | Conditional; emitted ≤ once |
| `result` | `{ result: ResearchAnswer }` | Exactly once, terminal, after all guards |
| `error` | `{ code: string }` | |

Progress events are streamed to the user's own browser only and are **never written to the
audit log**.

---

## Structured Answer Shape (`ResearchAnswer`)

```ts
interface ResearchAnswer {
  directAnswer: string;               // prose conclusions; addresses each sub-question;
                                      // NO numeric dose amounts (those live in dosing[])
  evidence: {
    point: string;
    sourceUrls: string[];             // ≥1 fetched URL required (citation invariant)
  }[];
  dosing: {
    text: string;                     // descriptive, attributed — never advice
    tier: 'clinical' | 'non_clinical' | 'unclear';
    sourceUrls: string[];             // ≥1 fetched URL required
  }[];
  caveatsGaps: string[];              // what sources do not cover
  sourcesUsed: { title: string; url: string }[];
  needsMoreEvidence: boolean;         // advisory gap-fill hint; never shown or saved
}
```

**Dosing reporting policy (ADR-010):** all numeric dose/frequency detail is confined to
`dosing[]` where citation enforcement applies. `directAnswer` states conclusions only and
must never contain dose figures. Each `dosing` item is:

- **Descriptive and attributed** — "Study X used 1–2 mg SubQ daily for 28 days", not advice.
- **Tier-tagged** — `clinical` (trial/peer-reviewed/reputable database), `non_clinical`
  (community/forum/vendor protocol), or `unclear`.
- **Never 2nd-person or personalized** to the user's stated profile.

---

## Adaptive Gap-Fill

After the first synthesis+guard pass, exactly **one** follow-up search + re-synthesis round
fires when any objective condition holds:

- `directAnswer` is empty or shorter than 80 characters, **or**
- zero `evidence` items survive the citation guard, **or**
- `dosing[]` is empty **and** the question is dose-related (detected by matching a fixed
  `DOSE_INTENT_TERMS` list in `lib/research/domain/guards.ts` against the question and
  each sub-question).

`needsMoreEvidence` (a boolean the model may set) is **advisory only** — it can raise the
trigger but never suppress an objective condition. Gap-fill queries are built in code (the
planner is not re-invoked), so a gap-fill run adds exactly one extra model call. A
second-round `needsMoreEvidence` is ignored — no further retries.

---

## Safety and Guarantees

- **Citation requirement.** Every `evidence` and `dosing` item must cite ≥ 1 URL actually
  fetched during the run. Hallucinated or unchecked URLs are dropped by URL-normalized
  comparison.
- **Disallowed-phrase guard (ADR-010).** `containsDisallowedPhrase()` is applied to
  `directAnswer`, every `evidence.point`, every `dosing.text`, and every `caveatsGaps` item.
  Violations drop the item; a violating `directAnswer` is replaced with a policy-withheld
  message.
- **Prescriptive-phrase guard.** `containsPrescriptivePhrase()` (in
  `lib/research/domain/guards.ts`) rejects 2nd-person imperatives and profile
  personalization (e.g. "you should take 1 mg", "for a 56-year-old, dose at…") from the
  same four targets.
- **Dose-figure-in-directAnswer guard.** Sentences carrying dose figures in `directAnswer`
  are stripped; if all are stripped the field is replaced with the policy-withheld message.
- **SSRF boundary.** `webSearch` passes only the query string to the provider SDK. The
  server never fetches any URL that came from model output or search results. Source URLs
  are surfaced as client-side links only.
- **No prompt/answer content in audit logs.** Audit events use fixed-label error
  classification only (ADR-009). Progress events are never audited.
- **Saved notes are always labeled "Unverified — not medical advice."**
- **No paid-provider fallback.** If the local model is unavailable, the feature hides.

---

## Per-Section Saving

The user reviews the structured answer and may save any subset of the four sections
(`direct_answer`, `evidence`, `dosing`, `caveats`) as a private note attached to the
compound. Each saved note = the originating `question` + the selected sections, each with
its own citations.

**Save constraints (enforced by `saveNotesInputSchema`):**
- `sections` must have 1–4 entries; at most one entry per `type`.
- `evidence` and `dosing` sections require ≥ 1 citation.
- `direct_answer` and `caveats` sections may have 0 citations.
- `tier` must be a valid `DoseTier` for `dosing` sections and `null` for all others.
- Citation URLs must be `http(s)` only (`isHttpUrl` validated).

**Delete** operates on the whole note; sections and section-citations cascade via FK.

---

## Data Model

Four tables in the Research domain (see `docs/database-schema.md` for full field details):

| Table | Role |
|---|---|
| `CompoundResearchNote` | Per-run note, owned by `userId` + `catalogItemId`; `claim` nullable (legacy per-finding notes have `claim` set; new per-section notes have `claim` null) |
| `CompoundResearchNoteCitation` | Legacy-only note citations (note-owned; preserved for existing data) |
| `CompoundResearchNoteSection` | New per-section note row: `type`, `content`, `tier` (nullable), `order` |
| `CompoundResearchNoteSectionCitation` | Section-owned citations: `title`, `url` |

**Legacy discrimination:** a note is legacy iff it has zero sections. Legacy notes render
their `claim` text; new notes render labeled section blocks. No saved data is lost or altered
by the migration.

Audit category `Research`, actions `RESEARCH_NOTE_SAVED` and `RESEARCH_NOTE_DELETED`. Audit
events carry `catalogItemId` and `citationCount` — no prompt, question, or answer content.

---

## Caveats

- **Rate limit is best-effort.** 5 runs/hr/user; in-memory per-process Map; resets on
  redeploy. For Tavily **billing protection**, set an account-level spend cap in the Tavily
  dashboard — the in-process limiter is not a billing guard.
- **Generation is slow.** Each AI step has a ~240 s per-step timeout. Gap-fill roughly
  doubles model time and Tavily calls for that run.
- **Tavily `includeRawContent` credit cost.** Required for synthesis quality; may raise
  per-search credit consumption above a plain `basic` request.
- **Context budget.** Assumes the local model has ≥ 32 K-token context. `MAX_TOTAL_SOURCE_CHARS`
  and `MAX_SOURCES_FOR_SYNTHESIS` are tunable constants in `compoundResearch.ts`.

---

## Related Documents

- ADR-017: `docs/adrs/ADR-017-compound-research.md` — original decision record.
- Enhancement design spec: `docs/superpowers/specs/2026-06-13-compound-research-enhancement-design.md`
- Domain guards: `lib/research/domain/guards.ts`
- Orchestration: `lib/research/application/compoundResearch.ts`
