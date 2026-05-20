# Validation: Traceability Matrix

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 15 synthesized (P0: 2, P1: 8, P2: 4, P3: 1)
- **Passes run:** 5 of 5
- **Artifacts checked:** All documentation, test skeletons, and task maps.

---

## Findings by Pass

### Pass 1 — Functional Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** tests/acceptance/*.test.ts
- **Issue:** No acceptance criteria are actually verified. All 53 acceptance test cases are `it.todo(...)` placeholders.
- **Impact:** System claims coverage but provides zero verification.
- **Recommendation:** Convert critical-path `it.todo` to executable test skeletons.
- **Trace:** TDD Standards

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** PRD §5.2.6 / docs/user-stories.md
- **Issue:** The "Stack Overview Dashboard" requirement is not represented as a dedicated story, task, or test.
- **Impact:** Core dashboard features (active protocol summary, today status, 7-day rating average) will be missed.
- **Recommendation:** Add a Dashboard user story and map to tasks.
- **Trace:** PRD §5.2.6

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** docs/user-stories.md US-TRK-03
- **Issue:** Missing trace for detailed logging rules: same-day edit limit, retroactive logging prohibition, and timezone/DST behavior.
- **Impact:** Safety and adherence metrics will be fragile.
- **Recommendation:** Expand TRK stories and tests for these edge cases.
- **Trace:** PRD §5.2.2

### Pass 2 — Traceability Integrity

#### Finding F-004 (P1)
- **Category:** traceability
- **Location:** tests/evals/coverage.test.ts
- **Issue:** Regex mismatch. Eval searches for `AC-\d+`, but stories use `AC 1`, `AC 2`.
- **Impact:** Coverage eval will always pass even with 0% coverage.
- **Recommendation:** Align naming or update eval regex.
- **Trace:** Automated Evals

#### Finding F-005 (P1)
- **Category:** traceability
- **Location:** docs/reviews/implementation-plan/task-coverage.json
- **Issue:** False mappings. Stories US-AUT-04, US-ORD-02, US-TRK-05, and US-TRK-08 are claimed but don't exist in the plan task fields.
- **Impact:** Misleading progress tracking.
- **Recommendation:** Sync task-coverage.json with the actual implementation plan.
- **Trace:** Implementation Plan

### Pass 3 — NFR Traceability

#### Finding F-006 (P1)
- **Category:** coverage
- **Location:** ADR-015 / System Architecture
- **Issue:** Ordering module isolation (DISABLE_ORDERING) is architecturally required but has no story, task, or test coverage.
- **Impact:** Risk of hard-coupling a module that needs to be isolatable for regulatory reasons.
- **Recommendation:** Add a non-functional story and test for module isolation.
- **Trace:** PRD §7.5

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | PENDING | Will convert critical placeholders to executable. |
| F-002   | P1       | PENDING | Will add Dashboard story and tasks. |
| F-003   | P1       | PENDING | Will expand logging ACs and tests. |
| F-004   | P1       | PENDING | Will align AC naming convention. |
| F-005   | P1       | PENDING | Will sync task-coverage.json. |
| F-006   | P1       | PENDING | Will add Isolation story and test. |
