# Review: System Architecture

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 6 new findings fixed; Full Pass  
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

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict. Re-review accounts for new requirements from batch steps 2-5 (PRD, stories, domain models, ADRs).

### New findings + fixes

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 | §2.1 Component Overview missed Admin, Export Pipeline, and AI Layer components that exist in the codebase scope per steps 2-5. | Expanded the table to 12 components; added Admin (managed-user invitation/lifecycle/adherence), Export Pipeline (R2 + Resend + cron), AI Layer (Anthropic/Gemini, ADR-010). Auth row also expanded to include password/email change flows and account deletion. Ordering row updated to mention Vendor + VendorCatalogProduct. |
| N2 | P1 | §3 only documented 2 flows (dose logging, ordering). Six additional flows needed for the new story coverage from steps 2-3. | Added §3.3 Account Deletion (48h delay + immediate + Telegram session revoke), §3.4 Password Change (with session-invalidation), §3.5 Email Change (verify + 48h revert window + old-address notice), §3.6 Managed User Invitation (resend revokes prior + audit), §3.7 Reminder Dispatch (15-min tick + per-user local-time resolution + push-then-email fallback), §3.8 Async Data Export (R2 + signed URL + cleanup). Also expanded §3.2 Ordering with idempotency (60s), stale-wallet warning, cancel-from-any-non-terminal, Stale auto-flag. |
| N3 | P1 | §6 Cron table disagreed with ADR-012 step-5 update: "Hourly" dose reminders vs. ADR's every-15-minutes; missing export-cleanup and backup-verification jobs. | Rewrote the table aligned with ADR-012 (every-15-min reminders, daily 09:00 stale orders, 04:00 audit purge, 05:00 backup verify, 03:00 export cleanup, 06:00 vial expiry, weekly Sun 12:00 PubMed digest v2). Added cross-reference: schedules authoritative in ADR-012; updates land there first. |
| N4 | P1 | Architecture silent on the AI layer despite ADR-010 (step 5) defining it. No AI component, no AI-job orchestration. | Added AI Layer to §2.1; mentioned in §3.7 / §3.8 / §7 / §8 where relevant. AI failures fall back to secondary provider (ADR-010) and never block user-facing dose logging, ordering, or reconstitution. |
| N5 | P2 | §8 Failure Modes was sparse (3 entries). Missing Resend failure, Web Push failure, R2 unreachable, cron-missed, AI provider failure. | Rewrote §8 as §8.1 Failure Modes with 9 entries covering all external services + the new flows from steps 2-5; added explicit silent-fail-soft policy for reminder emails (US-TRK-09 AC 5) and the "AI failures never block user-facing flows" rule. |
| N6 | P2 | Architecture silent on external-service rate limits / circuit breakers. | Added §8.2 Rate limits and backoff policies — table covering Telegram MTProto, Resend, R2, Anthropic, Gemini with each service's v1-expected limits and the chosen backoff strategy. |

### Regressions detected

None. All 8 prior-pass findings remain RESOLVED.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **All P0/P1 findings addressed**
- **No retained gaps**
- **Re-trigger conditions**: any new external integration, any new background job (must land in both this doc and ADR-012), any new domain bounded context.
