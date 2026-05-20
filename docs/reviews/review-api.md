# Review: API Contracts

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 22 synthesized (P0: 4, P1: 12, P2: 6)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/api-contracts.md`, `docs/domain-models/*.md`, `docs/system-architecture.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Operation Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** 3. Tracker Module
- **Issue:** Contracts for Protocol CRUD, Protocol Lifecycle (Clone, Pause, Restart), Cycle Management, and Reminders are missing.
- **Impact:** Implementing agents cannot build the core Tracker features.
- **Recommendation:** Add Server Actions and read endpoints for protocols, cycles, and reminder settings.
- **Trace:** Domain Models: Tracker

#### Finding F-002 (P0)
- **Category:** coverage
- **Location:** Reconstitution Module
- **Issue:** No contracts specified for Reconstitution calculator or Vial inventory management.
- **Impact:** Safety-critical math and inventory tracking cannot be implemented.
- **Recommendation:** Add `calculate-reconstitution` and `vial` CRUD contracts.
- **Trace:** PRD §5.3

#### Finding F-003 (P0)
- **Category:** coverage
- **Location:** 4. Ordering Module
- **Issue:** Vendor management, Product catalog CRUD, Cart management, and Order history are missing.
- **Impact:** The sourcing workflow (Ordering Pillar) is incomplete.
- **Recommendation:** Add contracts for vendor/product management and the full order lifecycle (Draft -> Received).
- **Trace:** PRD §5.4

#### Finding F-004 (P1)
- **Category:** coverage
- **Location:** 2. Auth Module
- **Issue:** Missing standard session lifecycle (Login, Logout) and account lifecycle (Password Reset, Deletion, Export).
- **Impact:** Security and data portability requirements cannot be met.
- **Recommendation:** Add account-management and session contracts.
- **Trace:** PRD §5.6, §5.7

### Pass 2 — Correctness & Safety

#### Finding F-005 (P0)
- **Category:** correctness
- **Location:** 4.2 [POST] /actions/ordering/confirm-payment
- **Issue:** Direct jump to `PAYMENT_SENT` bypasses the PRD "Hard Gate" requirement for explicit display-and-acknowledge verification.
- **Impact:** Risk of unverified crypto payments; violates PRD §6.
- **Recommendation:** Split into `confirm-order-total` (Sent -> Confirmed) and `mark-payment-sent` (Confirmed -> PaymentSent) with acknowledgement fields.
- **Trace:** PRD §5.4.4, §6

#### Finding F-006 (P1)
- **Category:** correctness
- **Location:** 3.1 [POST] /actions/tracker/log-dose
- **Issue:** Contract uses `422 insufficient_inventory` while saying the log is allowed. This makes a non-blocking warning look like a hard failure.
- **Impact:** UI may incorrectly show failure to the user for a valid action.
- **Recommendation:** Return `200 OK` with a `warnings: [{code: 'insufficient_inventory'}]` array.
- **Trace:** PRD §5.2.2

### Pass 3 — Readiness

#### Finding F-007 (P1)
- **Category:** readiness
- **Location:** 3.2 [POST] /api/sync
- **Issue:** Sync contract only accepts `DOSE_LOGGED`. Lacks support for Skips, Edits, or Batch logs required by the architecture.
- **Impact:** PWA sync will fail to reconcile complex offline state.
- **Recommendation:** Define a versioned event envelope with typed payloads for all tracker mutations.
- **Trace:** System Architecture: Section 3.1

#### Finding F-008 (P1)
- **Category:** readiness
- **Location:** Global Standards: Idempotency
- **Issue:** Header name (`Idempotency-Key`), UUID format, and replay semantics (cached success vs 409) are not defined.
- **Impact:** Inconsistent implementation of duplicate-action protection.
- **Recommendation:** Specify `Idempotency-Key` header, UUID v4 format, and "original response" replay behavior.
- **Trace:** ADR-007

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | PENDING | Will add Protocol/Cycle/Reminder contracts. |
| F-002   | P0       | PENDING | Will add Reconstitution/Vial contracts. |
| F-003   | P0       | PENDING | Will add Vendor/Product/History contracts. |
| F-004   | P1       | PENDING | Will add Auth lifecycle and Admin contracts. |
| F-005   | P0       | PENDING | Will split payment confirmation into two steps. |
| F-006   | P1       | PENDING | Will switch 422 to 200 with warnings array. |
| F-007   | P1       | PENDING | Will define versioned sync event envelopes. |
| F-008   | P1       | PENDING | Will define idempotency standards. |
