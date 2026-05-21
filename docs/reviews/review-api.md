# Review: API Contracts

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — repaired 8 PENDING items from prior pass + fixed 12 new findings; Full Pass  
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
| F-008   | P1       | RESOLVED | Idempotency standards defined in §1.1 (UUID v4 header `Idempotency-Key`, "original response" replay, 24h retention, 409 on payload conflict). |

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict.

**Prior-pass repair**: the initial review's Resolution Log marked all 8 of F-001..F-008 as `PENDING` (not RESOLVED). Some of those fixes had already been partially applied to `docs/api-contracts.md` by an intermediate update, but coverage gaps and quality gaps remained. This re-review repaired everything still PENDING and added the new coverage required by batch steps 2-7.

### Status of prior-pass findings (re-verified)

| Finding | Severity | New Status | Notes |
|---------|----------|------------|-------|
| F-001 (Tracker contracts) | P0 | **RESOLVED** | §3.1 (Protocols) + §3.2 (Cycles) + §3.3 (Dose Logging) + §3.4 (Outcome Logs) + §3.5 (Reminders) — full coverage now |
| F-002 (Reconstitution contracts) | P0 | **RESOLVED** | §4.1 Calculator + §4.2 Vial Inventory |
| F-003 (Ordering contracts) | P0 | **RESOLVED** | §5.1 Vendors + §5.2 Catalog Products + §5.3 Order Lifecycle + §5.4 Helpers |
| F-004 (Auth lifecycle) | P1 | **RESOLVED** | §2.1 Session + §2.2 Password & Email + §2.3 Account Deletion & Export + §2.4 Admin |
| F-005 (Payment safety gate split) | P0 | **RESOLVED** | `confirm-quote` (Sent → Confirmed) + `mark-paid` (Confirmed → PaymentSent with `acknowledged: true` requirement) |
| F-006 (200 + warnings, not 422) | P1 | **RESOLVED** | §3.3 `log-dose` returns `200` with structured `warnings[]` array |
| F-007 (versioned sync events) | P1 | **RESOLVED** | §3.6 has `schemaVersion: 1` field + 5 event types + rejection codes |
| F-008 (Idempotency standards) | P1 | **RESOLVED** | §1.1 fully specifies header, format, replay, retention, conflict behavior |

### New findings (re-review against steps 2-7)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 | Missing Protocol lifecycle endpoints (Pause / Resume / Clone / Deactivate) per US-TRK-02. | Added §3.1: `pause-protocol`, `resume-protocol`, `deactivate-protocol`, `clone-protocol`. |
| N2 | P1 | Missing Cycle CRUD + Restart endpoints (US-TRK-08). | Added §3.2: `create-cycle`, `update-cycle`, `restart-cycle` (returns cloned protocol IDs). |
| N3 | P1 | Missing Reminder configuration endpoints (US-TRK-09). | Added §3.5: reminder preference read/update + push subscribe/unsubscribe + push-permission-state record. |
| N4 | P1 | Missing OutcomeLog endpoints (US-TRK-06). | Added §3.4: list, log, update; one-per-day uniqueness surfaced via `outcome_already_logged_for_date`. |
| N5 | P1 | Missing Vendor + VendorCatalogProduct CRUD (US-ORD-06). | Added §5.1 (Vendors) + §5.2 (Catalog Products) including archive-product (soft delete). |
| N6 | P1 | Missing Cancel Order endpoint (US-ORD-07 AC 3). | Added §5.3 `cancel-order` with reason field; records cancelledByUserId. |
| N7 | P1 | Missing cancel-during-48h-window account-deletion endpoint (US-AUT-02 AC 2). | Added §2.3 `cancel-deletion`. |
| N8 | P1 | Missing Change Password + Change Email endpoints (US-AUT-06, US-AUT-07). | Added §2.2: `change-password` (with `otherSessionsRevoked` count), `change-email-request`, `change-email-verify`, `change-email-revert`. All error codes designed to avoid field-leak. |
| N9 | P1 | Missing Delete Managed User endpoint (US-ADM-04). | Added §2.4 `delete-managed-user` with mandatory export-to-admin-first. |
| N10 | P1 | Missing Resend Invite endpoint (US-ADM-01 AC 4). | Added §2.4 `resend-invite` (revokes prior + fresh 72h). |
| N11 | P2 | Error catalog missing 15+ codes for the new flows. | Rewrote §8 with 26 documented error codes covering all new endpoints. |
| N12 | P2 | Sync Event Definition incomplete (only `LOG_DOSE`, etc.). | Added `LOG_OUTCOME` + `UPDATE_OUTCOME` types; documented rejection codes. |

### Also added (consistency and completeness)

- **§1.1**: explicit auth pre-check rule (`401 unauthorized` for unauthenticated server-action calls).
- **§1.2**: warnings array now standardized across all endpoints; includes `severity` field.
- **§4.1**: reconstitution calculator returns numeric outputs as strings to preserve `Decimal` precision client-side.
- **§5.3**: `send-order` returns `sendMethod` field (`AUTOMATED` | `MANUAL_FALLBACK`) matching the step-4/7 domain/schema additions.
- **§5.3**: 60-second duplicate-send protection with `possible_duplicate_send` + `force: true` retry.
- **§5.3**: `mark-received` returns `vialIds` array of newly-created vials (consumers can chain into reconstitution UI).
- **§6**: Reference module endpoints documented (compound list + detail with "Profile in progress" 200 case).
- **§7**: Cron endpoints documented as internal (Bearer `CRON_SECRET`) — 6 jobs aligned with ADR-012.
- **§9**: Application-level rate limits table (anonymous, authenticated, per-endpoint critical limits).
- **§10**: Versioning policy (sync event `schemaVersion` bump rule + API route policy).
- **§11**: Cross-references to domain models / architecture / ADRs / PRD.

### Regressions detected (re-review)

None introduced. The doc is substantially larger but every addition traces to a documented requirement.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL Conditional Pass)
- **All 8 prior-pass items repaired** (resolution log was the regression — actual fixes were partial)
- **All 12 new findings fixed**
- **Re-trigger conditions**: any new domain entity needing CRUD, any new flow in `docs/system-architecture.md`, any change to safety-gate semantics on the ordering or auth flows.
