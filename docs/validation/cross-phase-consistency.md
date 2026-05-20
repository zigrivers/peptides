# Validation: Cross-Phase Consistency

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 19 synthesized (P0: 1, P1: 10, P2: 7, P3: 1)
- **Passes run:** 5 of 5
- **Artifacts checked:** All documentation in `docs/`

---

## Findings by Pass

### Pass 1 — Naming Consistency

#### Finding F-001 (P1)
- **Category:** naming
- **Location:** All Docs
- **Issue:** Audit terminology is inconsistent. Documents alternate between `AuditLog`, `AuditEvent`, and `audit_events`.
- **Impact:** Ambiguity in the ubiquitous language for the system's most critical non-functional requirement.
- **Recommendation:** Standardize on `AuditEvent` as the domain/entity name and `audit_events` for the table.
- **Trace:** Domain Models: Audit

#### Finding F-002 (P2)
- **Category:** naming
- **Location:** Multiple
- **Issue:** Enum naming drifts between PascalCase (`PaymentSent`), Uppercase (`ACTIVE`), and lowercase PRD text.
- **Impact:** Potential implementation errors in database constraints or API validation.
- **Recommendation:** Define canonical uppercase enums for all status fields.
- **Trace:** Database Schema

### Pass 2 — Assumptions

#### Finding F-003 (P1)
- **Category:** assumptions
- **Location:** docs/tech-stack.md vs docs/api-contracts.md
- **Issue:** Sync endpoint conflict. Tech stack assumes `/api/dose-logs`, while API contracts and Architecture use `/api/sync`.
- **Impact:** Broken PWA sync integration.
- **Recommendation:** Standardize on `/api/sync` across all documents.
- **Trace:** System Architecture §3.1

#### Finding F-004 (P1)
- **Category:** assumptions
- **Location:** docs/api-contracts.md vs docs/database-schema.md
- **Issue:** Idempotency key format conflict. API requires UUID v4, but Schema/Domain descriptions suggest business keys (`user:protocol:date`).
- **Impact:** Duplicate detection will fail if the format is not strictly enforced.
- **Recommendation:** Standardize on UUID v4 for the physical `idempotencyKey` field.
- **Trace:** API Contracts §1.1

### Pass 3 — Data Shape Consistency

#### Finding F-005 (P0)
- **Category:** datashape
- **Location:** docs/database-schema.md
- **Issue:** Schema uses `Float` for `Vial.totalMg` and `Vial.remainingMg`. Implementation rules strictly prohibit `Float` for doses/volumes due to precision risks.
- **Impact:** Cumulative rounding errors in safety-critical dose calculations.
- **Recommendation:** Change all math-sensitive fields to `Decimal`.
- **Trace:** CLAUDE.md, TDD Standards

#### Finding F-006 (P1)
- **Category:** datashape
- **Location:** docs/domain-models/tracker.md vs docs/database-schema.md
- **Issue:** `DoseLog` shape inconsistency. Domain includes `isBatchLog` and `loggedByUserId`, but Schema omits them.
- **Impact:** Inability to audit batch operations or managed-user logging correctly.
- **Recommendation:** Align `DoseLog` schema with the domain model.
- **Trace:** Domain Models: Tracker

#### Finding F-007 (P1)
- **Category:** datashape
- **Location:** docs/domain-models/auth.md vs docs/database-schema.md
- **Issue:** Missing Auth lifecycle tables in Schema: `PasswordResetToken`, `AccountDeletionRequest`, and `DataExportRequest`.
- **Impact:** Security and portability features cannot be implemented.
- **Recommendation:** Add these models to the Prisma schema.
- **Trace:** Domain Models: Auth

#### Finding F-008 (P1)
- **Category:** datashape
- **Location:** docs/domain-models/ordering.md
- **Issue:** Missing entities: `Vendor`, `VendorProduct`, and `OrderItem` are used in API/Schema but not defined in the domain model.
- **Impact:** Business logic for the Ordering pillar is under-specified.
- **Recommendation:** Add these entities to `ordering.md`.
- **Trace:** Database Schema

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | PENDING | Will standardize on `AuditEvent`. |
| F-002   | P2       | PENDING | Will define canonical uppercase enums. |
| F-003   | P1       | PENDING | Will standardize on `/api/sync`. |
| F-004   | P1       | PENDING | Will standardize on UUID v4 idempotency. |
| F-005   | P0       | PENDING | Will switch all math fields to `Decimal`. |
| F-006   | P1       | PENDING | Will align `DoseLog` fields. |
| F-007   | P1       | PENDING | Will add Auth lifecycle tables to Schema. |
| F-008   | P1       | PENDING | Will add missing Ordering entities to Domain. |
