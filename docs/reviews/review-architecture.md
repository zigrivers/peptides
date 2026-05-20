# Review: System Architecture

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 18 synthesized (P0: 1, P1: 10, P2: 6, P3: 1)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/system-architecture.md`, `docs/domain-models/*.md`, `docs/adrs/*.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Coverage

#### Finding F-001 (P1)
- **Category:** coverage
- **Location:** Section 4: Module Structure
- **Issue:** Missing domain/application homes in `lib/` for Reference and Job logic.
- **Impact:** Implementing agents will lack a designated home for compound/profile services and background job implementations.
- **Recommendation:** Add `lib/reference/` and `lib/jobs/` to the module structure.
- **Trace:** Domain Models: Reference, ADR-012
- **Consensus:** High (Codex, Gemini)

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** Section 2.1: Component Overview
- **Issue:** Reminders component (Push/Email) is missing from the overview, despite being a "Must Have".
- **Impact:** Implementation of critical retention features may be fragmented or missed.
- **Recommendation:** Add 'Reminders' component to the table.
- **Trace:** PRD §5.2.7
- **Consensus:** High (Gemini, Codex)

### Pass 2 — Consistency

#### Finding F-003 (P1)
- **Category:** consistency
- **Location:** Section 4: Module Structure vs ADR-015
- **Issue:** Architecture places ordering under `app/(dashboard)/ordering`, but ADR-015 requires isolation under `/ordering` with specific action paths and guards.
- **Impact:** Violation of the PRD requirement for an isolatable ordering module.
- **Recommendation:** Move ordering to `app/ordering/` (root-level) and update action paths to `app/actions/ordering/`.
- **Trace:** ADR-015, PRD §7.5
- **Consensus:** High (Codex)

#### Finding F-004 (P1)
- **Category:** consistency
- **Location:** Section 7: Deployment Topology
- **Issue:** Missing critical infrastructure providers: Resend (ADR-011) and Sentry (ADR-013).
- **Impact:** Incomplete picture of the production runtime.
- **Recommendation:** Add Resend and Sentry to Section 7 and Section 2.1.
- **Trace:** ADR-011, ADR-013
- **Consensus:** High (Gemini)

### Pass 3 — Correctness

#### Finding F-005 (P0)
- **Category:** correctness
- **Location:** Section 3.2: Flow: Place Telegram Order
- **Issue:** Data flow stops at "Sent" and omits the PRD "Hard Gate" payment flow (Vendor confirmation, Wallet Verification, PaymentSent, Received).
- **Impact:** System fails the 100% crypto payment safety requirement.
- **Recommendation:** Extend flow to cover `Sent -> Confirmed -> PaymentSent -> Received` with the verification gate.
- **Trace:** PRD §5.4.4, §6
- **Consensus:** High (Codex)

#### Finding F-006 (P1)
- **Category:** correctness
- **Location:** Section 3.1: Flow: Log a Dose
- **Issue:** Flow unconditionally decrements inventory and lacks handling for Skips, Edits, or Zero-inventory warnings.
- **Impact:** Incorrect inventory tracking and violation of PRD logging rules.
- **Recommendation:** Add conditional paths for Skips and "Logged without Vial" cases.
- **Trace:** PRD §5.2.2
- **Consensus:** High (Codex)

### Pass 4 — Readiness

#### Finding F-007 (P1)
- **Category:** readiness
- **Location:** docs/system-architecture.md
- **Issue:** Module structure is too coarse for parallel agent implementation. Generic `lib/` and `app/actions/` will cause merge conflicts.
- **Impact:** Implementation friction during parallel build phase.
- **Recommendation:** Restructure into bounded context slices (e.g., `lib/{context}/domain`, `lib/{context}/application`).
- **Trace:** ADR-015, Scaffold Best Practices
- **Consensus:** High (Codex)

#### Finding F-008 (P2)
- **Category:** readiness
- **Location:** docs/system-architecture.md
- **Issue:** Testing architecture is missing from the document.
- **Impact:** No guidance for agents on where to place unit/integration/E2E tests.
- **Recommendation:** Add Section 9: Testing Architecture covering Vitest and Playwright organization.
- **Trace:** ADR-008
- **Consensus:** High (Codex)

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | RESOLVED | Added `lib/{context}` restructure with domain/application/infrastructure slices. |
| F-002   | P1       | RESOLVED | Added `Reminders` component to Section 2.1. |
| F-003   | P1       | RESOLVED | Moved ordering to `app/ordering/` and `app/actions/ordering/`. |
| F-004   | P1       | RESOLVED | Updated Section 7 with Resend and Sentry. |
| F-005   | P0       | RESOLVED | Extended Ordering flow to include Payment Safety Gate and terminal states. |
| F-006   | P1       | RESOLVED | Updated Dose Logging flow with Skips, Edits, and Idempotency logic. |
| F-007   | P1       | RESOLVED | Refined module structure into bounded context slices. |
| F-008   | P2       | RESOLVED | Added Section 9: Testing Architecture. |
