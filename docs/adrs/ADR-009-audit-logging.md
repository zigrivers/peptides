# ADR-009: Implement Persistent Audit Logging for Sensitive Mutations

## Status
Accepted

## Context
The PRD requires a "Hard Gate" for audit log completeness (100% of protocol mutations, dose logs, and order events). This is necessary for security, system integrity, and potentially future regulatory compliance.

## Decision
We will implement a system-wide `audit_events` table in PostgreSQL to store immutable records of all sensitive state changes.

## Alternatives Considered
- **Application Logs (Stdout)**: Easier to implement but ephemeral and harder to query for user-facing audit trails.
- **Prisma Middleware**: Can capture changes but harder to attribute to a specific user/request context in some scenarios.
- **Temporal / Event Sourcing**: Provides a complete audit trail but adds significant architectural complexity.

## Consequences
- **Benefits**: Immutable record of system state; easy to query for admin adherence monitoring; satisfies security requirements; provides data recovery path.
- **Costs**: Database storage growth (mitigated by 90-day rolling purge); additional latency on writes to record the audit event.

## Retention Policy
Audit events will be retained for 90 days. A daily background job will delete events older than 90 days to manage database size.
