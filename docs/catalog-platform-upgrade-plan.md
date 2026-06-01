# Catalog Platform Upgrade Plan

**Status:** Approved design / roadmap (pre-implementation)
**Author:** Engineering
**Related:** [`compound-catalog-architecture.md`](./compound-catalog-architecture.md)

This document is a reference roadmap. It describes the target architecture and the
workstreams required to deliver three objectives. Per-phase implementation plans
(task graphs, TDD skeletons) are produced separately for each phase.

---

## 1. Objectives

1. **Guaranteed baseline catalog.** Dev **and** production databases must always
   contain a curated set of catalog items (compounds today, supplements next) with
   specific, code-defined properties. Today the seed runs in dev only — production
   has no guaranteed catalog.
2. **Monthly research refresh.** A scheduled process updates catalog properties with
   the latest research, **with a safety tolerance gate**: low-risk changes publish
   automatically; large dosing changes are held for one-click human approval. Every
   change is snapshotted and reversible.
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
  `SupplementProfile` for supplements). One tracking FK, cohesive profiles, additive
  migration.
- **B (parallel `Supplement` model):** rejected. Prisma has no native polymorphic
  relation, so `Protocol`/`Vial` would carry `compoundId? XOR supplementId?` and every
  consumer (dose logs, reminders, cycles, audit, search, detail page) would branch on
  kind — effectively building the tracker twice. This contradicts the "track just like
  compounds" goal.
- **Plain A (one nullable profile):** rejected. Cramming peptide + supplement fields
  into one profile as nullable columns breaks cohesion and makes safety invariants
  (which rows reconstitute?) unenforceable at the type level.

**Consequence:** adding a future kind (e.g. a medication) becomes "add an enum value +
a profile table," not "rewrite the tracker."

---

## 3. Target schema

DB-level naming is kept stable to minimize migration blast radius and preserve the
existing identity-scoping exemption for the catalog repository.

### 3.1 Shared spine — `CatalogItem`

The generalized form of today's `Compound`. The Prisma model is renamed to
`CatalogItem` but **mapped to the existing `compound` table** (`@@map("compound")`),
so no table rename and no data move.

- **Unchanged core:** `name`, `slug`, `synonyms`, `mechanismOfAction`,
  `administrationRoutes`, `tags`, `status`, `archivedAt`.
- **New fields:**
  - `kind` — enum `CatalogItemKind { PEPTIDE, SUPPLEMENT }`, default `PEPTIDE`,
    backfilled for existing rows.
  - `sourceVersion` — `Int`, default `1`. Bumped on each published change.
  - `lastReviewedAt` — `DateTime?`. Set by the refresh job and at seed time.
  - `revisionStatus` — enum `{ PUBLISHED, PENDING_REVIEW }`, default `PUBLISHED`.
- **Kind-conditional relations:**
  - `profile` — `CompoundProfile?` (present when `kind = PEPTIDE`).
  - `supplementProfile` — `SupplementProfile?` (present when `kind = SUPPLEMENT`).
  - `revisions` — `CatalogItemRevision[]`.

### 3.2 `CompoundProfile` (peptide-only, essentially unchanged)

Keeps its current shape (dosing tiers, reconstitution/BAC, shelf-life, scheduling
fields, `benefitTimeline`, citations). It simply becomes a kind-conditional relation.
No destructive change.

### 3.3 `SupplementProfile` (new, supplement-only)

Cohesive supplement metadata:

- `form` — enum `{ CAPSULE, SOFTGEL, TABLET, GUMMY, POWDER, LIQUID, ... }`.
- `servingSize` + `servingUnit` — the per-serving amount (e.g. 5 `g`, 2000 `IU`).
- `dosingLow` / `dosingTypical` / `dosingHigh` — JSON `DoseAmount`, in supplement units.
- Scheduling/timing fields reused conceptually from the profile pattern
  (`dosingFrequency`, `preferredTime`, `timingNotes`).
- `benefitTimeline` — `Json?` (optional, same shape as peptides).
- `citations` — supplements need citations too, but today `Citation.profileId` FKs to
  `CompoundProfile` specifically. Phase 1 must choose one of: (a) repoint `Citation` to
  the shared `CatalogItem` (most unified), or (b) add a parallel nullable FK
  (`compoundProfileId? XOR supplementProfileId?`). Recommendation: **(a)** — attach
  citations to `CatalogItem` so the refresh job and citation sync treat both kinds
  identically. See open questions.

### 3.4 `CatalogItemRevision` (new, immutable snapshot)

- `id`, `catalogItemId` (FK), `version` (`Int`), `kind`.
- `snapshot` — `Json` capturing the item + active profile + citations at that version.
- `createdAt`, `publishedAt?`, `source` (enum `{ SEED, REFRESH_AUTO, REFRESH_APPROVED, ROLLBACK }`).
- Append-only; never updated. Enables diffing and rollback.

