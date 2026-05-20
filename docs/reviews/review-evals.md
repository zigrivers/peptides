# Review: Automated Evals

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 18 synthesized (P1: 12, P2: 5, P3: 1)
- **Passes run:** 13 of 13
- **Artifacts checked:** `docs/tdd-standards.md`, `docs/coding-standards.md`, `CLAUDE.md`, `package.json`

---

## Findings by Pass

### Pass 1 — Core Coverage

#### Finding F-001 (P1)
- **Category:** coverage
- **Location:** tests/evals/
- **Issue:** Missing core eval categories required by the meta-prompt: Cross-Doc consistency and Adherence patterns.
- **Impact:** Gaps in validating that code matches coding standards and that documentation remains in sync with the codebase.
- **Recommendation:** Generate `cross-doc.test.ts` and `adherence.test.ts`.
- **Trace:** Meta-Prompt: Expected Outputs

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** tests/evals/
- **Issue:** Missing conditional eval categories despite having source documents: Security, Database, API, Accessibility, Performance, Config, and Error Handling.
- **Impact:** System fails to automate verification of 70% of the project's quality standards.
- **Recommendation:** Generate all 8 conditional eval categories.
- **Trace:** Meta-Prompt: Expected Outputs

### Pass 2 — Consistency

#### Finding F-003 (P1)
- **Category:** consistency
- **Location:** package.json
- **Issue:** Missing `eval` target in scripts. Meta-prompt requires a separate command for running evals.
- **Impact:** Difficulty in integrating evals into CI/CD pipelines without polluting standard test results.
- **Recommendation:** Add `"eval": "vitest run tests/evals"` to `package.json`.
- **Trace:** Meta-Prompt: Supporting Outputs

#### Finding F-004 (P1)
- **Category:** consistency
- **Location:** tests/evals/
- **Issue:** Evals use `npm` commands in documentation, but the project has been standardized on `pnpm`.
- **Impact:** Inconsistent dependency management and potential execution failures in CI.
- **Recommendation:** Update all eval documentation and implementation to use `pnpm`.
- **Trace:** ADR-006

### Pass 3 — Readiness

#### Finding F-005 (P1)
- **Category:** readiness
- **Location:** tests/evals/
- **Issue:** Missing "Exclusion Mechanism" for adherence and security evals.
- **Impact:** High false-positive rate as valid exceptions to rules trigger failures, leading to "ignore" fatigue.
- **Recommendation:** Implement a `.evalignore` or comment-based exclusion helper.
- **Trace:** Meta-Prompt: Quality Criteria

#### Finding F-006 (P1)
- **Category:** readiness
- **Location:** docs/eval-standards.md
- **Issue:** Document missing. Required to define what is and isn't checked by the automated suite.
- **Impact:** Ambiguity regarding the scope and reliability of the quality gates.
- **Recommendation:** Create `docs/eval-standards.md`.
- **Trace:** Meta-Prompt: Supporting Outputs

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | PENDING | Will generate core evals. |
| F-002   | P1       | PENDING | Will generate all 8 conditional evals. |
| F-003   | P1       | PENDING | Will add `eval` target to `package.json`. |
| F-004   | P1       | PENDING | Will switch commands to `pnpm`. |
| F-005   | P1       | PENDING | Will add exclusion helper. |
| F-006   | P1       | PENDING | Will create `docs/eval-standards.md`. |
