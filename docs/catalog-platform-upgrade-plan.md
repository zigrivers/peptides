# Catalog Platform Upgrade Plan

**Status:** Approved design / roadmap (pre-implementation). Hardened after a
multi-model design review (architecture, risk/safety, completeness lenses).
**Author:** Engineering
**Related:** [`compound-catalog-architecture.md`](./compound-catalog-architecture.md)

This document is a reference roadmap. It describes the target architecture and the
workstreams required to deliver three objectives. Per-phase implementation plans
(task graphs, TDD skeletons) are produced separately for each phase.

---

## 1. Objectives

1. **Guaranteed baseline catalog.** Dev **and** production databases must always
   contain a curated set of catalog items (compounds today, supplements next) with
   specific, code-defined properties. Today the seed runs in dev only — **production
   has no guaranteed catalog, and no production deploy pipeline exists yet** (see §4).
2. **Monthly research refresh.** A scheduled process updates catalog properties with
   the latest research, **with a safety tolerance gate**: low-risk changes publish
   automatically; large or ambiguous dosing changes are held for one-click human
   approval. Every change is snapshotted and reversible.
3. **Supplements + supplement tracking.** Add a supported list of supplements
   (Vitamin D, Krill Oil, HMB, Taurine, Creatine, etc.) with appropriate properties,
   so users can track supplements — timing, schedule, dose logs, reminders — **just
   like** they track peptide compounds.

---

## 2. The unifying model

All three objectives hang off **one structural change plus one new concept.**

- **Generalize the catalog** into a `CatalogItem` with a `kind` discriminator
  (`PEPTIDE | SUPPLEMENT`). One tracking pipeline serves both kinds.
- **Add content versioning** to the catalog (`sourceVersion`, `lastReviewedAt`,
  `revisionStatus`, and an immutable `CatalogItemRevision` snapshot table).

Versioning is the keystone:

| Objective | What versioning enables |
|-----------|-------------------------|
| 1 — Baseline | The code-defined dataset is version-stamped and diff-able against the live DB, so drift is detectable and reconcilable. |
| 2 — Refresh | Each refresh diffs against the current version, gates by tolerance, snapshots before writing, and supports rollback. |
| 3 — Supplements | Supplements version and refresh through exactly the same machinery as peptides. |

### 2.1 Why "unified catalog + kind" (decision record)

Three options were weighed:

- **A-refined (chosen):** unified `CatalogItem` + `kind`, with a **shared core** plus
  **separate kind-specific profile tables** (`CompoundProfile` for peptides,
  `SupplementProfile` for supplements). One tracking FK; each profile is cohesive and
  fully non-nullable *within its own model*; only the FK from `CatalogItem` is nullable.
- **"Plain A" (one nullable profile) — rejected:** a single `Profile` table holding
  both peptide and supplement columns, most of them nullable. This breaks cohesion and
  scatters unit/dosing semantics across nullable columns.
- **B (parallel `Supplement` model) — rejected:** Prisma has no native polymorphic
  relation, so `Protocol`/`Vial` would carry `compoundId? XOR supplementId?` and every
  consumer (dose logs, reminders, cycles, audit, search, detail page) would branch on
  kind — effectively building the tracker twice.

**Enforcement caveat (important).** A-refined does **not** make the kind/profile
invariant enforceable at the *type* level: nothing in Prisma prevents a `kind=PEPTIDE`
row from also having a `SupplementProfile` attached, or vice versa. The unified design
moves the invariant from columns to *relations*, but enforcement is **application-level**
(plus an optional DB `CHECK`), not type-level. See §3.1 for the enforcement mechanism.

**Consequence of A-refined:** adding a future kind (e.g. a medication) becomes "add an
enum value + a profile table," not "rewrite the tracker."

---

## 3. Target schema

DB-level table/column naming is kept stable where possible to minimize migration blast
radius. **Note:** "stable" applies to the Postgres *table and column names*, not to the
Prisma model name or generated client — see §3.7 for the real code blast radius.

### 3.1 Shared spine — `CatalogItem`

The generalized form of today's `Compound`. The Prisma model is renamed to
`CatalogItem` but **mapped to the existing `compound` table** (`@@map("compound")`).

- **Unchanged core columns:** `name`, `slug`, `synonyms`, `mechanismOfAction`,
  `administrationRoutes`, `tags`, `status`, `archivedAt`.
