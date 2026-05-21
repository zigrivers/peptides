# System Architecture

**Status:** Draft  
**Date:** 2026-05-20  
**PRD source:** `docs/plan.md`  
**ADR source:** `docs/adrs/`  
**Methodology:** deep | Depth: 5/5

---

## 1. Architectural Style: Modular Monolith

We use a modular monolith architecture built on Next.js 15. The system is organized into bounded contexts that can be isolated (ADR-015) or eventually extracted into microservices if needed.

### 1.1 Layered Structure (Per Module)
- **UI Layer**: React components (RSC or Client) in `app/`.
- **Application Layer**: Server Actions and Services in `lib/{module}/application/`.
- **Domain Layer**: Entities and business logic in `lib/{module}/domain/`.
- **Infrastructure Layer**: Persistence and external integrations in `lib/{module}/infrastructure/`.

---

## 2. Component Design

### 2.1 Component Overview

| Component | Responsibility | Tech Stack |
|-----------|----------------|------------|
| **App Shell** | PWA Layout, Navigation, Auth Guards | Next.js, shadcn/ui |
| **Auth** | Registration, Login, Session Mgmt, Password/Email change flows, Account deletion | Auth.js v5 |
| **Admin** | Managed user invitation/lifecycle, adherence dashboards | Server Actions |
| **Tracker** | Dose Logging, Protocols, Cycles, Outcome Logs, PWA Sync | React, TanStack Query |
| **Reminders** | Web Push & Email Notification logic | Serwist, Resend, Web Push |
| **Reference** | Peptide Catalog, Profile Reference | RSC (Next.js) |
| **Ordering** | Vendor + Vendor Catalog, Order lifecycle, Telegram MTProto | GramJS, Server Actions |
| **Reconstitution** | Concentration Math, Vial Inventory | lib (Typescript) |
| **Audit** | Immutable Mutation Logs (90-day rolling) | Prisma (Postgres) |
| **Export Pipeline** | Async data export → R2 → signed-URL email delivery | R2 SDK, Resend, Cron |
| **AI Layer** | Bounded AI use (PubMed citation extraction, profile drafting, v2 Telegram parser, v2 PubMed digest) | Vercel AI SDK, Anthropic, Gemini |
| **Observability** | Error tracking & Alerting | Sentry, Railway |

### 2.2 MTProto Integration Layer
The Ordering component uses an MTProto client to send messages to vendors via the user's linked Telegram account.
- **Session Manager**: Handles AES-256 encryption of GramJS session strings.
- **Message Dispatcher**: Connects on-demand to Telegram via MTProto, resolves vendor chatId, and sends the composed message.
- **Fallback UI**: Displays composed message if automation fails.

---

## 3. Data Flows

### 3.1 Flow: Log a Dose (Offline-First)
1. **User Action**: User taps "Confirm" or "Skip" on dashboard.
2. **Client Layer**:
   - Record event in IndexedDB (via Serwist).
   - If Online: Trigger background sync to `/api/sync`.
3. **Server Layer**:
   - **Case: Logged**: Validate `idempotencyKey`, decrement `Vial.remainingMg` (if vial linked), write `DoseLog`, write `AuditLog`.
   - **Case: Skipped**: Write `DoseLog` (status: Skipped), write `AuditLog`.
   - **Case: Edited**: Only allowed same calendar day; update `DoseLog`, adjust `Vial`, write `AuditLog`.

### 3.2 Flow: Place Telegram Order (Payment Safety Gate)
1. **Draft -> Sent**: Power User clicks "Send Order"; GramJS dispatches message. **Idempotency**: if an identical message was sent to the same vendor within 60s (same idempotencyKey), the second send requires explicit user confirmation.
2. **Sent -> Confirmed**: User receives Telegram reply, enters quoted total and wallet address in app. Stale-wallet warning shows the most recent vendor wallet address for comparison.
3. **Confirmed -> PaymentSent**: **Hard Gate**: App displays Wallet + Amount; user verifies on screen and clicks "Mark payment sent".
4. **PaymentSent -> Received**: User confirms delivery; app prompts to add line items to Vial Inventory.
5. **Any non-terminal -> Cancelled**: User can cancel from Order History at any time; recorded with actor + timestamp.
6. **Stale (auto-flag)**: Daily background job flags orders that have been in `Sent` for 14 days; surfaces a banner prompting the user to check Telegram or cancel.
7. **Audit**: Every status transition emits a signed `AuditEvent`.

