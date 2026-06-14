# ADR-018: About Section & Global FDA Briefing

## Status
Accepted

## Date
2026-06-14

## Context

There was no place in the app that plainly and honestly explained what the app is (informational
only; not a prescription), and where peptides actually stand with the FDA. The Year-1 newcomer
cohort — family and friends the Power User onboards as managed users — lacks the Power User's
context. Per the project anti-vision, the app must be truthful about grey-market reality and
must not hide behind "research use only" compliance theater.

Additionally, the compound-research feature (ADR-017) already has inline disclaimer text
("Unverified — not medical advice.") but no page to link that disclaimer to for deeper context.

## Decision

### A. About route + honest static content

- New server-rendered route `/about` inside the dashboard layout
  (`app/(dashboard)/about/page.tsx`), accessible to all authenticated users.
- A `DashboardNav` item (`label: 'About', href: '/about', icon: <Info/>`) is placed
  immediately above the Settings item in both mobile and desktop nav arrays.
- The inline `DISCLAIMER` text in the compound research panel and tracker modal now
  links to `/about` for the fuller explanation.
- Static curated content is typed in `app/(dashboard)/about/_content.tsx` (three sections):
  1. **What this app is (and isn't)** — informational, not medical advice, not a prescription.
  2. **The FDA's stance on peptides** — truthful: most peptides are not FDA-approved;
     grey-market / research-chemical reality; "not FDA-approved" ≠ "unsafe" or "illegal".
  3. **How to read the labels in this app** — explains "Unverified — not medical advice",
     "Not FDA-approved", dose-figure banners, and clinical vs. community dosing tiers.

### B. Topic-level FDA briefing generator (reuses ADR-017 pipeline)

- New `lib/research/application/fdaBriefing.ts` exposes `runFdaBriefing(actorUserId)`.
- Shared pipeline building blocks (source-budget constants, `runSearches`, `selectSources`,
  `buildSourceBlock`, `classify`, `emitResearchRunAudit`, `makeKeepCited`) are extracted
  from `compoundResearch.ts` into `lib/research/application/searchPipeline.ts`. The
  extraction is behavior-neutral — compound research is unchanged.
- **Fixed topic** (constants in `fdaBriefing.ts`):
  - Subject: "FDA regulation of peptide therapeutics"
  - Question: "What is the current FDA regulatory stance on peptides, and what recent
    policy developments or notable sentiment exist?"
- **Result shape** (no dosing/tiering, simpler than `ResearchAnswer`):
  ```ts
  { summary: string; findings: { point: string; sourceUrls: string[] }[]; sourcesUsed: { title: string; url: string }[] }
  ```
- **Guards**: citation invariant (every `finding` cites ≥1 fetched source URL);
  `containsDisallowedPhrase` + `containsPrescriptivePhrase` over `summary` and each
  `finding.point`; uncited/offending findings dropped; `summary` replaced with a neutral
  placeholder when it trips the guard; orphaned `sourcesUsed` pruned.

### C. Global single-row FdaBriefing cache

- New Prisma model `FdaBriefing` — a **single global row**, no `userId`:
  ```
  id              String   @id @default("global")
  summary         String   @db.Text
  findings        Json
  sourcesUsed     Json
  updatedByUserId String
  updatedAt       DateTime @updatedAt
  ```
- `findings` and `sourcesUsed` are stored as opaque JSON, overwritten wholesale on each
  refresh — no per-finding rows, no child tables.
- Repo: `FdaBriefingRepo.getGlobal()` / `FdaBriefingRepo.upsertGlobal(tx, data)` in
  `lib/research/infrastructure/FdaBriefingRepo.ts`.
- Added via an **additive** migration (`prisma/migrations/20260614000000_add_fda_briefing/`)
  — no existing rows touched.

### D. POWER_USER-only refresh action, env-gated

- `refreshFdaBriefingAction()` in `app/actions/about/refresh-fda-briefing.ts`:
  1. Requires `session.user.role === 'POWER_USER'` (else `{ ok: false, error: 'forbidden' }`).
  2. Requires `isLocalResearchEnabled()` (else `{ ok: false, error: 'unavailable' }`).
  3. Calls `runFdaBriefing(session.user.id)`, then upserts the `FdaBriefing` row inside a
     `withAudit` transaction.
  4. Returns `{ ok: true, briefing }` or `{ ok: false, error: 'failed' }`.
- The Refresh control renders in the UI only when `role === 'POWER_USER'` and
  `isLocalResearchEnabled()` is true. Managed users never see it.
- A small `'use client'` island (`FdaBriefingSection`) handles the button, spinner, and
  optimistic update; the page shell stays a server component.
- Plain action (not NDJSON stream) is acceptable here: only the Power User triggers it;
  it is infrequent; a spinner is sufficient UX.

### E. Local-research gate renamed

The gate function is renamed from `isCompoundResearchEnabled` to `isLocalResearchEnabled`
(exported from `lib/ai/infrastructure/localModelClient.ts`) to reflect that it now guards
both compound research (ADR-017) and the FDA briefing (ADR-018). **The env var
`COMPOUND_RESEARCH_ENABLED` is retained unchanged** — renaming it would churn `.env` and
Railway config for no functional gain; it is the single switch for all local-model research.

### F. Identity-scoping exception

`FdaBriefing` is operator-curated global content with no `userId` column — the same class
as the admin reference catalog (`CompoundRepo`). A new CLAUDE.md identity-scoping exception
is added:
- **Reads** (`FdaBriefingRepo.getGlobal`) are intentionally global — all authenticated
  users see the single briefing.
- **Writes** (`FdaBriefingRepo.upsertGlobal`) are restricted to `POWER_USER` at the action
  layer and wrapped in a `withAudit` transaction recording `updatedByUserId`.
- Contains no user-authored private content.

### G. Content-free audit

Two audit tiers, no prompt/answer/query content:
- `AI_REQUEST_INITIATED` / `AI_REQUEST_FAILED` (category `Security`) — emitted per-run
  by `emitResearchRunAudit('fda_briefing', ...)` from `searchPipeline.ts`. Fixed-label
  error classification only (same as compound research, per ADR-009 + ADR-017).
- `FDA_BRIEFING_REFRESHED` (category `Research`) — emitted on successful upsert inside
  `withAudit`, metadata `{ findingCount }` only.

## Inherited invariants (unchanged from ADR-017 / ADR-010)

- **Local-only provider / no paid fallback**: the feature is hidden when the local endpoint
  is unreachable; it never routes to Anthropic, Gemini, or DeepSeek.
- **SSRF boundary**: `webSearch` passes only the query string to the provider SDK; the
  server never fetches any URL from model output or search results.
- **Citation invariant**: every `finding` must cite ≥1 URL actually fetched during the run.
- **Fixed-label audit**: research-run events carry no prompt, answer, sub-question, or
  search-query content — fixed-label error classification only (ADR-009).
- **ADR-010 content guards**: `containsDisallowedPhrase` (negation-aware) and
  `containsPrescriptivePhrase` protect all output; no dose recommendations, stack
  optimization, or approval/clearance language.

## Alternatives Considered

- **Operator-typed topic (v1).** Rejected as YAGNI — a fixed topic produces a consistent
  briefing; topic input can be added later.
- **Streaming NDJSON action (like the compound-research run).** The FDA briefing refresh is
  infrequent and Power-User-only; a plain action with a spinner is sufficient complexity.
- **Per-user briefings or briefing history.** Rejected — global read-only is the right model
  for shared operator-curated context; history adds storage + UI cost for unclear value.
- **Separate env var for the FDA briefing gate.** Rejected — `COMPOUND_RESEARCH_ENABLED` is
  the single local-research switch; splitting it would multiply config surface for no gain.

## Consequences

- **Benefits**: The newcomer cohort gets honest, contextualized information about peptide
  regulation without the Power User explaining it each time; the disclaimer links to a real
  explanation; the briefing stays current at the operator's discretion.
- **Costs**: The briefing quality depends on the local model being reachable and the web
  search returning current results; both are by-design constraints (local-only, operator
  responsibility). Adding a new identity-scoping exception requires documenting the
  rationale (done here and in CLAUDE.md).

## Traces

- ADR-010 (AI strategy — bounded uses, local-only operation, content guards inherited).
- ADR-017 (compound research pipeline — shared helpers extracted, behavior unchanged).
- ADR-009 (audit logging — content-free research-run events; `FDA_BRIEFING_REFRESHED`
  on upsert).
- ADR-016 (local-first CI — no GitHub Actions added).
- CLAUDE.md identity-scoping rule — new `FdaBriefingRepo` exception documented.
- Design spec: `docs/superpowers/specs/2026-06-14-about-section-design.md`.