- **New fields:**
  - `kind` — enum `CatalogItemKind { PEPTIDE, SUPPLEMENT }`, default `PEPTIDE`,
    backfilled for existing rows.
  - `catalogKey` — **stable, immutable, code-assigned identifier** (a short slug set
    once at creation, never changed). This is the **upsert/sync key** (§4), *not*
    `name` — so an item can be renamed without creating a duplicate row. Backfilled
    from the current `slug` for existing rows; `@unique`.
  - `sourceVersion` — `Int`, default `1`. Bumped on each published change.
  - `lastReviewedAt` — `DateTime?`. Set by the refresh job and at seed time.
  - `revisionStatus` — enum `{ PUBLISHED, PENDING_REVIEW }`, default `PUBLISHED`.
- **Kind-conditional relations:**
  - `profile` — `CompoundProfile?` (present when `kind = PEPTIDE`).
  - `supplementProfile` — `SupplementProfile?` (present when `kind = SUPPLEMENT`).
  - `citations` — `Citation[]` (repointed to `CatalogItem`; see §3.3).
  - `revisions` — `CatalogItemRevision[]`.

**Kind/profile integrity enforcement** (since the DB can't express it natively):
1. An application-layer invariant in the catalog repository/service asserting
   `kind === PEPTIDE ⟺ profile present` and `kind === SUPPLEMENT ⟺ supplementProfile
   present`, covered by tests.
2. A raw-SQL `CHECK` constraint added via migration as defense-in-depth.

### 3.2 `CompoundProfile` (peptide-only, columns unchanged)

Keeps its current columns (dosing tiers, reconstitution/BAC, shelf-life, scheduling
fields, `benefitTimeline`). It becomes a kind-conditional relation. Its `citations`
relation moves up to `CatalogItem` (§3.3).

### 3.3 `SupplementProfile` (new, supplement-only)

A new table that **redeclares** the scheduling columns it needs (there is no column
reuse across tables — only **enum reuse**):

- `form` — enum `{ CAPSULE, SOFTGEL, TABLET, GUMMY, POWDER, LIQUID, ... }`.
- `servingSize` + `servingUnit` — per-serving amount (e.g. 5 `g`, 2000 `IU`).
- `dosingLow` / `dosingTypical` / `dosingHigh` — JSON `DoseAmount`, in supplement units.
- Scheduling/timing columns **redeclared** on this table, **reusing the existing
  `DosingFrequency` and `PreferredTime` enums**: `dosingFrequency`, `dosesPerDay`,
  `preferredTime`, `timingNotes`.
- `benefitTimeline` — `Json?` (optional, same shape as peptides).

### 3.4 `Citation` — repointed to `CatalogItem`

Today `Citation.profileId` FKs `CompoundProfile.id`. To let both peptide and supplement
citations flow through one path (seed sync, refresh, snapshots), **`Citation` is
repointed to reference `CatalogItem` directly** (`catalogItemId`). This is a deliberate
decision, not deferred.

**This is NOT an additive change.** It requires, in Phase 1:
- A backfill migration translating each existing `Citation.profileId` → its parent
  `compoundId` (now `catalogItemId`), then dropping `profileId`.
- Rewriting the seed's differential citation-sync (currently keyed on
  `profileId = upsertedProfile.id`) to key on the catalog item.
- Moving the `citations` include in the catalog repository from `profile.citations` up
  to the item level, and updating the row-mapping accordingly.
- Updating the `Citation` domain type (drops `profileId`, gains `catalogItemId`).

(Alternative considered: dual nullable FKs `compoundProfileId? XOR supplementProfileId?`
— additive, but leaves citations un-unified and forces every citation consumer to branch
on kind. Rejected for the same reason as option B in §2.1.)

### 3.5 `CatalogItemRevision` (new, immutable snapshot)

- `id`, `catalogItemId` (FK), `version` (`Int`), `kind`.
- `snapshot` — `Json` capturing the item + active profile + citations at that version.
- `createdAt`, `publishedAt?`, `source` (enum `{ SEED, REFRESH_AUTO, REFRESH_APPROVED, ROLLBACK }`).
- Append-only; never updated.

