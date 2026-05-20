# ADR-015: Implement Bounded Context Isolation for Ordering

## Status
Accepted

## Context
The PRD (§7.5) requires the Ordering module to be architecturally isolatable so it can be disabled for regulatory reasons without breaking the Reference and Tracker pillars.

## Decision
We will implement the Ordering module with clear boundaries:
1. **Routing**: All ordering flows live under `/ordering`.
2. **Permissions**: Ordering features are guarded by a specific RBAC capability check.
3. **Services**: Ordering logic is isolated in `lib/ordering/` and `app/actions/ordering/`.
4. **Feature Flag**: A `DISABLE_ORDERING` environment variable will completely hide the module from the UI and block API routes.

## Alternatives Considered
- **Shared Codebase**: Easier to implement but harder to strip out if needed.
- **Microservices**: Maximum isolation but excessive operational overhead for v1.

## Consequences
- **Benefits**: Legal/regulatory flexibility; cleaner module boundaries; easier v2 upgrades for ordering.
- **Costs**: Slight overhead in service layer abstraction.
