# ADR-008: Use Vitest and Playwright for Automated Testing

## Status
Accepted

## Context
Safety-critical math (reconstitution) and payment flows require 100% test coverage to prevent user harm and financial loss. A solo developer needs fast, reliable tests that run in CI.

## Decision
We will use Vitest for unit and integration testing and Playwright for end-to-end (E2E) testing.

## Alternatives Considered
- **Jest**: Slower and worse ESM support than Vitest for modern Next.js projects.
- **Cypress**: Excellent but slower and has less WebKit support than Playwright for iOS PWA testing.
- **No E2E testing**: Too risky for the payment safety gate and offline sync requirements.

## Coverage Requirements (binding)

Per `.claude/rules/safety-math.md` and `.claude/rules/testing.md`:
- **100% branch coverage** is required for `lib/reconstitution` and `lib/audit` modules. Vitest config enforces this in CI; coverage below 100% fails the build.
- **TDD is the default workflow**: every feature begins with a pending test skeleton in `tests/acceptance/` before implementation. Skipping or disabling an eval requires a justified comment.
- **`Decimal` only** for all dose, volume, and concentration math — `Float` is forbidden. Vitest assertions use `Decimal.eq()` not numeric equality.
- **E2E priority**: mobile-viewport emulation and offline-sync simulation are first-class E2E targets, not afterthoughts.
- **Test data hygiene**: E2E tests use `TEST_USER_ID` prefixes and clean up in `afterAll`.

## Consequences
- **Benefits**: Extremely fast unit tests; reliable cross-browser E2E testing (Chromium, Firefox, WebKit); visual debugging in Playwright; 100% coverage target for critical math is enforceable, not aspirational.
- **Costs**: Time investment to maintain the E2E suite; potential flakiness in complex PWA sync tests; the 100% coverage gate occasionally blocks merges and requires either adding tests or explicitly excluding non-branch code via Vitest's coverage configuration.

## Traces
- PRD §6 (Hard Gates: zero dose-calc defects), §8.5 (Accessibility testing)
- Rules: `.claude/rules/safety-math.md`, `.claude/rules/testing.md`
- Related: ADR-002 (Prisma schema as test fixture source), ADR-009 (audit logging — also requires 100% coverage)