**Why full snapshots (not just a pending-diff):** the tolerance gate alone only needs to
store a *proposed change*. Snapshots exist specifically to support **rollback**, which is
required because the refresh job (Objective 2) writes dosing data autonomously to
production; snapshots are the cheapest implementation of a recovery path. This justifies
the table against a YAGNI objection.

### 3.6 Identity scoping

**Global, admin-curated reference data (no `userId`):** `CatalogItem`,
`CompoundProfile`, `SupplementProfile`, `Citation`, `CatalogItemRevision`. The existing
`CompoundRepo` exemption in `CLAUDE.md`/`AGENTS.md` must be **edited** (not "extended
unchanged") to (a) rename `Compound → CatalogItem`, (b) add `SupplementProfile` and
`CatalogItemRevision`, (c) explicitly cover **write** mutations performed by
`catalog:sync` and the refresh cron using `actorUserId: 'SYSTEM'`, and (d) add an
exemption entry for the new `catalog-refresh` cron's global scan (same format as the
existing cron exemptions).

**User-owned, identity-scoped (NOT reference data):** `SupplementStock` (§6.2) carries
`userId` and is subject to the normal `where: { userId }` scoping rule. It is **not** on
the global-exemption list.

### 3.7 Migration & code-rename blast radius

The schema deltas are mostly additive (new enums, new columns with defaults/backfill,
new tables), **with two non-additive exceptions: the Citation FK repoint (§3.4) and the
model rename below.**

`@@map("compound")` preserves only the **table name**. Renaming the Prisma model
`Compound → CatalogItem` still changes:
- The client accessor: `prisma.compound.*` → `prisma.catalogItem.*` (used throughout the
  catalog repository: `findFirst`/`findMany`/`findUnique`).
- Generated types: `Prisma.CompoundGetPayload`/`Prisma.CompoundWhereInput` →
  `Prisma.CatalogItem*` (used in the repo).
- **Every in-schema relation field typed `Compound`** must be hand-edited to
  `CatalogItem`: on `CompoundProfile`, `Protocol`, `Vial`, `VendorProduct`, `OrderItem`.
  The relation *field name* (`compound`) and the FK *column* (`compoundId`) can stay; only
  the *type annotation* changes.

Migration steps:
1. Add `CatalogItemKind` and `revisionStatus` enums.
2. Add `kind` (default `PEPTIDE`), `catalogKey` (`@unique`, backfilled from `slug`),
   `sourceVersion`, `lastReviewedAt`, `revisionStatus` columns to `compound`; backfill.
3. Create `SupplementProfile` and `CatalogItemRevision` tables.
4. **Citation FK repoint** (non-additive): backfill `catalogItemId`, drop `profileId`.
5. Add the kind/profile `CHECK` constraint (§3.1).
6. Rename the Prisma model `Compound → CatalogItem` with `@@map("compound")`; update the
   5 relation field type annotations and the catalog repository accessors/types.
7. Keep `Protocol.compoundId` / `Vial.compoundId` column names. **Known, accepted naming
   debt:** after this, a `SUPPLEMENT`-kind item is tracked via a column named
   `compoundId` referencing a table named `compound`. A cosmetic rename to
   `catalogItemId` is an optional follow-up PR, out of scope for Phase 1.

No user-owned rows are moved or deleted by any step.

---

## 4. Workstream — Objective 1: Guaranteed baseline catalog

**Problem:** `prisma/seed.ts` runs in dev only. The repo's only CI workflow runs
`prisma:deploy` against an **ephemeral CI Postgres**, not production. **There is no
production deploy pipeline checked into the repo** (no `deploy.yml`, no Railway/Vercel
deploy config); cron routes merely reference "Railway Cron" in comments. So production
has no guaranteed reference catalog, and there is currently nowhere to hang a post-deploy
step.

**Design:**

1. **Extract catalog into a versioned data module.** Move the inline `compounds` array
   out of `seed.ts` into `prisma/catalog/catalog.ts`, exporting a typed,
   version-stamped dataset (`CATALOG_VERSION` + the items, each with a stable
   `catalogKey`). `seed.ts` becomes a thin idempotent applier.
2. **Establish the deploy hook (new work, not "extend the existing pipeline").** This
   workstream must **create or document** the production deploy mechanism (e.g. a
   Railway release command / start hook) that runs `prisma:deploy` **then**
   `catalog:sync`. The ordering is a hard contract: migrations must apply before sync.
