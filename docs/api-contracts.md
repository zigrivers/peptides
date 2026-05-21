# API Contracts

**Status:** Draft
**Date:** 2026-05-20
**System Architecture source:** `docs/system-architecture.md`
**Domain Model source:** `docs/domain-models/`
**Methodology:** deep | Depth: 5/5

---

## 1. Global Standards

### 1.1 Style & Idempotency
- **Style**: RESTful Route Handlers (`app/api/*`) for read endpoints + cron, and type-safe Server Actions (`app/actions/*`) for mutations. All actions return JSON via a thin handler wrapper.
- **Idempotency**: All mutating actions MUST accept an `Idempotency-Key` (header for `/api/*`, field for Server Actions).
  - **Format**: UUID v4.
  - **Behavior**: replaying an existing key with the *same payload hash* returns the **original success response**; replaying with a *different* payload returns `409 idempotency_key_conflict`.
  - **Retention**: idempotency-key records retained for 24 hours.
- **Pagination**: `page` (1-indexed) and `limit` (default: 20, max: 100). Response includes `total`, `pages`, `hasNext`.
- **Auth**: every authenticated endpoint requires a valid session cookie (Auth.js). Server-Action calls without a valid session return `401 unauthorized`. Power-User-only endpoints additionally check `role`; managed users hitting them get `403 insufficient_permissions`.
- **Rate limits**: see §8 below.

### 1.2 Common Response Shapes

**Success Response:**
```json
{
  "data": { ... },
  "warnings": [
    { "code": "string", "message": "human-readable warning", "severity": "info|warning" }
  ]
}
```
The `warnings` array is always present (possibly empty) for endpoints that can produce non-blocking notices.

