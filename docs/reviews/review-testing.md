# Review: TDD Standards

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
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
| F-001   | P1       | PENDING | Will update Section 1 with per-module targets. |
| F-002   | P1       | PENDING | Will add Invariant Coverage Matrix. |
| F-003   | P1       | PENDING | Will add Timezone scenario to Tracker tests. |
| F-004   | P1       | PENDING | Will add PWA Sync testing pattern. |
| F-005   | P1       | PENDING | Will switch commands to `pnpm`. |
| F-006   | P2       | PENDING | Will expand mocking strategy. |
| F-007   | P1       | PENDING | Will formalize Audit assertions. |
| F-008   | P2       | PENDING | Will update cleanup strategy. |
| F-009   | P1       | PENDING | Will add build/validate gates. |
