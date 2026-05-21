# Review: Database Schema

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 1 P0 compile-blocker repaired, 1 P0 doc-drift repaired, 8 new findings fixed; Full Pass  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 24 synthesized (P0: 1, P1: 17, P2: 6)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/database-schema.md`, `docs/domain-models/*.md`, `docs/system-architecture.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Entity Coverage

#### Finding F-001 (P0)
- **Category:** correctness
- **Location:** User.outcomeLogs
- **Issue:** `OutcomeLog` model is referenced on `User` but not defined in the Prisma schema.
- **Impact:** Schema will fail to compile; subjective outcome logging cannot be implemented.
- **Recommendation:** Add the `OutcomeLog` model.
- **Trace:** Domain Models: Tracker

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** Auth Domain
- **Issue:** Missing tables for account lifecycle: `PasswordResetToken`, `AccountDeletionRequest`, and `DataExportRequest`.
- **Impact:** Security and data portability features (PRD §5.6, §5.7) cannot be implemented.
- **Recommendation:** Add these tables with appropriate status and expiry fields.
- **Trace:** PRD §5.6, §5.7

#### Finding F-003 (P1)
- **Category:** consistency
- **Location:** Auth.js integration
- **Issue:** Schema lacks standard Auth.js v5 adapter models (`Account`, `Session`, `VerificationToken`).
- **Impact:** `Auth.js` Prisma adapter will fail; session persistence will not work as described in ADR-004.
- **Recommendation:** Add standard adapter models and align `User` fields.
- **Trace:** ADR-004

#### Finding F-004 (P1)
- **Category:** coverage
- **Location:** Reminders / PWA
- **Issue:** Missing `PushSubscription` and `ReminderPreference` tables.
- **Impact:** Dose reminders (PRD §5.2.7) cannot be configured or delivered.
- **Recommendation:** Add tables for push subscriptions and reminder settings.
- **Trace:** PRD §5.2.7

### Pass 2 — Referential Integrity

#### Finding F-005 (P1)
- **Category:** correctness
- **Location:** User.managedBy
- **Issue:** `managedBy` is a plain string, not a self-referential foreign key.
- **Impact:** Risk of orphaned managed users; database cannot enforce Power User deletion blocks.
- **Recommendation:** Model as self-relation `User.managedBy -> User.id`.
- **Trace:** Domain Models: Auth

#### Finding F-006 (P1)
- **Category:** consistency
- **Location:** Vial -> Order
- **Issue:** `Vial` lacks linkage to `Order` or `OrderItem`.
- **Impact:** Cannot track inventory provenance or satisfy PRD requirement for order-to-inventory updates.
- **Recommendation:** Add `orderItemId` FK to `Vial`.
- **Trace:** System Architecture: Data Flows

### Pass 3 — Data Integrity

#### Finding F-007 (P1)
- **Category:** correctness
- **Location:** DoseLog.idempotencyKey
- **Issue:** Unique constraint on `idempotencyKey` alone is insufficient if clients generate keys inconsistently.
- **Impact:** Potential for duplicate dose logs if sync logic is flawed.
- **Recommendation:** Add a composite unique index on `(userId, protocolId, scheduledDate)`.
- **Trace:** System Architecture: Failure Modes

#### Finding F-008 (P1)
- **Category:** correctness
- **Location:** Floating Point Usage
- **Issue:** `Float` used for dose amounts and inventory (`totalMg`, `remainingMg`).
- **Impact:** Cumulative rounding errors in safety-critical dose calculations.
- **Recommendation:** Use `Decimal` (Precision: 10, Scale: 3) for all mg and mL values.
- **Trace:** PRD §7.4

### Pass 4 — Indexing & Performance

#### Finding F-009 (P1)
- **Category:** readiness
- **Location:** Prisma DSL
- **Issue:** Many documented indexes in the markdown table are missing from the actual Prisma DSL code.
- **Impact:** Primary query patterns (Dose schedule, active protocols) will perform poorly.
- **Recommendation:** Add `@@index` declarations directly to the Prisma models.
- **Trace:** System Architecture: Section 5

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | RESOLVED | Added `OutcomeLog` model. |
| F-002   | P1       | RESOLVED | Added lifecycle tables to Auth domain (Reset, Deletion, Export). |
| F-003   | P1       | RESOLVED | Added standard Auth.js adapter models (Account, Session, VerificationToken). |
| F-004   | P1       | RESOLVED | Added `PushSubscription` and `ReminderPreference` tables. |
| F-005   | P1       | RESOLVED | Fixed self-referential FK for managed users with `ManagedUsers` relation. |
| F-006   | P1       | RESOLVED | Added `orderItemId` to `Vial` for order provenance. |
| F-007   | P1       | RESOLVED | Added composite unique constraint `[userId, protocolId, scheduledDate]` to `DoseLog`. |
| F-008   | P1       | RESOLVED | Switched all mg, mL, and price fields to `Decimal`. |
| F-009   | P1       | RESOLVED | Added all application-level indexes directly to Prisma models. |

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict. Re-review accounts for new requirements from batch steps 2-6 (PRD, stories, domain models, ADRs, architecture).

### Critical findings repaired

**Doc drift (P0)**: `docs/database-schema.md` documented the PRE-fix schema (Float, plain `managedBy` string, no `OutcomeLog`, no Auth.js adapter models) even though `prisma/schema.prisma` had been brought to spec by the prior review's F-001..F-009 resolutions. Reviewers and implementers were seeing two contradicting schemas — the doc was misleading. Doc fully rewritten to mirror the actual schema with explicit "Source of truth" header pointing at `prisma/schema.prisma`.

**Prisma compile blocker (P0)**: `prisma/schema.prisma:69` had `expires_at  Integer?` — not a valid Prisma scalar type. The schema would fail `prisma generate` immediately. Fixed to `Int?`.

### New findings + fixes

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | **P0** | `prisma/schema.prisma:69` `expires_at Integer?` — invalid Prisma type; schema does not compile. | Changed to `Int?`. |
| N2 | **P0** | `docs/database-schema.md` documented the pre-F001-fix schema; reviewers see two contradicting schemas. | Fully rewrote the doc to mirror the current `prisma/schema.prisma`, with "Source of truth" header and abridged DSL excerpts (full file is canonical). |
| N3 | P1 | Missing `EmailChangeRequest` model (step-4 domain addition for US-AUT-07). | Added `EmailChangeRequest` model with 24h verify expiry + 48h revertibleUntil; added `User.emailChangeRequests` back-reference. |
| N4 | P1 | `Session` model missing extension cols `lastSeenAt`, `revokedAt`, `ipAddress`, `userAgent` per ADR-004 step-5 update. | Added all four extension columns + `@@index([userId, revokedAt])` for active-session enumeration on password change. |
| N5 | P1 | `OrderItem` was degenerate (only `quantity`); missing `compoundId`, `form`, `vialSizeMg`, `unitPrice`, `currency` per step-4 domain `OrderLineItem` + PRD §5.4.3. | Rewrote `OrderItem` with all required fields. `productId` made nullable (catalog product may be archived); added direct `compoundId` FK so line items survive product archive. Added `@@unique([orderId, compoundId, form, vialSizeMg])` enforcing the PRD-required duplicate-merge invariant. Added `Compound.orderItems` back-reference. |
| N6 | P1 | `Order` missing `sendMethod`, `staleFlaggedAt`, `cancelledAt`, `cancelledByUserId`, `receivedAt` per step-4 PRD/domain. | Added all five fields. `sendMethod` is `AUTOMATED \| MANUAL_FALLBACK` (set at transition into SENT, immutable afterward — invariant enforced at the application layer). |
| N7 | P1 | `Vendor` missing `userId`, `messageTemplate`, `preferredCurrency`, `createdAt` per step-4 domain. | Added all four fields. Added `User.vendors` back-reference and `@@unique([userId, telegramUsername])` enforcing "one vendor per Telegram handle per user". |
| N8 | P1 | `OutcomeLog` mismatched domain: field name `date` vs domain's `scheduledDate`; missing `loggedAt`, `overallRating`, the unique-per-day constraint, `ProtocolRating` collection. | Renamed `date` → `scheduledDate` (`@db.Date`). Added `loggedAt` (timestamp) separate from `scheduledDate`. Renamed `rating` → `overallRating`. Added `@@unique([userId, scheduledDate])`. Added new `ProtocolRating` model with FK back to OutcomeLog. |
| N9 | P2 | `ReminderPreference` thin: missing `pushPermissionState`, `emailFallbackEnabled`, `updatedAt` per step-4 domain (ADR-007 step-5 required permission-state tracking). | Added all three fields. `pushPermissionState` default is `NOT_PROMPTED`. |
| N10 | P2 | §2 Normalization silent on AuditEvent.actorUserId historical-reference policy (ADR-009 step-5). | Added explicit comment to `AuditEvent` in `schema.prisma` and §2.3 Referential Integrity Exceptions section in the doc. Also added `@@index([category, timestamp])` for category-scoped audit pages. |

### Regressions detected (re-review)

None introduced by these fixes. The schema now compiles AND the doc matches the implementation.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **2 P0 issues repaired** (compile blocker + doc drift)
- **All P1/P2 from re-review fixed**
- **Re-trigger conditions**: any new domain entity (must land in both `schema.prisma` AND `docs/database-schema.md`), any change to safety-math fields requires re-checking `@db.Decimal(...)` precision.