### 3.5 Identity scoping

`CatalogItem`, `CompoundProfile`, `SupplementProfile`, `Citation`, and
`CatalogItemRevision` are **global, admin-curated reference data with no `userId`**.
The existing `CompoundRepo` identity-scoping exemption in `CLAUDE.md` extends to the
generalized repository unchanged. No new per-user scoping rules are introduced by the
catalog layer.

### 3.6 Migration strategy

The migration is **additive**:

1. Add `CatalogItemKind` and `revisionStatus` enums.
2. Add `kind` (default `PEPTIDE`), `sourceVersion`, `lastReviewedAt`, `revisionStatus`
   columns to `compound`; backfill existing rows.
3. Create `SupplementProfile` and `CatalogItemRevision` tables.
4. Rename the Prisma model `Compound → CatalogItem` with `@@map("compound")`.
   **Keep** `Protocol.compoundId` and `Vial.compoundId` column names; they now
   reference the generalized item. (A later cosmetic rename to `catalogItemId` is
   optional and out of scope for phase 1.)

No destructive operations; no user data touched.

---

## 4. Workstream — Objective 1: Guaranteed baseline catalog

**Problem:** `prisma/seed.ts` runs in dev only. CI runs `prisma:deploy` (migrations)
and never seeds, so production has no guaranteed reference catalog.

**Design:**

1. **Extract catalog into a versioned data module.** Move the inline `compounds` array
   out of `seed.ts` into `prisma/catalog/catalog.ts`, exporting a typed,
   version-stamped dataset (`CATALOG_VERSION` + the items). `seed.ts` becomes a thin
   idempotent applier that keeps today's behaviour: upsert-by-`name` for items, upsert
   by `compoundId` for profiles, differential sync for citations.
2. **Env-gated baseline command.** Add `pnpm catalog:sync` that applies the versioned
   dataset to whatever `DATABASE_URL` points at. It is **pure upsert** — it never
   deletes user data — so it is safe to run against production.
3. **Deploy wiring.** The deploy pipeline runs `prisma:deploy` then `catalog:sync` as a
   post-deploy step, reconciling production to the code-defined baseline on every
   deploy. Dev continues to get the baseline via `db:reset` / `db:setup`.
4. **Drift guard test.** An acceptance test asserts the live catalog matches the
   versioned dataset (item count + content checksum) so catalog drift fails CI.

**Reuses:** the existing idempotent upsert + differential-citation-sync logic. **New:**
the data-module extraction, the env-gated command, deploy wiring, and the drift test.

---

## 5. Workstream — Objective 2: Monthly research refresh (tolerance-gated)

**New cron:** `POST /api/cron/catalog-refresh`, monthly, using the established
`Authorization: Bearer ${CRON_SECRET}` pattern. The duplicated inline cron-auth check
across the seven existing cron routes is extracted into a shared
`lib/shared/cronAuth.ts` helper and reused here.

**Pipeline (per catalog item):**

1. **Gather.** Query PubMed using the PMIDs/DOIs already stored on `Citation`, and run
   the existing `lib/ai` drafting domain to produce a *proposed* revised profile.
2. **Snapshot.** Write the current item + profile + citations to `CatalogItemRevision`
   before any change.
3. **Diff + tolerance gate** (`Decimal`-based, `WarningPolicy`-style config):
   - Citation-only additions or property changes **within tolerance** →
     **auto-publish**: apply, bump `sourceVersion`, set `lastReviewedAt = now`, write
     a `CatalogItemRevision` (`source = REFRESH_AUTO`), emit
     `AuditEvent: CATALOG_REFRESH_PUBLISHED`.
   - Any dosing-tier change **beyond threshold** (default: >25% change to any of
     `dosingLow/Typical/High`) → **hold**: store as a pending revision, set
     `revisionStatus = PENDING_REVIEW`, emit `AuditEvent: CATALOG_REFRESH_HELD`,
     surface in an **admin review queue** for one-click **approve** (publish + version
     bump, `source = REFRESH_APPROVED`) or **reject** (discard).
4. **Rollback.** Any published version can be restored from its prior
   `CatalogItemRevision` (`source = ROLLBACK`), emitting an audit event.

**Config:** tolerance thresholds live in a typed policy object consistent with
`safety-math.md` (Decimal-only, unit-aware). The same gate applies to supplements.

**Safety note:** the tolerance gate exists specifically because unsupervised AI writing
dosing ranges straight to production is the highest-accuracy-risk path. The gate keeps
the catalog current for the common (low-risk) case while capping the blast radius of a
bad generation.

---

## 6. Workstream — Objective 3: Supplements + tracking

### 6.1 Catalog side

- Seed an initial **supported-supplement list** (e.g. Vitamin D, Krill Oil / Omega-3,
  HMB, Taurine, Creatine, Magnesium) as `CatalogItem kind=SUPPLEMENT` +
  `SupplementProfile`, **in the versioned data module** — so Objective 1 guarantees
  them in production and Objective 2 refreshes them.