### 3.3 Flow: Account Deletion (User-initiated)
1. **User Action**: User clicks "Delete my account" in settings.
2. **Mode select**: 48-hour delay (default) or immediate (requires double-confirm modal).
3. **Export-first**: Generates a full JSON export and emails the signed R2 download link to the user (per ADR-014).
4. **Schedule deletion**: Writes `AccountDeletionRequest` row; if delayed, the user can cancel by logging in during the 48h window.
5. **Execution**: Background job (or immediate) deletes user record + tracker/order/vial/outcome data. Audit events are PRESERVED (per ADR-009 user reference preservation policy). Telegram MTProto session is REVOKED, not exported.
6. **Audit**: `ACCOUNT_DELETION_SCHEDULED`, optional `ACCOUNT_DELETION_CANCELLED`, terminal `ACCOUNT_DELETED`.

### 3.4 Flow: Password Change (logged-in user, US-AUT-06)
1. User submits current password + new password.
2. Current-password check (bcrypt compare). Failure: same-message-as-wrong-new-password (avoid leaking which field).
3. New-password rules: ≥12 chars, must differ from current.
4. Apply: hash with bcrypt cost ≥ 12, update `auth_users.password_hash`.
5. **Session invalidation**: revoke all of the user's Sessions EXCEPT the originating session (set `revoked_at = now()`); middleware treats revoked sessions as invalid on next request.
6. **Audit**: `PASSWORD_CHANGED` + `OTHER_SESSIONS_INVALIDATED`.

### 3.5 Flow: Email Change (logged-in user, US-AUT-07)
1. User submits current password + new email.
2. Current-password check. Conflict check on new email (don't leak whether the email exists).
3. Generate `EmailChangeRequest` (24h expiry); email a verification link to the NEW address.
4. **Verify**: User clicks link → `verified_at` set, `auth_users.email` swapped, `applied_at` set, `revertible_until = now() + 48h`.
5. **Notify previous address**: send "Your email was changed" notice to the OLD address with a revert link valid for 48h.
6. **Revert (optional)**: if the old-address holder clicks revert within the window, `auth_users.email` rolls back; `EmailChangeRequest.status = Reverted`.
7. **Audit**: `EMAIL_CHANGE_REQUESTED` → `EMAIL_CHANGE_VERIFIED` → optionally `EMAIL_CHANGE_REVERTED`.

### 3.6 Flow: Managed User Invitation
1. **Admin Action**: Power User submits managed user name + email.
2. **Conflict check**: existing-account → "This email already has an account"; pending-invite → "An invite is already pending."
3. **Create Invite**: 72h expiry; generate signed token; email the invite link via Resend.
4. **Resend**: revoke prior `Invite` (status = Revoked); create a fresh one.
5. **Accept**: User clicks link → registration form pre-filled with invited email → on submit, creates a `User` row with `role = ManagedUser`, `managedBy = inviter_id`; sets `Invite.status = Accepted`, `acceptedByUserId`.
6. **Audit**: `USER_INVITED`, optional `INVITE_RESENT`, terminal `INVITE_ACCEPTED`.

### 3.7 Flow: Reminder Dispatch (15-minute tick)
1. **Cron tick**: every 15 minutes (per ADR-012), Railway Cron hits `POST /api/cron/dose-reminders` with `CRON_SECRET` Bearer token.
2. **Resolve due reminders**: query `ReminderPreference` rows where the user's local-time `dailyReminderTime` falls within the last 15-minute window (computed against the user's browser timezone captured at last login).
3. **Dispatch per user**:
   - If `pushPermissionState = Granted` AND a valid push subscription exists: send Web Push via VAPID.
   - Else (or if Push send fails): send email via Resend.
