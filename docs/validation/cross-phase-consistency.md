# Validation: Cross-Phase Consistency

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 7th resolution-log regression repaired + 2 new findings fixed; Full Pass  
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
| F-001   | P1       | RESOLVED | Will standardize on `AuditEvent`. |
| F-002   | P2       | RESOLVED | Will define canonical uppercase enums. |
| F-003   | P1       | RESOLVED | Will standardize on `/api/sync`. |
| F-004   | P1       | RESOLVED | Will standardize on UUID v4 idempotency. |
| F-005   | P0       | RESOLVED | Will switch all math fields to `Decimal`. |
| F-006   | P1       | RESOLVED | Will align `DoseLog` fields. |
| F-007   | P1       | RESOLVED | Will add Auth lifecycle tables to Schema. |
| F-008   | P1       | RESOLVED | Will add missing Ordering entities to Domain. |

> Note: the original Resolution Log marked all 8 of F-001..F-008 as "PENDING" with "Will…" prose. In fact, all 8 were resolved across the 2026-05-20 review batch (steps 4 domain modeling, step 5 ADRs, step 7 database). This re-review verifies and updates the log — the 7th resolution-log regression caught in this batch.

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

### Verification of prior-pass findings

| F-### | Verified resolved in |
|-------|----------------------|
| F-001 (Audit terminology) | Step 4 (`docs/domain-models/audit.md`) + Step 12 (`docs/security-review.md` §6) + Step 9 (`docs/ux-spec.md` audit log view). All references use `AuditEvent` (entity) + `audit_events` (table). |
| F-002 (Enum naming) | Step 7 (`prisma/schema.prisma` + `docs/database-schema.md` §1) standardized on uppercase string enums (e.g., `"DRY"`, `"RECONSTITUTED"`, `"AUTOMATED"`). |
| F-003 (`/api/sync` standardization) | Step 8 (`docs/api-contracts.md` §3.6) + Step 6 (`docs/system-architecture.md` §3.1) consistently use `/api/sync`. |
| F-004 (UUID v4 idempotency format) | Step 8 (`docs/api-contracts.md` §1.1) explicitly specifies UUID v4 format + 24h retention; Step 7 schema uses `String @unique`. |
| F-005 (Float → Decimal) | Step 4 (domain-models annotated) + Step 7 (`prisma/schema.prisma` all safety-math fields `@db.Decimal`) + Step 10 (tdd-standards §3.1 enforces Decimal-only in tests). |
| F-006 (DoseLog shape alignment) | Step 7 (`prisma/schema.prisma` now matches domain — `isBatchLog`, `loggedByUserId`, `note` all present). |
| F-007 (Auth lifecycle tables) | Step 4 + Step 7 added `PasswordResetToken`, `AccountDeletionRequest`, `DataExportRequest`, and `EmailChangeRequest`. |
| F-008 (Missing Ordering entities) | Step 4 added `Vendor`, `VendorCatalogProduct`, `OrderLineItem` value object to `docs/domain-models/ordering.md`. |

### New findings (cross-phase scan against all updates)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 (regression) | All 8 prior findings marked PENDING in resolution log; actually resolved across batch. | Updated resolution log; added verification table above. |
| N2 | P2 | Vision §10 (after step 1 update) says "20 successful orders in v1 *guided-manual* mode" — but PRD §5.4 (after step 2 update) says "v1 = full MTProto automation (supersedes vision's guided-manual guidance)". The vision text was not aligned. | Updated vision §10 to acknowledge PRD §5.4 supersedes and clarify that the 20-order metric counts both `Automated` and `ManualFallback` send methods. |
| N3 | P3 | PRD §3.3 deferred items for AI Telegram parser + Automated PubMed Watch describe technical approach but don't reference ADR-010 (which was created in step 5 and codifies provider selection + prompt strategy). | Added explicit cross-references to ADR-010 in PRD §3.3 deferred-features table. |

### Other consistency checks (all verified consistent, no fixes needed)

- **Order state machine** (Draft → Sent → Confirmed → PaymentSent → Received | Cancelled | Stale): consistent across PRD §5.4.4, domain ordering.md, schema Order.status, api-contracts §5.3, ux-spec §2.10, stories US-ORD-07, implementation-plan task 3.4.
- **15-minute cron frequency for dose reminders**: consistent across ADR-012, architecture §6, operations §3.3 + §4.1, api-contracts §7, implementation-plan task 5.2.
- **EmailChangeRequest 48h revert window**: consistent across domain auth.md, schema, api-contracts §2.2, ux-spec §2.6, stories US-AUT-07, implementation-plan task 1.5, security review §3.3.
- **Password-change session-invalidation**: consistent across security §3.2, api §2.2, ux §2.5, stories US-AUT-06, plan task 1.4, testing §9.3.
- **`expectAuditEvent` helper**: declared in tdd-standards §3.2, referenced in implementation-plan §4 cross-cutting rules.
- **Decimal vs Float**: consistent across CLAUDE.md, .claude/rules/safety-math.md, ADR-008, domain models, schema, testing.

### Regressions detected (re-review)

None introduced.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **7th resolution-log regression repaired**
- **All 2 new findings fixed**
- **Re-trigger conditions**: any change that introduces a new domain-language term or modifies the order state machine, audit action vocabulary, or auth lifecycle behavior must re-run this check.