3. **`catalog:sync` command — hardened.** Add `pnpm catalog:sync` that applies the
   versioned dataset. Required properties:
   - **Upsert key is `catalogKey`** (stable), not `name` — so renames update in place
     instead of creating duplicate rows.
   - **Wrapped in a single `prisma.$transaction`** so a mid-run failure rolls back
     fully (no half-updated catalog).
   - **`DATABASE_URL` presence check** that throws before any write.
   - **Explicit prod confirmation:** a required env discriminator (e.g.
     `CATALOG_SYNC_CONFIRM=1`) must be set for the command to write, preventing
     accidental local/misconfigured runs against the wrong database.
   - **Orphan archival:** after upserts, any `CatalogItem` whose `catalogKey` is absent
     from the dataset is set to `status = ARCHIVED, archivedAt = now()` — **never
     deleted** (preserves Protocol/Vial FKs and history).
   - **System audit:** all mutations wrapped in `withAudit` with `actorUserId: 'SYSTEM'`.
   - **Idempotent under retry**; safe to run on every deploy.
4. **Drift guard test.** An acceptance test asserts the live catalog matches the
   versioned dataset (item count + content checksum) **and** that no `PUBLISHED` item is
   absent from the dataset, so drift fails CI.
5. **Runbook.** Document the deploy sequence, failure handling (if `catalog:sync` fails,
   the deploy is considered failed and re-run), and rollback in
   `docs/operations-runbook.md`.

**Rename policy:** a rename in the dataset keeps the same `catalogKey`; the `name` column
updates in place. Never remove-and-re-add an item to rename it.

---

## 5. Workstream — Objective 2: Monthly research refresh (tolerance-gated)

**New cron:** `POST /api/cron/catalog-refresh`, scheduled monthly (`0 2 1 * *` — 02:00
UTC on the 1st), `export const dynamic = 'force-dynamic'` per the established refresh-cron
pattern, governed by a new ADR (extend ADR-012 or add ADR-016). Auth uses the shared
`Bearer ${CRON_SECRET}` helper (see §7).

**Refresh-run tracking.** A new `CatalogRefreshRun` table (`id`, `startedAt`,
`completedAt`, `itemsProcessed`, `itemsHeld`, `itemsErrored`, `status`) records each
monthly run so ops can audit which run produced which changes without scanning audit
events.

**Pipeline (per catalog item, each wrapped in its own try/catch):**

1. **Gather.** Query PubMed using PMIDs/DOIs already on `Citation` **where present**
   (both are nullable; fallback strategy in §10). A new structured AI extraction function
   (parallel to the existing free-text `draftCompoundProfile`) returns a typed
   `ProposedProfileDelta` — updated dosing tiers and/or citations as
   `Decimal`-serializable JSON — **not** free-text markdown, so the gate can compare
   numerically.
2. **Snapshot.** Write the current item + profile + citations to `CatalogItemRevision`
   **only as part of a successful apply** (so a snapshot is never orphaned by a later
   apply failure).
3. **Diff + tolerance gate** (`Decimal`-based, `WarningPolicy`-style config). Before any
   numeric comparison, both old and new `DoseAmount`s are **normalized to a canonical
   unit**. The gate **always holds for human review** when:
   - **Units change** between versions (e.g. `mg → mcg`) — a naive amount comparison
     would miss a 1000× shift; never auto-publish a unit change.
   - A dosing tier transitions **present ↔ absent** (`null` ↔ value).
   - The item is **count-based** (`capsule`, `softgel`, etc.) and any dosing tier
     changes — no mg-equivalence exists to bound the risk.
   - An **unrecognized field/key** appears in the proposed profile JSON.

   Otherwise: citation-only additions or in-tolerance, same-unit numeric changes
   (default threshold: **>25% change to any normalized dosing tier holds**) →
   **auto-publish**: apply, bump `sourceVersion`, set `lastReviewedAt = now`, write a
   `CatalogItemRevision` (`source = REFRESH_AUTO`), emit
   `AuditEvent: CATALOG_REFRESH_PUBLISHED`.

   Held changes → store as a pending revision, set `revisionStatus = PENDING_REVIEW`,
   emit `CATALOG_REFRESH_HELD`, surface in an **admin review queue** for one-click
   **approve** (publish + version bump, `source = REFRESH_APPROVED`, emit
   `CATALOG_REFRESH_APPROVED`) or **reject** (`CATALOG_REFRESH_REJECTED`).
