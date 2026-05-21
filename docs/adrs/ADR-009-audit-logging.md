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
Audit events will be retained for 90 days. A daily background job (per ADR-012) will delete events older than 90 days to manage database size.

## User Reference Preservation

`AuditEvent.actorUserId` and `subjectUserId` are **historical references**, not enforced foreign keys at the database level. When a user is deleted (PRD §5.6, US-AUT-02, US-ADM-04), their `auth_users` row is removed but their identity in audit events is preserved. This is intentional: audit events must be able to record "user X performed action Y" even after user X has been deleted — the audit trail is the only durable record of what happened.

Concretely:
- The `audit_events.actor_user_id` and `audit_events.subject_user_id` columns are nullable UUID columns with **no FK constraint to `auth_users.id`**.
- User deletion does not cascade-delete or null-out audit events.
- The audit-query layer joins to `auth_users` with a `LEFT JOIN` and displays "[deleted user]" when the join misses.

This decision is consistent with `docs/domain-models/audit.md` and `docs/domain-models/auth.md` (the "Account Identity" aggregate boundary explicitly excludes the audit log).

## Traces
- PRD §5.7 (Audit log retention), §8.2 (Security audit log), §8.7 (Monitoring)
- Domain model: `docs/domain-models/audit.md`
- Stories: US-AUT-02 (account deletion preserves audit), US-ADM-04 (managed-user deletion preserves audit)
- ADR-012 (Railway Cron — runs the daily purge job)
