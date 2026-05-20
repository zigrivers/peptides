# Review: Database Schema

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
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
