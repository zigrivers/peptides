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
| **Auth** | Registration, Login, Session Mgmt | Auth.js v5 |
| **Tracker** | Dose Logging, Protocols, PWA Sync | React, TanStack Query |
| **Reminders** | Web Push & Email Notification logic | Serwist, Resend |
| **Reference** | Peptide Catalog, Profile Reference | RSC (Next.js) |
| **Ordering** | Vendor Catalog, Telegram MTProto | GramJS, Server Actions |
| **Reconstitution** | Concentration Math, Vial Inventory | lib (Typescript) |
| **Audit** | Immutable Mutation Logs | Prisma (Postgres) |
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
1. **Draft -> Sent**: Power User clicks "Send Order"; GramJS dispatches message.
2. **Sent -> Confirmed**: User receives Telegram reply, enters quoted total and wallet address in app.
3. **Confirmed -> PaymentSent**: **Hard Gate**: App displays Wallet + Amount; user verifies on screen and clicks "Mark payment sent".
4. **PaymentSent -> Received**: User confirms delivery; app prompts to add line items to Vial Inventory.
5. **Audit**: Every status transition emits a signed `AuditEvent`.

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

| Job Name | Frequency | Responsibility |
|----------|-----------|----------------|
| **Dose Reminder** | Hourly | Check for users with reminders due; dispatch Push or Email. |
| **Stale Order Checker** | Daily | Flag orders in "Sent" status > 14 days. |
| **Audit Purge** | Daily | Delete `AuditEvent` records > 90 days old. |
| **Vial Expiry Check** | Daily | Notify users of vials nearing 14-day expiry. |

---

## 7. Deployment Topology

- **Runtime**: Node.js 20 on Railway Container (Always-on for MTProto).
- **Database**: PostgreSQL 16 (Railway Managed).
- **Email**: Resend (ADR-011).
- **Storage**: Cloudflare R2 (ADR-014).
- **Monitoring**: Sentry (ADR-013).

---

## 8. Failure Modes

- **MTProto Logout**: Session invalidated; system falls back to display message + deep-link.
- **Offline Sync Conflict**: Idempotency key `user:protocol:date` wins.
- **Audit Write Failure**: Mutation rolled back via DB transaction.

---

## 9. Testing Architecture

We follow a Pyramid strategy:
- **Unit Tests (Vitest)**: Math calculations in `lib/reconstitution`, domain invariants in `lib/*/domain`.
- **Integration Tests (Vitest)**: Server Actions, repository transactions, MTProto session encryption.
- **E2E Tests (Playwright)**:
  - **Hard Gate**: Payment safety verification screen.
  - **Critical Path**: Offline dose log queuing and sync replay.
  - **Auth**: Managed user invitation and permission isolation.
