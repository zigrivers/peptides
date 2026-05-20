---
description: TDD, quality gates, and automated eval rules
globs: ["**/*.test.ts", "**/*.spec.ts", "tests/**"]
---

# Testing & Eval Rules

- **TDD**: Write the test skeleton in `tests/acceptance/` before implementation.
- **Coverage**: 100% branch coverage required for `lib/reconstitution` and `lib/audit`.
- **E2E**: Prioritize mobile-viewport emulation and offline sync simulation.
- **Cleanup**: E2E tests must use `TEST_USER_ID` prefixes and clean up in `afterAll`.
- **Evals**: Never disable an eval without a valid reason in a comment.
