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
  - `actorUserId`: UUID (historical reference — preserved even if the actor's User record is later deleted; not enforced as an FK at the DB level so deletion does not cascade)
  - `subjectUserId`: UUID (optional; historical reference as above)
  - `category`: enum (Security, Protocol, Order, Admin, Auth, Reconstitution)
  - `action`: string (canonical action names listed below)
  - `resourceId`: UUID (identity of the affected entity)
  - `resourceType`: string (e.g., "Protocol", "Order", "User")
  - `metadata`: JSON (captured request context: IP, User Agent, request ID)
  - `oldValues`: JSON (optional)
  - `newValues`: JSON (optional)

**Canonical action names (non-exhaustive — extensible per domain):**
- Auth: `USER_REGISTERED`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`, `EMAIL_CHANGE_REQUESTED`, `EMAIL_CHANGE_VERIFIED`, `EMAIL_CHANGE_REVERTED`, `ACCOUNT_DELETION_SCHEDULED`, `ACCOUNT_DELETION_CANCELLED`, `ACCOUNT_DELETED`, `OTHER_SESSIONS_INVALIDATED`.
- Admin: `USER_INVITED`, `INVITE_RESENT`, `INVITE_ACCEPTED`, `MANAGED_USER_DEACTIVATED`, `MANAGED_USER_DELETION_REQUESTED`, `MANAGED_USER_DELETED`, `MANAGED_USER_PASSWORD_RESET_TRIGGERED`.
- Protocol: `PROTOCOL_CREATED`, `PROTOCOL_UPDATED`, `PROTOCOL_PAUSED`, `PROTOCOL_RESUMED`, `PROTOCOL_CLONED`, `PROTOCOL_DEACTIVATED`, `CYCLE_CREATED`, `CYCLE_UPDATED`, `CYCLE_RESTARTED`.
- Order: `ORDER_DRAFTED`, `ORDER_SENT`, `ORDER_CONFIRMED`, `PAYMENT_ACKNOWLEDGED`, `ORDER_PAYMENT_SENT`, `ORDER_RECEIVED`, `ORDER_CANCELLED`, `ORDER_MARKED_STALE`, `DUPLICATE_SEND_BLOCKED`.
- Reconstitution: `VIAL_RECONSTITUTED`, `SAFETY_WARNING_TRIGGERED`.
- Security: `TELEGRAM_SESSION_LINKED`, `TELEGRAM_SESSION_REVOKED`, `AUDIT_WRITE_FAILURE` (meta-event — alerts on audit-log integrity).

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
