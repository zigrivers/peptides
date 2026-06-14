# About Section & Global FDA Briefing — Design Spec

**Date:** 2026-06-14
**Status:** Approved (brainstorming) — pending implementation plan
**New ADR:** ADR-018 (references ADR-010 AI policy, ADR-017 research pipeline).

## Problem / Goal

There is no place in the app that explains, plainly and honestly, **what the app is** (informational, not a prescription) and **where peptides actually stand with the FDA**. The audience that most needs this is the Year-1 newcomer cohort (family/friends), who lack the Power User's context. Per the project anti-vision, this must be **truthful about grey-market reality — not "research use only" compliance theater.**

Build an **About section** that:
1. hosts hand-authored, honest static content (what the app is/isn't; the FDA's stance on peptides; how to read the app's regulatory labels), and
2. shows a **living "FDA & peptides: latest" briefing** that the Power User refreshes (via the local research model) and that is cached **globally** and shown read-only to everyone — so the dynamic value reaches the newcomer audience even though they can't run the model themselves.

## Decisions (resolved during brainstorming)

| Decision | Choice |
|----------|--------|
| Scope | Static curated page **+** a live (operator-refreshed) FDA briefing |
| Feed model | **Operator-refreshed, globally cached**, read-only for everyone else |
| Nav placement | A top-level **nav item** (`/about`), above Settings |
| Briefing topic | **Fixed** default topic (consistent briefing), not operator-typed |
| Identity scoping | **Accept a new exception** — the briefing is operator-curated global content (precedent: `CompoundRepo`) |

## Non-goals (YAGNI)
- No per-user briefings, no briefing history (latest-only; refresh overwrites).
- No operator-typed topic in v1 (fixed topic).
- No new AI provider work — reuses the ADR-017 pipeline (local-only, env-gated).
- No dosing/tiering in the briefing (irrelevant to policy content).
- No public/marketing page — this is in-app, for authenticated users.

## Architecture

### A. Routing & navigation
- New route: `app/(dashboard)/about/page.tsx` at `/about` (server component; authenticated, inside the dashboard layout).
- Add a `DashboardNav` item `{ label: 'About', href: '/about', icon: <Info/> }` (lucide `Info`), placed immediately above the **Settings** item (both mobile + desktop nav arrays).
- Update the inline `DISCLAIMER` text surfaces (research panel + compound modal) to link to `/about` (the disclaimer becomes a link to the fuller explanation).

### B. Static curated content
- Authored as a typed content module: `app/(dashboard)/about/_content.tsx` (or `.ts` exporting structured section data rendered by the page). No DB. Easy to edit; one clear responsibility (copy + structure).
- Sections (honest, plain-spoken; no compliance theater):
  1. **What this app is (and isn't)** — informational; not medical advice; not a prescription; you decide, informed.
  2. **The FDA's stance on peptides** — truthful: most peptides are not FDA-approved; the grey-market / research-chemical reality and what it practically means for the user.
  3. **How to read the labels in this app** — explains the "not FDA-approved" / "research purposes only" / "Unverified — not medical advice" markers the research feature shows.
- Final copy is hand-authored during implementation and Power-User-reviewed; the spec fixes the section set + tone, not the exact prose.

### C. Dynamic FDA briefing

**Generation (topic-level research, reuses ADR-017 pipeline).**
- New `lib/research/application/fdaBriefing.ts` exposing `runFdaBriefing(actorUserId, onProgress?)` that runs a **topic-level** research pass: plan queries → server-side web search → synthesize → guard. It reuses the existing pipeline building blocks (the planner, `webSearch`, source budgeting, the structured-output helper, and the guard helpers `containsDisallowedPhrase` (negation-aware) + `containsPrescriptivePhrase` + the citation invariant). The plan will refactor the shared steps out of `compoundResearch.ts` into reusable helpers rather than duplicating them.
- **Fixed topic** (constants in `fdaBriefing.ts`): subject = "FDA regulation of peptide therapeutics"; question = "What is the current FDA regulatory stance on peptides, and what recent policy developments or notable sentiment exist?"
- **Result shape** (no dosing/tiering): `{ summary: string; findings: { point: string; sourceUrls: string[] }[]; sourcesUsed: { title: string; url: string }[] }`. Guards: every `finding` cites ≥1 fetched source (citation invariant); `summary` + each `finding.point` pass `containsDisallowedPhrase` + `containsPrescriptivePhrase` (negated "not FDA-approved" flows through naturally now); uncited/offending findings dropped; `summary` withheld→neutral placeholder if it trips the guard.

**Persistence (global, single-row cache).**
- New Prisma model `FdaBriefing` — a **single global row** (no `userId`): `id` (fixed sentinel, e.g. `@default("global") @id` or a `key String @unique` with value `"global"`), `summary @db.Text`, `findings Json`, `sourcesUsed Json`, `updatedAt`, `updatedByUserId`. `findings`/`sourcesUsed` are stored as **JSON** (an opaque cache overwritten wholesale on each refresh — no per-finding queries needed, so no child tables).
- Refresh **upserts** the single row.

**Refresh action (operator-only, env-gated).**
- `refreshFdaBriefingAction()` server action: requires `session.user.role === 'POWER_USER'` (else `forbidden`, mirroring `app/actions/admin/invite-user.ts`) **and** `isCompoundResearchEnabled()` (local model reachable + flag; else `unavailable`). On success it runs `runFdaBriefing`, then upserts the `FdaBriefing` row inside a `withAudit` transaction.
- Audit: content-free. Reuse the research run's `AI_REQUEST_INITIATED`/`AI_REQUEST_FAILED` (category `Security`) for the model call, plus a new audit action `FDA_BRIEFING_REFRESHED` (category `Research`) on the upsert, metadata `{ findingCount }` only — no prompt/answer/query content.
- May be a streaming route (like the research run) or a plain action; since only the Power User triggers it and it's infrequent, a **plain async action with a spinner** is acceptable (simpler than the NDJSON stream). The action returns the new briefing (or an error code).

**Read + display.**
- `getFdaBriefingAction()` (or a direct server-component read): returns the single global `FdaBriefing` row (or null) to **any authenticated user** — global content, no `userId` filter.
- The `/about` page (server component) reads the briefing and renders: static sections always; the briefing block with "updated {relative time}" when a row exists; an empty state ("No briefing yet") when absent.
- The **Refresh** control renders only when `session.user.role === 'POWER_USER'` **and** `isCompoundResearchEnabled()` is true; managed users never see it. (A small `'use client'` island handles the refresh button + spinner + re-fetch; the page shell stays a server component.)

### D. Identity scoping (NEW exception — accepted)
`FdaBriefing` is **operator-curated global content** with no `userId` column — the same class as the admin reference catalog (`CompoundRepo`). Add a CLAUDE.md identity-scoping exception:
- **Reads** are intentionally global (all authenticated users see the one briefing).
- **Writes** are restricted to `POWER_USER` at the action layer and wrapped in a `withAudit` transaction (`actorUserId` recorded as `updatedByUserId`).
- Rationale mirrors the existing `CompoundRepo` exception: global, admin/operator-curated, contains no user-authored private content.

### E. ADR-018
New ADR documenting: the About route + honest static content; the topic-level research path reusing the ADR-017 pipeline; the global single-row briefing cache; POWER_USER-only refresh gated on local-model reachability; the new identity-scoping exception; content-free audit. Local-only/no-paid-fallback/SSRF/citation invariants unchanged (inherited from ADR-017).

## Components / boundaries

| Unit | Responsibility |
|------|----------------|
| `app/(dashboard)/about/page.tsx` | Server page: render static sections + briefing (read) + empty state |
| `app/(dashboard)/about/_content.tsx` | Typed static content (sections + honest copy) |
| `app/(dashboard)/about/_components/FdaBriefing.tsx` | Client island: render briefing + (Power-User+reachable) Refresh button/spinner |
| `app/(dashboard)/_components/DashboardNav.tsx` | Add the About nav item (above Settings) |
| `lib/research/application/fdaBriefing.ts` | `runFdaBriefing` (topic-level research; reuses shared pipeline helpers) |
| `lib/research/application/compoundResearch.ts` | Refactor: extract shared steps (plan/search/budget/guard) for reuse — no behavior change |
| `lib/research/infrastructure/FdaBriefingRepo.ts` | `getGlobal()` / `upsertGlobal(...)` for the single row |
| `app/actions/about/refresh-fda-briefing.ts` | POWER_USER + env gate → run + upsert (withAudit) |
| `app/actions/about/get-fda-briefing.ts` | Global read (any authenticated user) |
| `prisma/schema.prisma` + migration | `FdaBriefing` model (additive) |
| `lib/audit/domain/AuditEvent.ts` | Add `FDA_BRIEFING_REFRESHED` action |
| `docs/adrs/ADR-018-*.md`, `docs/adrs/index.md`, `CLAUDE.md` | ADR + scoping exception |

## Testing
- `runFdaBriefing` (mocked model + web search): produces `{summary, findings, sourcesUsed}`; uncited findings dropped (citation invariant); disallowed/prescriptive findings dropped; summary withheld→placeholder when it trips the guard; audit content-free.
- `refreshFdaBriefingAction`: POWER_USER + reachable → runs + upserts; MANAGED_USER → `forbidden` (no model call, no write); model unreachable → `unavailable`.
- `getFdaBriefingAction`: returns the global row for any authenticated user; null when none.
- `FdaBriefingRepo`: `upsertGlobal` overwrites the single row; `getGlobal` returns it.
- Nav: About item present (and links to `/about`).
- Page: static sections always render; briefing block renders when present; empty state when absent; Refresh control hidden for managed users / when unreachable.
- Migration is additive (new table only); no data-loss risk; full `pnpm check` green.

## Sequencing note (for the plan)
The **static page + nav + content** is independently shippable and low-risk; build it first. The **briefing** (pipeline refactor + topic path + global cache + role-gated refresh + ADR/exception) is the heavier half and builds on top. One spec, sequenced tasks.

## Open items for the plan
- Exact shared-helper extraction from `compoundResearch.ts` (planner/search/budget/guard) so `fdaBriefing.ts` reuses them without duplication and without changing compound-research behavior.
- Single-row enforcement mechanism for `FdaBriefing` (fixed sentinel id vs unique `key`), and whether refresh is a plain action (recommended) or an NDJSON stream.
- Relative-time rendering for "updated N ago" (reuse any existing date util).