- **Extend dose units.** Add `capsule | softgel | tablet | gummy | scoop | g | drop`
  to `DoseUnit` (`mg`, `mcg`, `IU`, `mL` already exist), plus the `DoseAmount` value
  object and Zod validators. New conversions get TDD skeletons and 100% coverage per
  `safety-math.md`.

### 6.2 Tracking side (reuses the existing pipeline)

- `Protocol`, `DoseLog`, `ScheduleGenerator`, `ReminderPreference`, cycles, and
  `withAudit` work **unchanged** — a supplement protocol is simply a `Protocol` whose
  catalog item is `kind = SUPPLEMENT`.
- **New `SupplementStock`** — simple count-based inventory: `unitsRemaining`, `unit`,
  decremented when a dose is logged. **No** reconstitution / BAC / mg-per-mL math. The
  peptide `Vial` model is untouched and remains peptide-only.

### 6.3 UI

- Catalog index gains a `kind` filter (peptides / supplements / all) — a small addition
  to the existing `q` / `tag` search params.
- The supplement detail page reuses the timeline, protocol, and dose-log components and
  swaps the reconstitution/dosing planner for a **simple serving + stock panel**
  (serving size, doses-remaining, reorder hint).

---

## 7. Cross-cutting concerns

- **TDD & safety math.** New dosing-unit conversions and the tolerance-gate math get
  pending acceptance skeletons in `tests/acceptance/` first; 100% branch coverage on
  the math (`safety-math.md`); `Decimal` only.
- **Audit.** All catalog mutations (seed-sync, refresh auto-publish, refresh approve,
  rollback) and all supplement-tracking mutations are wrapped in `withAudit`. New audit
  actions: `CATALOG_REFRESH_PUBLISHED`, `CATALOG_REFRESH_HELD`,
  `CATALOG_REFRESH_APPROVED`, `CATALOG_REFRESH_REJECTED`, `CATALOG_ROLLBACK`, and
  `SUPPLEMENT_*` parallels of the existing protocol/dose actions where needed.
- **Cron DRY.** Extract the repeated `Bearer CRON_SECRET` check into
  `lib/shared/cronAuth.ts` and adopt it in the new route (and, opportunistically, the
  existing seven).
- **Docs to update:**
  - `compound-catalog-architecture.md` — generalized model + kinds.
  - New ADRs — catalog-refresh cron; baseline-sync deploy step.
  - `operations-runbook.md` — new cron schedule + rollback procedure.
  - `database-schema.md` — new tables/fields.

---

## 8. Phased roadmap

Each phase is its own spec → plan → PR cycle.

| Phase | Scope | Rationale |
|-------|-------|-----------|
| **1. Schema spine + versioning** | `CatalogItem`/`kind`, `SupplementProfile`, `CatalogItemRevision`, versioning fields, additive migration | Unblocks everything; pure infrastructure, no behaviour change. |
| **2. Baseline guarantee (Obj. 1)** | Versioned data module, `catalog:sync`, deploy wiring, drift test | Lowest risk; immediate production value (prod finally has a guaranteed catalog). |
| **3. Supplements + tracking (Obj. 3)** | Supplement seed list, dose units, `SupplementStock`, UI kind filter + detail panel | User-facing feature; builds on the spine + baseline. |
| **4. Monthly refresh + tolerance gate (Obj. 2)** | `catalog-refresh` cron, AI/PubMed pipeline, review queue, rollback | Most complex; depends on versioning + a populated catalog to refresh. |

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Migration touches the core catalog model | Additive only; `@@map` keeps table/columns stable; existing FKs and the identity-scoping exemption stay valid. |
| AI generates inaccurate dosing data | Tolerance gate holds large dosing deltas for human approval; every change snapshotted + reversible. |
| `catalog:sync` accidentally harms prod data | Pure upsert, never deletes user-owned rows; gated behind an explicit command; drift test verifies expected end-state. |
| Polymorphic tracking complexity | Avoided entirely by the unified-item decision (§2.1). |
| Supplement units break safety-math assumptions | New units modelled in `DoseAmount` with Decimal, TDD-first, 100% coverage; count-based supplements bypass mg/mL math. |

---

## 10. Open questions (to resolve during per-phase planning)

- Exact tolerance thresholds per dosing tier and per unit (default proposed: >25% on
  any tier holds for review).
- PubMed query strategy and rate limits for the refresh job; fallback when a citation
  has no PMID/DOI.
- Initial supported-supplement list and the authoritative source for each supplement's
  baseline properties.
- Whether the cosmetic `compoundId → catalogItemId` rename is worth a follow-up PR.
- `Citation` FK strategy: repoint to `CatalogItem` (recommended) vs. dual nullable FKs
  to the two profile tables (§3.3).