4. **Rollback.** Any published version can be restored from its prior
   `CatalogItemRevision` (`source = ROLLBACK`, emit `CATALOG_ROLLBACK`).

**Failure & partial-run semantics:**
- Per-item try/catch: PubMed-unreachable or AI-failure marks the item **skipped** (stays
  at its current version), recorded in the `CatalogRefreshRun` summary; the run does not
  abort wholesale.
- **PubMed rate limits** (NCBI: 3 req/s anonymous, 10 req/s with API key) are respected
  via batched fetch + backoff; an API key is required for the job.
- **Already-`PENDING_REVIEW` items** are **skipped** by the next monthly run (the pending
  human decision is never silently overwritten).

**Schema-enforcement prerequisite.** `DoseAmountSchema` currently accepts
`unit: z.string()` (any string passes). Before the gate can be trusted, the schema must
become a closed `z.enum([...all valid units])` (§6.1). This is a phase prerequisite, not
an open question.

**Config:** tolerance thresholds live in a typed, `Decimal`-only, unit-aware policy
object consistent with `safety-math.md`. The same gate applies to supplements.

**Safety note:** the gate exists specifically because unsupervised AI writing dosing
ranges to production is the highest-accuracy-risk path. It keeps the catalog current for
the common low-risk case while capping the blast radius of a bad generation; the
unit-change and null-transition holds close the most dangerous silent-error paths.

---

## 6. Workstream — Objective 3: Supplements + tracking

### 6.1 Catalog side

- Seed an initial **supported-supplement list** (e.g. Vitamin D, Krill Oil / Omega-3,
  HMB, Taurine, Creatine, Magnesium) as `CatalogItem kind=SUPPLEMENT` +
  `SupplementProfile`, **in the versioned data module** — so Objective 1 guarantees them
  in production and Objective 2 refreshes them.
- **Make `DoseUnit` a closed, categorized enum** and add supplement units. `DoseUnit` is
  currently defined in **three** places that must stay in sync (or be refactored to a
  single source): `lib/tracker/domain/types.ts`, the Zod `DoseUnitSchema` in
  `lib/tracker/domain/validation.ts`, and a duplicate in `lib/offline/domain/types.ts`.
  Categorize:
  - **Weight (Decimal-convertible to mg/mcg):** `mcg`, `mg`, `g` (`g → mg` is ×1000).
  - **Volume:** `mL`.
  - **International units:** `IU`.
  - **Count (no mg equivalence; must never pass through `convertDoseToMg`):**
    `capsule`, `softgel`, `tablet`, `gummy`, `scoop`, `drop`.

  Existing units (`mcg`, `mg`, `mL`, `IU`) need **no new conversion coverage**. Only the
  genuinely new conversions/handling (`g`, and the count units) require new code, TDD
  skeletons, and 100% branch coverage — **the coverage mandate extends to this new
  unit-math path regardless of which lib directory it lives in.**
- Also tighten the reference-domain `DoseAmountSchema` (`lib/reference/domain/validation.ts`)
  from `unit: z.string()` to the same closed enum (required by the §5 gate).

### 6.2 Tracking side (reuses the existing pipeline)

- `Protocol`, `DoseLog`, `ScheduleGenerator`, `ReminderPreference`, cycles, and
  `withAudit` work **unchanged** — a supplement protocol is simply a `Protocol` whose
  catalog item is `kind = SUPPLEMENT`.
- **Administration route:** supplement protocols use `administrationRoute: 'Oral'`.
  `getSitesForRoute('Oral')` returns `[]`, so injection-site validation is skipped
  automatically — no changes to `DoseLogService` or site rotation required.
- **Inventory path:** supplement dose logs **MUST NOT** carry a `vialId`. The
  reconstitution decrement (`decrementVialInventory` → `convertDoseToMg`, which throws
  `unsupported_unit` for count units) is only invoked when a `vialId` is present; since
  supplement protocols never have one, that path is skipped entirely and **no change to
  `convertDoseToMg` is required.**
- **New `SupplementStock`** — simple count-based inventory, **user-owned and
  identity-scoped**: fields `userId` (+ `User` relation), `catalogItemId`, optional
  `protocolId`, `unitsRemaining`, `unit`. Decremented when a `kind = SUPPLEMENT` dose is
  logged. No reconstitution/BAC/mg-per-mL math. The peptide `Vial` model is untouched.