**Error Response:**
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": { "fields": { "<fieldName>": ["error-message-1", ...] } }
  }
}
```

---

## 2. Auth & Admin Module (AUT)

### 2.1 Session Lifecycle
- **[POST] /actions/auth/register**: `{ email, password, name? }` → `{ user }`. Power User signup only; managed users register via invite.
- **[POST] /actions/auth/login**: `{ email, password }` → `{ user }`. Creates a Session.
- **[POST] /actions/auth/logout**: `void` → `204`. Revokes the current Session (sets `revokedAt`).
- **[GET]  /api/auth/session**: → `{ session: { user, expiresAt, lastSeenAt } }`.

### 2.2 Password & Email
- **[POST] /actions/auth/reset-password-request**: `{ email }` → `204` (always returns 204 — does not leak whether the email exists).
- **[POST] /actions/auth/reset-password-confirm**: `{ token, newPassword }` → `{ user }`.
- **[POST] /actions/auth/change-password** *(authenticated)*: `{ currentPassword, newPassword }` → `{ otherSessionsRevoked: number }`. **Invalidates all sessions except the current one.** Errors: `current_password_invalid` (same body as wrong-new-password to avoid leaking which field failed), `password_same_as_current`, `password_too_short`.
- **[POST] /actions/auth/change-email-request** *(authenticated)*: `{ currentPassword, newEmail }` → `{ verifyExpiresAt }`. Sends verification email to `newEmail`. Errors: `current_password_invalid`, `email_in_use` (does not distinguish "owned by me" vs. "owned by someone else").
- **[POST] /actions/auth/change-email-verify**: `{ token }` → `{ user, revertibleUntil }`. Token from the new-address verification email. Triggers a notification email to the *previous* address with a revert link.
- **[POST] /actions/auth/change-email-revert**: `{ revertToken }` → `{ user }`. The old-address holder can revert within 48 hours of `appliedAt`.

### 2.3 Account Deletion & Export
- **[POST] /actions/auth/request-export**: `{ format: 'JSON' | 'CSV' | 'BOTH' }` → `{ requestId, deliveryMode: 'IMMEDIATE_DOWNLOAD' | 'EMAIL_LINK' }`. Sync return for < 10MB; async + email for ≥ 10MB.
- **[POST] /actions/auth/schedule-deletion**: `{ passwordConfirmation, mode: 'DELAYED_48H' | 'IMMEDIATE_WITH_DOUBLE_CONFIRM' }` → `{ scheduledFor | deletedAt }`. Immediate mode requires a second `acknowledged: true` field on the same request.
- **[POST] /actions/auth/cancel-deletion** *(authenticated, only during 48h window)*: `void` → `204`.

### 2.4 Managed Users (Admin / Power-User-only)
- **[GET]  /api/admin/managed-users**: `?status=ALL|ACTIVE|INVITED|EXPIRED|DEACTIVATED` → `{ items: ManagedUserDto[] }` (each item includes invite status + 7-day adherence %).
- **[POST] /actions/admin/invite-user**: `{ email, name }` → `{ inviteId, expiresAt }`. Errors: `invite_email_exists` (active account), `invite_already_pending`.
- **[POST] /actions/admin/resend-invite**: `{ inviteId }` → `{ inviteId, expiresAt }`. Revokes the prior Invite (status = Revoked) and creates a new one with a fresh 72h expiry.
- **[POST] /actions/admin/reset-managed-password**: `{ userId }` → `204`. Sends a reset-password email to the managed user.
- **[POST] /actions/admin/deactivate-managed-user**: `{ userId, confirm: true }` → `{ user }`. Requires `confirm: true` if the user has active protocols.
- **[POST] /actions/admin/delete-managed-user**: `{ userId, passwordConfirmation, mode: 'DELAYED_48H' | 'IMMEDIATE_WITH_DOUBLE_CONFIRM' }` → `{ scheduledFor | deletedAt, exportRequestId }`. **Always generates a data export delivered to the admin (the deleting Power User) before deletion executes.**

---

## 3. Tracker Module (TRK)

### 3.1 Protocols
- **[GET]  /api/tracker/protocols**: `?status=ALL|ACTIVE|PAUSED|COMPLETED|DEACTIVATED&userId=` → `{ items: ProtocolDto[] }`. `userId` query param valid only for Power Users querying their managed users.
- **[POST] /actions/tracker/create-protocol**: `{ compoundId, dose, schedule, administrationRoute, startDate, endDate?, cycleId?, notes?, assignedToUserId? }`. `assignedToUserId` is Power-User-only.
- **[PATCH] /actions/tracker/update-protocol**: `{ id, dose?, schedule?, administrationRoute?, endDate?, notes? }`.
- **[POST] /actions/tracker/pause-protocol**: `{ id }`. Status: Active → Paused.
- **[POST] /actions/tracker/resume-protocol**: `{ id }`. Status: Paused → Active.
- **[POST] /actions/tracker/deactivate-protocol**: `{ id }`. Status: any → Deactivated (terminal soft-delete).
- **[POST] /actions/tracker/clone-protocol**: `{ id, startDate, cycleId? }` → `{ protocolId }`. Creates a copy with all fields plus a new startDate.

### 3.2 Cycles
- **[GET]  /api/tracker/cycles**: `?status=ALL|ACTIVE|PAUSED|COMPLETED` → `{ items: CycleDto[] }`.
- **[POST] /actions/tracker/create-cycle**: `{ name, startDate, endDate?, scheduledBreaks?: DateRange[] }` → `{ cycleId }`.
- **[PATCH] /actions/tracker/update-cycle**: `{ id, name?, startDate?, endDate?, scheduledBreaks? }`.
- **[POST] /actions/tracker/restart-cycle**: `{ id, newStartDate }` → `{ newCycleId, clonedProtocolIds: string[] }`. Reopens a completed cycle by cloning all of its protocols to a new start date.

### 3.3 Dose Logging
- **[POST] /actions/tracker/log-dose**: `{ protocolId, scheduledDate, amount, status: 'LOGGED' | 'SKIPPED', injectionSite?, note?, vialId? }` → `{ doseLog, warnings: [{ code: 'insufficient_inventory' | 'vial_expiry_warning' | 'dose_above_high_range', ... }] }`. Always returns `200`; warnings indicate non-blocking notices.
- **[POST] /actions/tracker/batch-log**: `{ logs: DoseLogInput[] }` → `{ logs: DoseLog[], warnings: { perLogIndex: SafetyWarning[] } }`. Atomic per-log; partial success returns the successful logs and per-failure entries.
- **[PATCH] /actions/tracker/edit-dose**: `{ id, amount?, injectionSite?, note? }`. Editable only within the same calendar day as `loggedAt` (server enforces).

### 3.4 Outcome Logs (Subjective)
- **[GET]  /api/tracker/outcome-logs**: `?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ items: OutcomeLogDto[] }`.
- **[POST] /actions/tracker/log-outcome**: `{ scheduledDate, overallRating, protocolRatings?: [{ protocolId, rating }], tags?: string[], note? }` → `{ outcomeLog }`. Unique per (user, scheduledDate) — duplicate returns `outcome_already_logged_for_date`.
- **[PATCH] /actions/tracker/update-outcome**: `{ id, overallRating?, protocolRatings?, tags?, note? }`.

### 3.5 Reminders
- **[GET]  /api/tracker/reminder-preference**: → `{ preference: ReminderPreferenceDto }`.
- **[PUT]  /actions/tracker/update-reminder-preference**: `{ reminderTime: 'HH:MM', timezone: IANAZone, channel: 'PUSH' | 'EMAIL' | 'BOTH', enabled, emailFallbackEnabled? }`.
- **[POST] /actions/tracker/subscribe-push**: `{ endpoint, p256dh, auth }` → `{ subscriptionId }`. Idempotent on `endpoint` unique key.
- **[POST] /actions/tracker/unsubscribe-push**: `{ endpoint }` → `204`.
- **[POST] /actions/tracker/record-push-permission-state**: `{ state: 'GRANTED' | 'DENIED' | 'NOT_PROMPTED' }`. Called by the client after the browser permission dialog resolves.

### 3.6 PWA Sync
- **[POST] /api/sync**: `{ events: SyncEvent[] }` → `{ accepted: number, rejected: { eventId, code }[] }`.
- **Event envelope** (versioned):
  ```typescript
  type SyncEvent = {
    schemaVersion: 1;                                // bump on breaking changes
    eventId: string;                                 // UUID v4; also used as Idempotency-Key
    type: 'LOG_DOSE' | 'SKIP_DOSE' | 'EDIT_DOSE' | 'LOG_OUTCOME' | 'UPDATE_OUTCOME';
    payload: Record<string, unknown>;                // type-discriminated by `type`
    occurredAt: string;                              // ISO 8601 UTC
    timezone: string;                                // IANA zone, e.g. "America/Denver"
  };
  ```
- Server processes events in arrival order; rejection codes: `event_validation_failed`, `event_schema_version_unsupported`, `idempotency_key_conflict`, `protocol_not_found`, `dose_log_too_late` (server-side calendar-day enforcement).

---

## 4. Reconstitution Module (REC)

### 4.1 Calculator
- **[POST] /api/reconstitution/calculate**: `{ compoundId?, totalMg, bacWaterMl, targetDose: { value, unit: 'mcg'|'mg'|'IU' } }` → `{ concentrationMgPerMl, concentrationMcgPerMl, syringeUnitsPerDose, injectionVolMl, lowDoseUnits?, typicalDoseUnits?, highDoseUnits?, warnings: SafetyWarning[] }`. All numeric outputs returned as strings to preserve `Decimal` precision client-side.
- Safety warnings (`code`): `injection_volume_high` (> 1.5mL), `bac_water_low` (< 0.5mL), `dose_above_high_range` (compared to compound profile), `negative_value` (input validation).

### 4.2 Vial Inventory
- **[GET]  /api/reconstitution/vials**: `?status=ALL|DRY|RECONSTITUTED|EMPTY|EXPIRED&compoundId=` → `{ items: VialDto[] }`.
- **[POST] /actions/reconstitution/save-vial**: `{ compoundId, totalMg, bacWaterMl?, expiresAt?, orderItemId?, reconstitutedAt? }` → `{ vialId }`. Decimal fields accept string-serialized values.
- **[PATCH] /actions/reconstitution/update-vial**: `{ id, status?, bacWaterMl?, expiresAt? }`.
- **[DELETE] /actions/reconstitution/delete-vial**: `{ id }`. Soft-delete only if no dose logs reference; otherwise rejected with `vial_referenced_by_logs`.

---

## 5. Ordering Module (ORD)

### 5.1 Vendor Configuration
- **[GET]  /api/ordering/vendors**: → `{ items: VendorDto[] }`. Power-User-only.
- **[POST] /actions/ordering/create-vendor**: `{ name, telegramUsername, messageTemplate?, preferredCurrency }` → `{ vendorId }`. Errors: `vendor_already_exists` (unique on `(userId, telegramUsername)`).
- **[PATCH] /actions/ordering/update-vendor**: `{ id, name?, messageTemplate?, preferredCurrency?, status? }`.

### 5.2 Vendor Catalog Products
- **[GET]  /api/ordering/products**: `?vendorId=uuid&inStock=true|false` → `{ items: VendorCatalogProductDto[] }`.
- **[POST] /actions/ordering/upsert-product**: `{ vendorId, compoundId, form: 'LYOPHILIZED_POWDER'|'SOLUTION', vialSizeMg, unitPrice, currency, inStock, minimumOrderQuantity? }` → `{ productId }`.
- **[DELETE] /actions/ordering/archive-product**: `{ id }`. Soft-delete; existing OrderItem refs preserved via direct `compoundId` link.

### 5.3 Order Lifecycle
- **[GET]  /api/ordering/orders**: `?status=ALL|DRAFT|SENT|CONFIRMED|PAYMENT_SENT|RECEIVED|CANCELLED|STALE` → `{ items: OrderDto[] }`. Includes `staleFlaggedAt`, `cancelledAt`, etc.
- **[POST] /actions/ordering/create-draft**: `{ vendorId, items: OrderLineItemInput[] }` → `{ orderId }`. Duplicate `(compoundId, form, vialSizeMg)` line items merged at creation.
- **[POST] /actions/ordering/send-order**: `{ orderId }` → `{ telegramMessageId?, sendMethod: 'AUTOMATED' | 'MANUAL_FALLBACK', fallbackText?, fallbackDeepLink? }`. If MTProto send succeeds: `sendMethod = AUTOMATED`. If it fails or user explicitly chose copy/deep-link: `sendMethod = MANUAL_FALLBACK`. **Duplicate-send protection**: if an identical message text was sent to the same vendor within the last 60 seconds, returns `409 possible_duplicate_send` requiring `force: true` to retry.
- **[POST] /actions/ordering/confirm-quote**: `{ orderId, confirmedTotal, currency, walletAddress }` → `{ order }`. Status: Sent → Confirmed. Server stores the most recent prior wallet address for the same vendor for client-side comparison.
- **[POST] /actions/ordering/mark-paid**: `{ orderId, txId?, acknowledged: true }` → `{ order }`. Status: Confirmed → PaymentSent. **Safety gate**: `acknowledged` must be literally `true`; server records `paymentConfirmation.acknowledgedAt` + `acknowledgedByUserId`. Rejects if `walletAddress` is missing or empty.
- **[POST] /actions/ordering/mark-received**: `{ orderId, itemsToInventory: { orderItemId, totalMg, reconstitutedAt?, bacWaterMl? }[] }` → `{ order, vialIds: string[] }`. Status: PaymentSent → Received. Creates Vials linked to the OrderItems.
- **[POST] /actions/ordering/cancel-order**: `{ orderId, reason? }` → `{ order }`. Status: any non-terminal → Cancelled. Records `cancelledByUserId` + `cancelledAt`.

### 5.4 Order Builder Helpers
- **[GET]  /api/ordering/suggestions**: `?vendorId=uuid&horizonDays=14` → `{ items: { compoundId, daysRemaining, suggestedQuantity }[] }`. Drives the "based on your inventory" suggested-order section in the order builder.

---

## 6. Reference Module (REF)

- **[GET]  /api/reference/compounds**: `?q=search&category=&page=&limit=` → `{ items: CompoundDto[], total, hasNext }`.
- **[GET]  /api/reference/compounds/[id]**: → `{ compound, profile }`. Returns 404 `compound_not_found` if id doesn't exist; returns `200` with `profile: null` + `compound.status = "DRAFT"` for the "Profile in progress" placeholder case.

(Reference data is admin-curated; Power Users can edit via separate admin-only routes deferred to Phase 1.5 unless needed sooner.)

---

## 7. Cron Endpoints (internal, `CRON_SECRET` Bearer)

These endpoints are invoked by Railway Cron (per ADR-012). They are NOT user-facing.

- **[POST] /api/cron/dose-reminders**: every 15 minutes — resolves users whose local-time `dailyReminderTime` falls within the last 15-minute window; dispatches Push (with email fallback).
- **[POST] /api/cron/stale-orders**: daily 09:00 UTC — flags Orders in `Sent` status for ≥ 14 days as `Stale`.
- **[POST] /api/cron/audit-purge**: daily 04:00 UTC — deletes `AuditEvent` rows with `timestamp < now() - 90d`.
- **[POST] /api/cron/backup-verify**: daily 05:00 UTC — confirms last 24h DB backup; alerts via Sentry on missing.
- **[POST] /api/cron/export-cleanup**: daily 03:00 UTC — deletes R2 objects > 7 days old; nulls associated `DataExportRequest.downloadUrl`.
- **[POST] /api/cron/vial-expiry**: daily 06:00 UTC — refreshes "Expiring in N days" / "EXPIRED" computed flags surfaced on the dashboard.

All cron endpoints validate `Authorization: Bearer ${CRON_SECRET}`; non-matching → `401`.

---

## 8. Error Catalog

| Code | Status | Meaning |
|------|--------|---------|
| `validation_failed` | 400 | Payload fails Zod schema validation. `details.fields` enumerates per-field errors. |
| `unauthorized` | 401 | No valid session; user must log in. |
| `insufficient_permissions` | 403 | Managed user attempting Power-User-only action. |
| `protocol_not_found` | 404 | Referenced protocol does not exist or is deactivated. |
| `compound_not_found` | 404 | Compound id unknown. |
| `vial_referenced_by_logs` | 409 | Cannot delete Vial with referencing DoseLogs. |
| `outcome_already_logged_for_date` | 409 | An OutcomeLog already exists for this user + scheduledDate. |
| `invalid_order_transition` | 409 | e.g., marking a DRAFT as PAID. |
| `idempotency_key_conflict` | 409 | Key already used for a different payload (within 24h retention). |
| `possible_duplicate_send` | 409 | Identical Telegram message to same vendor within 60s; requires `force: true`. |
| `invite_email_exists` | 409 | Email already has an account. |
| `invite_already_pending` | 409 | An invite is already pending for this email. |
| `vendor_already_exists` | 409 | Unique (userId, telegramUsername) violation. |
| `current_password_invalid` | 400 | Returned for both password-change and email-change current-password gate failures (avoids field-leak). |
| `password_same_as_current` | 400 | New password identical to current. |
| `password_too_short` | 400 | New password < 12 chars. |
| `email_in_use` | 409 | Returned without indicating ownership. |
| `email_change_token_expired` | 410 | Verification token past 24h. |
| `email_change_token_invalid` | 400 | Token mismatch or already consumed. |
| `email_change_not_revertible` | 410 | Revert window (48h after `appliedAt`) elapsed. |
| `account_deletion_not_pending` | 409 | Cancel-deletion called outside the 48h window. |
| `dose_log_too_late` | 410 | Server-side calendar-day enforcement: log submitted past the scheduled day. |
| `mtproto_connection_error` | 503 | Telegram unreachable or session expired. |
| `mtproto_session_expired` | 401 | Auth.js session valid but Telegram session needs re-auth. |
| `audit_write_failed` | 500 | Transactional audit write failure; mutation rolled back. |
| `rate_limited` | 429 | Application-level rate limit hit. `Retry-After` header set. |

---

## 9. Rate Limits (client-facing)

Application-level rate limits (separate from external-service rate limits documented in `docs/system-architecture.md` §8.2):

| Scope | Limit | Headers on rejection |
|-------|-------|----------------------|
| Per-IP / minute (anonymous) | 60 req/min | `Retry-After: 60`, `X-RateLimit-Limit: 60` |
| Per-user / minute (authenticated) | 600 req/min | `Retry-After: <seconds>`, `X-RateLimit-Limit: 600` |
| /api/cron/* | 1 req per scheduled tick (Bearer required) | n/a (returns 401) |
| /actions/ordering/send-order | 10 req / hour / user | `Retry-After: 3600` |
| /actions/auth/reset-password-request | 5 req / hour / email | always returns 204 to avoid enumeration; silent rate-limit |
| /actions/auth/change-email-request | 3 req / day / user | `Retry-After: <seconds>` |

On rate-limit rejection: `429` with `error.code = "rate_limited"`.

---

## 10. Versioning Policy

- `schemaVersion` is a top-level field on all sync events; bump on any breaking change.
- API routes are unversioned in v1 (single deployment, one client). Breaking changes require an explicit ADR and a 30-day deprecation period announced via in-app banner.
- Server Action signatures are TypeScript-typed; client + server share the same source. Breaking changes propagate via type errors at build time.

---

## 11. Cross-References

- **Domain models**: `docs/domain-models/` — each DTO maps to a documented domain entity.
- **System architecture**: `docs/system-architecture.md` — §3 documents the user-facing flows that these endpoints implement.
- **ADRs**: ADR-004 (Auth.js), ADR-005 (GramJS / MTProto), ADR-007 (PWA + Web Push), ADR-009 (Audit), ADR-010 (AI provider), ADR-012 (Cron schedules).
- **PRD**: §5 (Feature specs map to endpoint contracts), §6 (Hard Gates → endpoint safety policies), §8.2 (Security NFRs).