4. **Failure handling**: email failure is logged but NOT retried (silent fail-soft per US-TRK-09 AC 5). Push failure falls through to email.
5. **Audit**: `REMINDER_SENT` per successful dispatch; `REMINDER_DELIVERY_FAILED` for terminal failures.

### 3.8 Flow: Async Data Export
1. **Request**: User clicks "Export my data" in settings.
2. **Sync-or-async decision**: estimated size < 10MB → generate immediately, stream as a direct download; size ≥ 10MB → enqueue async.
3. **Async job**: background worker generates JSON + CSV bundle → uploads to R2 (per ADR-014) → generates a 7-day signed URL → emails the link via Resend (within 5 minutes per PRD §5.7).
4. **Cleanup**: daily `export-cleanup` cron (per ADR-012) deletes R2 objects > 7 days old; defense-in-depth: R2 native lifecycle policy deletes anything in `peptide-export/` > 14 days old.
5. **Audit**: `DATA_EXPORT_GENERATED`.

---

## 4. Module Structure (Bounded Context Slices)

```
/
├── app/                        # UI Layer (Next.js)
│   ├── (auth)/                 # Registration, Login, Reset
│   ├── (dashboard)/            # Main App Layout
│   │   ├── tracker/            # Tracker UI
│   │   ├── reference/          # Reference UI
│   │   └── reconstitution/     # Calculator UI
│   ├── ordering/               # Isolated Ordering UI (ADR-015)
│   ├── actions/                # Server Action Entrypoints (grouped by context)
│   │   ├── auth/
│   │   ├── tracker/
│   │   └── ordering/
│   └── api/                    # Route Handlers
│       ├── cron/               # Railway Cron Endpoints (Secured)
│       └── sync/               # PWA Sync Handler
├── lib/                        # Core Logic (Domain & Application)
│   ├── {context}/              # auth, tracker, ordering, reference, jobs, audit
│   │   ├── domain/             # Pure entities, invariants, events
│   │   ├── application/        # Use cases, service logic
│   │   └── infrastructure/     # Prisma repos, external API clients
│   ├── jobs/                   # Background job implementations
│   └── shared/                 # Common types, utils, cross-domain services
├── prisma/                     # Global Schema
└── worker/                     # Serwist Service Worker
```

---

## 5. State Management Design

- **Server State (TanStack Query)**: MTProto connection, Sync status, Adherence metrics.
- **Client UI State (React Context)**: Onboarding wizard, Ordering cart.
- **Client Persistence (IndexedDB)**: Offline dose log queue, optimistic inventory projection.

---

## 6. Scheduled Jobs (Railway Cron)

Schedules are authoritative in **ADR-012**; the table below tracks the architecture-level summary. Updates to schedules should land in ADR-012 first, then propagate here.

| Job Name | Schedule (UTC) | Responsibility | Source |
|----------|----------------|----------------|--------|
| **Dose Reminder Dispatch** | Every 15 minutes | Resolve users whose local reminder time falls within the last 15-minute window; dispatch Push or Email. | ADR-012, US-TRK-09 |
| **Stale Order Checker** | Daily 09:00 | Flag orders in "Sent" status ≥ 14 days as Stale; surface a banner in the user's Order History. | ADR-012, PRD §5.4.4 |
| **Audit Purge** | Daily 04:00 | Delete `AuditEvent` records > 90 days old. | ADR-012, ADR-009 |
| **Backup Verification** | Daily 05:00 | Verify Railway's daily DB backup completed; alert via Sentry on missing backup. | ADR-012, PRD §8.7 |
| **Export Cleanup** | Daily 03:00 | Delete R2 export objects > 7 days old; delete associated `DataExportRequest.downloadUrl`. | ADR-012, ADR-014 |
| **Vial Expiry Check** | Daily 06:00 | Surface "Expiring in N days" / "EXPIRED" badges on dashboard; no email (dashboard-only). | PRD §5.2.6 |
| **PubMed Digest** (v2) | Weekly Sunday 12:00 | Generate AI-summarized digest of new papers on subscribed compounds; email via Resend. | ADR-010, ADR-012, PRD §3.3 |