- **Warning policy:** count-based supplements bypass the mcg-typed reconstitution
  `WarningPolicy`. A small `SupplementWarningPolicy` defines reference-range checks in
  the supplement's own units (e.g. servings above `dosingHigh`), `Decimal`-based, with
  100% branch coverage.

### 6.3 UI / read paths

- **Catalog index** gains a `kind` filter (peptides / supplements / all) — a small
  addition to the existing `q` / `tag` search params and the `listCompounds` query.
- **Detail route disambiguation.** `reference/[slug]/page.tsx` (via `getCompoundBySlug`)
  serves a single slug namespace. Slugs stay globally unique, so the query needs **no**
  `kind` filter; instead the page **branches on `catalogItem.kind`** and renders a
  `SupplementDetailPanel` (serving + stock) in place of the peptide-specific
  `DosingReconstitutionPlanner` + `CompoundInventoryManager`. A supplement slug must
  never render reconstitution math.
- **Ordering domain must exclude supplements.** The ordering/vendor read paths
  (`getCompoundsMinimal`, the order-creation compound picker, and the vendor
  `AddProductForm`) currently return all catalog items. They must filter to
  `kind = PEPTIDE` so supplements don't appear in peptide purchasing workflows.

---

## 7. Cross-cutting concerns

- **TDD & safety math.** New dosing-unit conversions, the `SupplementWarningPolicy`, and
  the tolerance-gate math get pending acceptance skeletons in `tests/acceptance/` first;
  100% branch coverage on all new math (`safety-math.md`); `Decimal` only.
- **Audit.** `AuditCategory` and `AuditAction` in `lib/audit/domain/AuditEvent.ts` are
  **closed union types** — they must be edited to add a `'Catalog'` category and the
  actions `CATALOG_REFRESH_PUBLISHED`, `CATALOG_REFRESH_HELD`, `CATALOG_REFRESH_APPROVED`,
  `CATALOG_REFRESH_REJECTED`, `CATALOG_ROLLBACK`, and a `CATALOG_SYNC` action for
  `catalog:sync`. All catalog mutations (sync, refresh, approve/reject, rollback) and all
  supplement-tracking mutations are wrapped in `withAudit`; system operations use
  `actorUserId: 'SYSTEM'`.
- **Cron DRY — as a dedicated, tested PR (not "opportunistic").** Extract the
  byte-identical `Bearer CRON_SECRET` check from the seven existing routes into
  `lib/shared/cronAuth.ts`, with unit tests (401 on missing/invalid header; pass-through
  on valid) that preserve each route's existing `{ error: 'Unauthorized' }` / 401 body.
  This is a **standalone PR scheduled before** the `catalog-refresh` route adopts the
  helper — it touches seven live, currently-untested endpoints, so it must not ride along
  in the larger refresh PR.
- **Docs to update (timing matters):**
  - `compound-catalog-architecture.md` — **must be updated within Phase 1**, before the
    Phase 1 PR merges, since it documents the exact model Phase 1 replaces; otherwise it
    is actively wrong for the whole implementation period. Later phases update it
    incrementally.
  - `CLAUDE.md` **and** `AGENTS.md` — edit the identity-scoping exemption per §3.6
    (rename, add new models, cover SYSTEM writes, add the refresh-cron entry). If the
    catalog repo file is renamed, update the exemption's file path too.
  - New ADR(s) — `catalog-refresh` cron + baseline `catalog:sync` deploy step.
  - `operations-runbook.md` — deploy sequence, new cron schedule, rollback procedure.
  - `database-schema.md` — new tables/fields, Citation FK change.

---

## 8. Phased roadmap

Each phase is its own spec → plan → PR cycle.

