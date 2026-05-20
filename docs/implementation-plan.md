# Implementation Plan

**Status:** Draft  
**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5

---

## 1. Wave Plan Summary

| Wave | Focus | Agents | Tasks |
|------|-------|--------|-------|
| **Wave 1** | Foundation & Identity | 2 | 4 |
| **Wave 2** | Core Pillars (Ref/Tracker) | 2 | 5 |
| **Wave 3** | Ordering & MTProto | 1 | 4 |
| **Wave 4** | Scale & Intelligence | 2 | 4 |

---

## 2. Task Breakdown

### Wave 1: Foundation (Identity & Security)

#### Task 1.1: Auth.js Infrastructure & Hardening
- **Description**: Setup Auth.js v5 with standard adapter tables. Implement secure httpOnly cookies with 30-day rolling expiry.
- **Story**: US-AUT-03
- **AC**: User can register/login. Session persists across restarts. No sensitive data in client-side cookies.
- **Audit**: Log `USER_REGISTERED`, `USER_LOGGED_IN`.

#### Task 1.2: Invitations & Onboarding Flow
- **Description**: Implement `Invite` logic (72h expiry) and the multi-role onboarding wizard state machine.
- **Story**: US-ADM-01, US-AUT-01
- **AC**: Invite link sent via Resend. Power User sees 3-step wizard; Managed User sees walkthrough.

#### Task 1.3: Audit Infrastructure & Middleware
- **Description**: Implement `AuditEvent` aggregate root and a shared `withAudit` transaction helper for Server Actions.
- **Story**: PRD §8.2
- **AC**: Mutation fails if Audit write fails (Transactional). Audit events are immutable.

#### Task 1.4: Reconstitution Math (Domain)
- **Description**: Implement `Decimal`-based calculator and `WarningPolicy` for high volumes/doses.
- **Story**: US-REC-01
- **AC**: 100% branch coverage. Yellow warnings triggered for Volume > 1.5mL or BAC < 0.5mL.

---

### Wave 2: Tracker & Reference (Happy Path)

#### Task 2.1: Compound Reference & Profile
- **Description**: Implement detailed profile pages (RSC) with mechanism, administration routes, and citation links.
- **Story**: US-REF-01, US-REF-02
- **AC**: All QSC compounds seeded. PubMed links are valid. Stacking notes visible.

#### Task 2.2: Protocol Management & Lifecycle
- **Description**: Implement Protocol CRUD and state transitions (Pause, Resume, Clone, Restart).
- **Story**: US-TRK-01, US-TRK-02
- **AC**: Cloned protocol preserves dose. Paused protocols hidden from dashboard. Audit every change.

#### Task 2.3: Dose Logging & Site Rotation
- **Description**: Implement logging Server Action with site rotation logic and visual history.
- **Story**: US-TRK-03, US-TRK-04
- **AC**: Suggestions follow round-robin per route. Log displays last 7 sites used.

#### Task 2.4: PWA Sync & Offline Queue (IndexedDB)
- **Description**: Implement IndexedDB event queue and background sync replay to `/api/sync`.
- **Story**: US-AUT-05, US-TRK-03
- **AC**: Doses logged offline sync on reconnection using `idempotencyKey`.

#### Task 2.5: Reconstitution UI & Vial Persistence
- **Description**: Implement calculator UI and "Save to Inventory" action.
- **Story**: US-REC-02
- **AC**: Created vial appears on dashboard with "Low supply" badge when remaining < 10%.

---

### Wave 3: Ordering (The Moat)

#### Task 3.1: GramJS MTProto & Session Encryption
- **Description**: Implement MTProto client singleton and AES-256-GCM session storage.
- **Story**: US-ORD-01
- **AC**: Session re-linked if invalidated. Encryption key managed via env var.

#### Task 3.2: Vendor Catalog & Order Builder
- **Description**: Implement Vendor catalog management and multi-item cart builder.
- **Story**: US-ORD-03, US-ORD-06
- **AC**: Products linked to Compound catalog. Inventory-aware suggestions shown.

#### Task 3.3: Telegram Dispatch & Status Machine
- **Description**: Implement Order "Send" automation and lifecycle states (Draft -> Confirmed).
- **Story**: US-ORD-03, US-ORD-07
- **AC**: Message text archived. Automated send has manual fallback path.

#### Task 3.4: Payment Safety Gate & Receiving
- **Description**: Implement Quote Confirmation, "Mark Paid" gate, and Receiving inventory update.
- **Story**: US-ORD-04, US-ORD-05
- **AC**: **Hard Gate**: Hold-to-confirm payment after wallet verification. Receive checklist updates Vial stock.

---

### Wave 4: Scale & Intelligence

#### Task 4.1: Admin Panel & Adherence Metrics
- **Description**: Implement managed user list, deactivation logic, and 7-day adherence charts.
- **Story**: US-ADM-02, US-ADM-03
- **AC**: Power User can deactivate family accounts. Charts show Dosed vs Not Dosed days.

#### Task 4.2: Subjective Outcomes & Analytics
- **Description**: Implement daily wellbeing rating and Outcome-Dose correlation timeline.
- **Story**: US-TRK-06, US-TRK-07
- **AC**: Chart shows wellbeing line overlayed with dose bars.

#### Task 4.3: Dose Reminders (Push/Email)
- **Description**: Implement hourly cron job for reminder dispatch via Serwist (Push) or Resend (Email).
- **Story**: US-TRK-09
- **AC**: Reminders respect user timezone and set time.

#### Task 4.4: Data Portability & Deletion
- **Description**: Implement async JSON/CSV export and scheduled 48h account wipe.
- **Story**: US-AUT-02
- **AC**: Export link expires after 24h. All records scrubbed on deletion.

---

## 3. Critical Path Analysis

**Total Tasks**: 17  
**Critical Path**: 1.1 -> 1.3 -> 1.4 -> 2.2 -> 2.3 -> 2.4 -> 3.1 -> 3.3 -> 3.4  
**Estimated Effort**: 6-8 weeks (Solo) / 3-4 weeks (2 Agents)

---

## 4. Cross-Cutting Agent Rules

1. **Transactional Audit**: Every Server Action MUST use the `withAudit` helper to wrap mutations and audit writes in a single Prisma transaction.
2. **Decimal Precision**: Never use `Float` for doses or volumes.
3. **IDOR Prevention**: All DB queries must be scoped by `userId`.
4. **TDD First**: Implementation is incomplete without a passing test in `tests/acceptance/`.