All cron endpoints share the `CRON_SECRET` Bearer-token check at the edge.

---

## 7. Deployment Topology

- **Runtime**: Node.js 20 on Railway Container (Always-on for MTProto).
- **Database**: PostgreSQL 16 (Railway Managed) — see ADR-002.
- **Email**: Resend (ADR-011) — used by invites, password reset, email change verify/notice, export delivery, reminder fallback.
- **Storage**: Cloudflare R2 (ADR-014) — async exports only.
- **Monitoring**: Sentry (ADR-013).
- **AI**: Anthropic Claude (primary), Google Gemini (secondary) — see ADR-010.
- **Cron**: Railway native scheduler (ADR-012).
- **Hosting**: Railway PaaS (ADR-006).
- **External integrations**: Telegram MTProto (GramJS, ADR-005), PubMed (read-only public, no API key required for v1 static link mode).

---

## 8. Failure Modes & External-Service Resilience

### 8.1 Failure modes

- **MTProto session logout**: Session invalidated; system falls back to display message + deep-link. User re-authenticates from settings.
- **MTProto rate limit (flood-wait)**: GramJS surfaces the rate-limit signal; sender backs off with exponential delay and surfaces the wait time to the UI. Manual fallback always remains available.
- **Offline Sync Conflict**: Idempotency key `user:protocol:scheduledDate` wins. Server is authoritative for status transitions; client retries on 5xx, gives up on 4xx (clearly user-actionable error).
- **Audit Write Failure**: Mutation rolled back via DB transaction. Failure also writes `AUDIT_WRITE_FAILURE` to Sentry (meta-event, ADR-009).
- **Resend (email) failure**: For *transactional* emails (invite, password reset, email change verify): surface error to user, allow retry. For *reminder* emails (US-TRK-09 AC 5): silent fail-soft — log the failure but do not retry and do not surface to user.
- **Web Push failure**: Fall through to email channel. Permanent push failure (e.g., subscription expired) → set `pushPermissionState = NotPrompted` and prompt the user to re-subscribe on next app open.
- **R2 unreachable**: Async export job retries up to 3× with exponential backoff (10s, 60s, 300s). After 3 failures, the `DataExportRequest.status = Failed` and the user sees a "Try again" CTA in settings. Daily Sentry alert if more than 1 export fails in 24h.
- **Cron job missed**: Sentry cron monitoring (Railway-native) alerts if a job didn't check in within its expected window. Missed dose-reminder ticks are not back-filled (acceptable — next tick will catch any user whose reminder is still pending).
- **AI provider failure**: Fall back to secondary provider (Anthropic → Gemini, or vice versa per ADR-010). If both fail, dependent feature degrades gracefully (PubMed digest skips that week; profile drafting falls back to manual entry). AI failures NEVER block user-facing dose logging, ordering, or reconstitution flows.

### 8.2 Rate limits and backoff policies

| Service | Limit (v1 expected) | Backoff policy |
|---------|---------------------|----------------|
| Telegram MTProto | Vendor-side: ≤ 1 message/minute is comfortable; flood-wait signal handled | Exponential, surfaced to UI; manual fallback always available |
| Resend | 100 emails/day on free tier; > on paid | Linear backoff on 429; user-facing retry for transactional emails |
| Cloudflare R2 | Generous; no v1 concern | Linear backoff on 429/503 |
| Anthropic Claude | Tier-1 limits; ~1000 RPM / Tier-1 | Vercel AI SDK auto-retry + provider failover (ADR-010) |
| Google Gemini | Tier-1 limits | Same as above |

---

## 9. Testing Architecture

We follow a Pyramid strategy:
- **Unit Tests (Vitest)**: Math calculations in `lib/reconstitution`, domain invariants in `lib/*/domain`.
- **Integration Tests (Vitest)**: Server Actions, repository transactions, MTProto session encryption.
- **E2E Tests (Playwright)**:
  - **Hard Gate**: Payment safety verification screen.
  - **Critical Path**: Offline dose log queuing and sync replay.
  - **Auth**: Managed user invitation and permission isolation.
