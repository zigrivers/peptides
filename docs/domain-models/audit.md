# Audit Domain

The Audit Domain provides a system-wide record of all sensitive mutations and security events.

## Ubiquitous Language
- **Audit Event**: A persistent, immutable record of a specific action.

## Entities

### AuditEvent (Aggregate Root)
An immutable log entry.
- **Attributes**:
  - `id`: UUID
  - `timestamp`: timestamp
  - `actorUserId`: UUID (FK)
  - `subjectUserId`: UUID (FK, optional)
  - `category`: enum (Security, Protocol, Order, Admin)
  - `action`: string (e.g., "PROTOCOL_CREATED")
  - `resourceId`: UUID (Identity of the affected entity)
  - `resourceType`: string (e.g., "Protocol")
  - `metadata`: JSON (Captured request context, IP, User Agent)
  - `oldValues`: JSON (optional)
  - `newValues`: JSON (optional)

## Aggregate: System Audit Trail
- **Consistency Boundary**: A single AuditEvent record.
- **Root**: AuditEvent
- **Invariants**:
  - Audit events are immutable; they can be created but never updated or deleted.
  - Every event must be linked to an `actorUserId`.
  - **Retention**: Events are retained for 90 days, then purged by a scheduled background job.

## Invariants
- `auditEvent.timestamp >= createdAt`
- `auditEvent.action.length > 0`
