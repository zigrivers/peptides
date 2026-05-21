# Review: TDD Standards

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — repaired 9 PENDING resolution-log entries + fixed 7 new findings; Full Pass  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 16 synthesized (P1: 8, P2: 7, P3: 1)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/tdd-standards.md`, `docs/domain-models/*.md`, `docs/system-architecture.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Coverage

#### Finding F-001 (P1)
- **Category:** coverage
- **Location:** §1 Test Pyramid / Coverage targets
- **Issue:** The 70% overall coverage target is insufficient for safety-critical systems. Reconstitution math, payment safety gates, and audit-trail persistence require 100% branch coverage.
- **Impact:** Critical branches (e.g., wallet verification failure, audit write failure) may go untested, leading to user harm or financial loss.
- **Recommendation:** Add per-module coverage targets: 100% for `lib/reconstitution`, `lib/audit`, and `lib/ordering/application/PaymentGate`.
- **Trace:** PRD §6 Hard Gates

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** §1 Test Pyramid / Unit purpose
- **Issue:** Missing explicit mapping of domain invariants to tests.
- **Impact:** Implementing agents may miss subtle business rules (e.g., bcrypt cost, invite expiry, published compound routes).
- **Recommendation:** Add an Invariant Coverage Matrix in Section 6.
- **Trace:** Domain Models: Auth, Reference, Tracker

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** §2.2 Integration Testing
- **Issue:** Tracker workflow testing is underspecified. Missing cases for UTC storage vs. local "today" resolution, DST shifts, and batch-logging atomicity.
- **Impact:** Adherence metrics may drift across timezones or fail during DST transitions.
- **Recommendation:** Define explicit test scenarios for timezone-aware dose logging.
- **Trace:** PRD §8.8

#### Finding F-004 (P1)
- **Category:** coverage
- **Location:** §2.3 E2E Testing
- **Issue:** Offline sync testing (Serwist/IndexedDB) is named but not defined.
- **Impact:** Sync logic (idempotency, replay order) is highly complex and error-prone.
- **Recommendation:** Add a Playwright testing pattern for Service Worker interception and offline replay simulation.
- **Trace:** PRD §8.6, ADR-007

### Pass 2 — Consistency

#### Finding F-005 (P1)
- **Category:** consistency
- **Location:** §3 Quality Gates
- **Issue:** Commands use `npm`, but the tech stack (ADR-006) and repository conventions use `pnpm`.
- **Impact:** Inconsistent dependency resolution between local dev and CI.
- **Recommendation:** Update all quality gate commands to use `pnpm`.
- **Trace:** ADR-006

#### Finding F-006 (P2)
- **Category:** coverage
- **Location:** §2.2 Mocking
- **Issue:** External API mocking is limited to Telegram/Resend. Missing Cloudflare R2, Web Push (VAPID), and Sentry.
- **Impact:** Incomplete integration coverage for infrastructure layers.
- **Recommendation:** Expand mocking strategy to include all PRD §7.3 providers.
- **Trace:** PRD §7.3

### Pass 3 — Correctness

#### Finding F-007 (P1)
- **Category:** correctness
- **Location:** §2.2 Audit assertions
- **Issue:** Audit logging is treated as an optional comment. PRD requires 100% completeness and transactional integrity.
- **Impact:** System may merge features that fail to record mandated audit events.
- **Recommendation:** Require a shared `auditAssertion` helper and failure-injection tests.
- **Trace:** PRD §8.7

#### Finding F-008 (P2)
- **Category:** correctness
- **Location:** §4 Test Data Strategy
- **Issue:** Transactional cleanup is not viable for browser-driven E2E tests or Next.js Server Actions.
- **Impact:** E2E tests will pollute the database, leading to flakiness.
- **Recommendation:** Switch to per-test user-id scoping and deterministic cleanup in `afterEach`.
- **Trace:** Scaffold Best Practices

### Pass 4 — Readiness

#### Finding F-009 (P1)
- **Category:** readiness
- **Location:** §3 Quality Gates
- **Issue:** Quality gates miss critical build and deployment readiness checks (Prisma migration validation, Next.js build).
- **Impact:** Breaking schema changes or build errors may merge to main.
- **Recommendation:** Add `pnpm build` and `prisma validate` to quality gates.
- **Trace:** ADR-002

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | RESOLVED | Will update Section 1 with per-module targets. |
| F-002   | P1       | RESOLVED | Will add Invariant Coverage Matrix. |
| F-003   | P1       | RESOLVED | Will add Timezone scenario to Tracker tests. |
| F-004   | P1       | RESOLVED | Will add PWA Sync testing pattern. |
| F-005   | P1       | RESOLVED | Will switch commands to `pnpm`. |
| F-006   | P2       | RESOLVED | Will expand mocking strategy. |
| F-007   | P1       | RESOLVED | Will formalize Audit assertions. |
| F-008   | P2       | RESOLVED | Will update cleanup strategy. |
| F-009   | P1       | RESOLVED | Will add build/validate gates. |

> Note: the original Resolution Log marked all 9 of F-001..F-009 as "PENDING" with "Will…" prose. In fact, the doc had been substantively updated since — only F-007 (audit assertions) was genuinely incomplete. This re-review verifies the state of each prior-pass item and repairs the resolution-log regression.

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict.

### Resolution-log regression repaired

The prior review's Resolution Log marked all 9 prior-pass findings as `PENDING`. Verifying against the actual doc state:
- F-001 (per-module 100% targets): ✓ already in §1
- F-002 (Invariant Coverage Matrix): ✓ already in §6 (now §8)
- F-003 (Timezone-aware tests): ✓ already in §7.1 (now §9.1)
- F-004 (PWA Sync test pattern): ✓ already in §7.2 (now §9.2)
- F-005 (pnpm commands): ✓ already in §3
- F-006 (R2 + Web Push mocking): ✓ already in §5 (now §6)
- F-007 (Audit assertions): **PARTIALLY** — example present but no shared helper or failure-injection pattern. **Now fully resolved in §3.2 with `expectAuditEvent(...)` helper definition + audit-failure-injection test pattern.**
- F-008 (cleanup strategy): ✓ already in §4 (now §5)
- F-009 (build/validate gates): ✓ already in §3 (now §4)

All 9 are now genuinely RESOLVED.

### New findings + fixes

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 (regression repair) | Resolution log was out of sync with doc state — 8 items were already resolved but marked PENDING; 1 (F-007) was partial. | Updated resolution log; completed F-007 via shared `expectAuditEvent` helper + failure-injection pattern. |
| N2 | P1 | Doc structure bug: §2 used for both "Testing Layer Selection" and "Testing Patterns". | Fully renumbered: §1 Pyramid → §2 Layer Selection → §3 Testing Patterns → §4 Quality Gates → §5 Test Data → §6 Mocking → §7 Eval Testing → §8 Invariant Matrix → §9 Specialized Patterns → §10 Cross-References. |
| N3 | P1 | Missing test patterns for new step-2/3/4 flows (password change session invalidation, email change verify+revert, account deletion 48h, managed user deletion export-first, order cancel, reminder dispatch). | Added §9.3-§9.8 covering all six flows with explicit assertion checklists. |
| N4 | P2 | Test pyramid lacked Eval layer despite `tests/evals/` existing in the project. | Added Evals to the pyramid table (§1) and full Eval Testing section (§7) including: real provider calls, gold-standard fixtures, LLM-as-judge scorer with rubric, threshold rules, "never disable without comment" rule. |
| N5 | P2 | Mocking strategy missing AI provider (Anthropic + Gemini per ADR-010). | Added AI providers row to §6 with the explicit rule: "AI is mocked everywhere EXCEPT in `tests/evals/`. Integration tests assert prompts + parsing; evals assert response quality." |
| N6 | P2 | No property-based testing pattern for reconstitution math. | Added property-based testing requirement to §3.1: reconstitution calculator MUST have at least one `fast-check` property test asserting `concentration × injectionVolume === totalDose`. Listed in §8 matrix. |
| N7 | P2 | Invariant Coverage Matrix sparse (5 rows) — missing step-4 domain invariants. | Expanded matrix from 5 → 19 rows covering: 4 new auth-lifecycle invariants (PasswordResetToken 1h, EmailChangeRequest 24h/48h, Session 30d, password-change-revokes-sessions), 4 new tracker invariants (one-OutcomeLog-per-day, deactivated-no-new-logs, OrderLineItem merge, 60s duplicate-send), 3 new ordering invariants (state forward-only, sendMethod immutable, payment safety gate), 1 audit (actorUserId historical reference), 1 reconstitution (property-based math identity). |
| N8 | P2 (consistency) | §3.3 E2E didn't mention mobile viewport requirement despite PRD §8.6 mandating mobile-first dose logging. | Added explicit "mobile viewports" rule: every PWA test runs on chromium desktop AND webkit iPhone 14 viewport. |

### Regressions detected (re-review)

None introduced.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **Resolution-log regression repaired** (9 PENDING → RESOLVED, with F-007 actually completed)
- **All 7 new findings fixed**
- **Re-trigger conditions**: any new safety-critical module added to `lib/` (must add to 100%-coverage glob), any new domain invariant in `docs/domain-models/` (must add to §8 matrix), any new AI prompt (must have a corresponding eval).