| Phase | Scope | Rationale |
|-------|-------|-----------|
| **1. Schema spine + versioning** | `CatalogItem`/`kind`/`catalogKey`, `SupplementProfile`, `CatalogItemRevision`, versioning fields, **Citation FK repoint (non-additive, backfilled)**, kind/profile `CHECK`, model rename + repo/relation edits, `CLAUDE.md`/`AGENTS.md` + `compound-catalog-architecture.md` updates | Unblocks everything. Mostly infrastructure, but includes the two non-additive changes (Citation repoint, model rename) — done once, up front. |
| **1a. cronAuth extraction** | `lib/shared/cronAuth.ts` + tests; migrate the 7 existing routes | Small, isolated, tested; de-risks the later refresh route. Can run in parallel with Phase 2/3. |
| **2. Baseline guarantee (Obj. 1)** | Versioned data module, hardened `catalog:sync` (txn, guards, orphan-archival, SYSTEM audit), **create/document the deploy hook**, drift test, runbook | Lowest feature risk; immediate production value (prod finally has a guaranteed catalog). Prerequisite for guaranteeing supplements in prod. |
| **3. Supplements + tracking (Obj. 3)** | Supplement seed list, categorized `DoseUnit` enum (3 files) + `DoseAmountSchema` enums, `SupplementStock` (userId-scoped), `SupplementWarningPolicy`, detail-route kind branch, ordering-picker `PEPTIDE` filter, catalog `kind` filter | User-facing feature. Depends on Phase 1 (spine) and Phase 2 specifically because `catalog:sync` + deploy hook must exist before supplement seed data can be guaranteed in production — without Phase 2, supplements would be dev-only. |
| **4. Monthly refresh + tolerance gate (Obj. 2)** | `catalog-refresh` cron (uses cronAuth from 1a), structured AI extraction (`ProposedProfileDelta`), PubMed integration + rate limiting, normalized tolerance gate, `CatalogRefreshRun`, review queue, rollback, refresh-cron exemption entry | Most complex; depends on versioning + a populated, enum-validated catalog to refresh. |

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Model rename is treated as "free" but has real code blast radius | §3.7 enumerates the required edits (client accessors, generated types, 5 relation annotations, repo); `@@map` covers only the table name. |
| Migration assumed "additive" but isn't everywhere | §3.4/§3.7 explicitly flag the Citation repoint and model rename as non-additive, with backfill steps; everything else is additive and touches no user rows. |
| AI generates inaccurate dosing data | Tolerance gate auto-holds unit changes, null↔value transitions, count-based dosing changes, and >25% deltas; every change snapshotted + reversible. |
| Unit-flip silent under/over-dose (e.g. mg→mcg) | Gate **always holds on any unit change**; `DoseAmountSchema` becomes a closed enum so unknown units can't slip in. |
| `catalog:sync` harms prod data or runs against wrong DB | `$transaction` rollback, `DATABASE_URL` guard, required `CATALOG_SYNC_CONFIRM` for writes, orphan **archival not deletion**, never touches user-owned rows, drift test verifies end-state. |
| Stale/zombie or duplicated catalog rows on rename/removal | Stable `catalogKey` as upsert key (renames update in place); removed items archived, not deleted. |
| `SupplementStock` mistakenly treated as global data | It is `userId`-scoped and explicitly excluded from the global-exemption list (§3.6). |
| cronAuth refactor silently opens 7 live endpoints | Done as a standalone, **tested** PR (1a) that preserves existing 401 behavior. |
| Supplement items leak into peptide ordering/detail UIs | Ordering pickers filter `kind=PEPTIDE`; detail route branches on `kind` (§6.3). |
| New audit actions/categories fail typecheck | §7 names `lib/audit/domain/AuditEvent.ts` closed unions as a required edit. |
| Monthly job partial failure / PubMed rate limits | Per-item skip semantics, `CatalogRefreshRun` summary, backoff + API key, pending items skipped on next run (§5). |
| Polymorphic tracking complexity | Avoided entirely by the unified-item decision (§2.1). |

---

## 10. Open questions (to resolve during per-phase planning)

- Exact normalized tolerance thresholds per dosing tier (default proposed: >25% on any
  same-unit normalized tier holds; all unit changes and null transitions always hold).
- PubMed query strategy, API-key provisioning, and fallback when a citation has no
  PMID/DOI (the `pmid`/`doi` columns are both nullable).
- Initial supported-supplement list and the authoritative source for each supplement's
  baseline properties.
- The concrete production deploy mechanism to host the `prisma:deploy → catalog:sync`
  hook (Railway release command vs. start hook vs. a new CI deploy workflow).
- Whether the cosmetic `compoundId → catalogItemId` rename is worth a follow-up PR.
- Whether to collapse the three `DoseUnit` definitions into a single shared source as
  part of Phase 3.
