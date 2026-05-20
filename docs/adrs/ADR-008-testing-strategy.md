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

## Consequences
- **Benefits**: Extremely fast unit tests; reliable cross-browser E2E testing (Chromium, Firefox, WebKit); visual debugging in Playwright; 100% coverage target for critical math.
- **Costs**: Time investment to maintain the E2E suite; potential flakiness in complex PWA sync tests.
