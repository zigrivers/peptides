# Implementation Plan

**Status:** Draft (re-issued 2026-05-20)
**Date:** 2026-05-20
**Methodology:** deep | Depth: 5/5

---

## 0. Prerequisite Gates

Before any feature task is started, the following gates MUST pass. These are not user stories — they are project preconditions.

### Gate 0.1: MTProto Feasibility (PRD §5.4)
- **Description**: validate in the target Railway runtime that (a) the MTProto auth-code flow completes successfully, (b) session storage/retrieval is reliable across container restarts, (c) message send to a real vendor chat succeeds.
- **Owner**: Power User (solo dev) — spike before Wave 3.
- **Exit criteria**: documented in `docs/decisions/mtproto-feasibility.md`. If blocker is found, fall back to "compose only" scope reduction per PRD §5.4 — do NOT ship Phase 1 incomplete.
- **Estimated effort**: 1-2 days.

### Gate 0.2: Phase 2 Legal Gate (PRD §7.5)
- **Description**: complete the 6-item checklist before Phase 2 ships (i.e., before the first managed user beyond the Power User's family is invited). Managed-user signed acknowledgments stored in R2 under `legal/acks/{userId}.pdf` with 7y retention.
- **Owner**: Power User.
- **Exit criteria**: signed checklist in `docs/decisions/phase-2-legal-gate.md`. Phase 2 tasks BLOCKED until this gate clears.
- **Estimated effort**: 1 day (self-review + optional attorney consult).

---

## 1. Wave Plan Summary

| Wave | Focus | Agents | Tasks | Estimated Effort (solo) |
|------|-------|--------|-------|-------------------------|
| **Wave 0** | Prerequisite gates | 1 | 2 | 2-3 days |
| **Wave 1** | Foundation & Identity | 2 | 6 | 2 weeks |
| **Wave 2** | Core Pillars (Ref/Tracker/Reconstitution) | 2 | 8 | 3 weeks |
| **Wave 3** | Ordering & MTProto | 1 | 5 | 2 weeks |
| **Wave 4** | Multi-user + Phase 2 gate | 2 | 5 | 2 weeks |
| **Wave 5** | Reminders + Outcomes + AI Layer | 1 | 4 | 1.5 weeks |
| **Wave 6** | Account Self-Service + Data Portability | 1 | 4 | 1 week |
| **Total** | | | **28 tasks + 2 gates** | **~12 weeks solo / 6-8 weeks with 2 agents in worktrees** |

---

## 2. Task Breakdown

### Wave 1: Foundation (Identity & Security)

#### Task 1.1: Auth.js Infrastructure & Session Hardening
- **Description**: Auth.js v5 with Prisma adapter; custom Credentials provider; bcrypt cost ≥ 12; session extension cols (`lastSeenAt`, `revokedAt`, `ipAddress`, `userAgent`) per ADR-004.
- **Stories**: US-AUT-03
- **AC**: Register/login; session persists across restarts; 30-day rolling expiry; no sensitive data in client-side cookies (httpOnly + SameSite=Strict).
- **Audit**: `USER_REGISTERED`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`.
- **Estimate**: 3 days.

#### Task 1.2: Audit Infrastructure (`withAudit` helper + `expectAuditEvent` test helper)
- **Description**: `AuditEvent` aggregate + `withAudit` transaction helper that wraps every Server Action's mutation + audit-event write in a single Prisma transaction. Shared `expectAuditEvent(...)` test helper per ADR-008 + tdd-standards §3.2.
- **Stories**: PRD §8.2; ADR-009
- **AC**: mutation fails if audit write fails (transactional rollback test). Audit events are immutable. `expectAuditEvent` used in every audit-relevant integration test.
- **Estimate**: 2 days.

#### Task 1.3: Reconstitution Math (Domain layer, pure)
- **Description**: `Decimal`-based reconstitution calculator and `WarningPolicy` for high volumes / low BAC / above-range doses. Pure functions only — no DB or UI dependencies.
- **Stories**: US-REC-01
- **AC**: 100% branch coverage (Vitest enforces); property-based test asserting `concentration × volume = totalDose`; warnings for volume > 1.5mL, BAC < 0.5mL, dose above profile high.
- **Estimate**: 2 days.
- **Note**: this task has NO upstream dependency on Auth or Audit — can run in parallel with 1.1/1.2.

#### Task 1.4: Password Lifecycle (Reset + Change-Own)
- **Description**: Implement password-reset (unauth flow with single-use 1h token) AND change-own-password (authenticated flow with session-invalidation of all other sessions).
- **Stories**: US-AUT-04, US-AUT-06
- **AC**: reset token hashed at rest; reset-request always returns 204 (no email enumeration); change-password revokes all sessions except current; field-leak prevention on `current_password_invalid` per security §3.2.
- **Audit**: `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`, `OTHER_SESSIONS_INVALIDATED`.
- **Estimate**: 2 days.

#### Task 1.5: Email Change Lifecycle (Verify + 48h Revert)
- **Description**: Implement `EmailChangeRequest` flow per US-AUT-07: current-password gate, 24h verify token at new address, applied → old-address notification with 48h revert link.
- **Stories**: US-AUT-07
- **AC**: token reuse returns 410; conflict check doesn't leak ownership; revert link valid 48h; full audit chain.
- **Estimate**: 2 days.

#### Task 1.6: Invitations + Onboarding Wizards (split per agent boundary)
- **Description**: `Invite` aggregate (72h expiry, resend revokes prior) AND multi-role onboarding wizard (3-step Power, 2-step Managed). These were combined in the prior plan; split here for agent boundary clarity but kept in the same wave (shared `Invite` entity touches both).
- **Sub-task 1.6a (Invitation backend)**: invite creation + resend + accept; admin panel hooks.
- **Sub-task 1.6b (Onboarding wizards UI)**: 3-step Power, 2-step Managed; persistent "Getting Started" checklist.
- **Stories**: US-ADM-01, US-AUT-01
- **AC**: invite link sent via Resend; 4-state model (Invited/Expired/Accepted/Revoked); resend invalidates prior.
- **Estimate**: 3 days.

---

### Wave 2: Tracker & Reference + Reconstitution UI

#### Task 2.1: Compound Reference Catalog
- **Description**: Compound + Profile + Citation RSC pages; admin-curated stacking notes; "Profile in progress" placeholder + archived-compound display per US-REF-01 ACs 5-6.
- **Stories**: US-REF-01, US-REF-02
- **AC**: all QSC compounds seeded; PubMed links validated; archived compounds shown as "[Name] (archived)"; placeholder state for incomplete profiles.
- **Estimate**: 2 days.

#### Task 2.2a: Protocol CRUD (Create + Edit)
- **Description**: Protocol create + edit Server Actions; 4 frequency types (Daily, EOD, SpecificDaysOfWeek, CustomInterval); audit on every mutation.
- **Stories**: US-TRK-01
- **AC**: validations (compound required, dose > 0); all 4 frequencies generate correct schedules; `PROTOCOL_CREATED`, `PROTOCOL_UPDATED` audit.
- **Estimate**: 2 days.

#### Task 2.2b: Protocol Lifecycle (Pause / Resume / Clone / Deactivate)
- **Description**: state-transition Server Actions; cloned protocols start as draft; deactivated protocols immediately excluded from "today's doses"; admin-initiated mid-day deactivation behavior per US-ADM-03 AC 4.
- **Stories**: US-TRK-02, US-ADM-03 AC 4
- **AC**: paused protocols hidden from dashboard; clone preserves dose; deactivated state terminal with full history preserved.
- **Estimate**: 2 days.

#### Task 2.3a: Individual Dose Logging
- **Description**: log Server Action with idempotency key per `(userId, protocolId, scheduledDate)`; Skip vs. Logged distinction; same-calendar-day editability.
- **Stories**: US-TRK-03
- **AC**: Skip recorded as separate status; insufficient inventory shown as warning (200 + warnings array per api §3.3); audit per log.
- **Estimate**: 2 days.

#### Task 2.3b: Batch "Log All Scheduled"
- **Description**: review-then-confirm batch flow per US-TRK-05; per-log deselect; vial expiry warnings inline.
- **Stories**: US-TRK-05
- **AC**: ≤ 3 taps from dashboard to all-logged; per-log deselect works; atomic batch with per-log failure reporting.
- **Estimate**: 2 days.

#### Task 2.4: Injection Site Rotation
- **Description**: round-robin per compound; 8 selectable sites filtered by route; first-dose-no-history behavior.
- **Stories**: US-TRK-04
- **AC**: per-route filtering; last-7 sites shown; user override always available.
- **Estimate**: 1 day.

#### Task 2.5: Cycle Management
- **Description**: Cycle CRUD + Restart-cycle (clones all associated protocols to new start date); scheduled breaks; current-week display on dashboard.
- **Stories**: US-TRK-08
- **AC**: cycles can group multiple protocols; restart-cycle clones protocols and preserves history; dashboard shows "Week N of M".
- **Estimate**: 2 days.

#### Task 2.6: PWA Sync & Offline Queue (IndexedDB)
- **Description**: IndexedDB event queue with per-user passphrase-derived encryption (PBKDF2-SHA256 600k iter); background-sync replay to `/api/sync`; foreground-sync fallback for iOS Safari (no Background Sync API).
- **Stories**: US-AUT-05, US-TRK-03 (offline AC)
- **AC**: doses logged offline sync on reconnection; idempotency-key prevents duplicates; iOS Safari foreground-only sync acceptable.
- **Estimate**: 4 days (complex; involves service worker + IndexedDB + crypto + multi-browser testing).

#### Task 2.7: Reconstitution UI + Vial Inventory
- **Description**: calculator UI with low/typical/high cross-check display + last-dose context line per US-REC-01 AC 4 + PRD §5.3; "Save to Inventory" creates Vial linked to optional `orderItemId`.
- **Stories**: US-REC-02, US-REC-01 (UI side)
- **AC**: created vial appears on dashboard; "Expiring in N days" / "EXPIRED" badges; "Low Inventory" badge when < 5 doses remaining.
- **Estimate**: 2 days.

#### Task 2.8: Stack Overview Dashboard
- **Description**: dashboard surfacing today's doses, current cycle week, vial inventory badges, 7-day outcome average, "Log All Scheduled" CTA.
- **Stories**: US-ANL-01
- **AC**: all active protocols visible; vial-low / vial-expiring badges render correctly; one-tap quick-log on each dose; mobile-first responsive.
- **Estimate**: 2 days.

---

### Wave 3: Ordering (The Moat)

> **Prerequisite**: Gate 0.1 (MTProto Feasibility) must have passed.

#### Task 3.1: Vendor + Vendor Catalog Management
- **Description**: Vendor aggregate (single-user-per-vendor in v1) + VendorCatalogProduct CRUD; admin UI per US-ORD-06; archive-product flow preserves order line items.
- **Stories**: US-ORD-06
- **AC**: vendor + catalog creatable from admin; archived products keep historical OrderItems valid via direct `compoundId` FK.
- **Estimate**: 2 days.

#### Task 3.2: GramJS MTProto Client + Session Encryption
- **Description**: MTProto client singleton; AES-256-GCM session storage with `TELEGRAM_SESSION_KEY` master key; auth-code setup flow; IP-mismatch heartbeat per security §3.5.
- **Stories**: US-ORD-01
- **AC**: session re-linked if invalidated; encryption key in env; session never returned in API response; manual fallback always visible.
- **Estimate**: 3 days.

#### Task 3.3: Order Builder + Send Telegram with Idempotency
- **Description**: multi-item cart; duplicate-merge invariant on `(compoundId, form, vialSizeMg)`; compose Telegram message via vendor template; send via MTProto with `sendMethod = AUTOMATED`; manual fallback (copy + deep-link) sets `sendMethod = MANUAL_FALLBACK`; 60s duplicate-send protection.
- **Stories**: US-ORD-02, US-ORD-03
- **AC**: inventory-aware suggestions; duplicate items merge; sent message archived in `telegramMessageText`; 60s duplicate-send returns `possible_duplicate_send` + requires `force: true`.
- **Estimate**: 3 days.

#### Task 3.4: Order Status State Machine + Cancel + Stale (US-ORD-07 + US-ORD-09)
- **Description**: full state machine (Draft → Sent → Confirmed → PaymentSent → Received | Cancelled | Stale); forward-only invariant except Cancel; Stale auto-flag daily cron (per ADR-012); Cancel-from-any-non-terminal; "Await Vendor Reply" state per US-ORD-09 (Sent — waiting + deep-link + capture-vendor-reply action).
- **Stories**: US-ORD-07, US-ORD-09
- **AC**: state transitions audit-logged with `oldValues`/`newValues`; Cancel records `cancelledByUserId`; Stale banner surfaces on dashboard.
- **Estimate**: 2 days.

#### Task 3.5: Payment Safety Gate + Receiving (US-ORD-04 + US-ORD-05)
- **Description**: Confirm-quote step (user enters total + wallet from vendor reply); review screen with stale-wallet warning (prior vendor address shown for comparison); Mark-Paid with `acknowledged: true` hard gate; Receive-order creates Vials linked to OrderItems.
- **Stories**: US-ORD-04, US-ORD-05
- **AC**: **Hard Gate**: Mark-Paid disabled until wallet + amount displayed AND `acknowledged: true`; stale-wallet warning shows prior address; Receive creates one Vial per OrderItem (preserving `orderItemId` link).
- **Estimate**: 3 days.

---

### Wave 4: Multi-User + Phase 2 Gate

> **Prerequisite**: Gate 0.2 (Phase 2 Legal Gate) must have passed before any task in this wave ships beyond the Power User's family circle.

#### Task 4.1: Admin Panel UI + Adherence Metrics
- **Description**: managed-user list with invite-status badges; per-user dose-history view; 7-day + 30-day adherence charts (doses-logged ÷ doses-scheduled).
- **Stories**: US-ADM-02
- **AC**: admin panel guards with role check (managed users get 403); adherence charts render dosed vs. not-dosed; mobile-responsive.
- **Estimate**: 3 days.

#### Task 4.2: Managed User Deactivation + Password Reset Trigger
- **Description**: deactivate-managed-user action with active-protocols warning; admin-triggered password-reset email per US-ADM-03 AC 2.
- **Stories**: US-ADM-03 (ACs 1-3)
- **AC**: deactivation requires Power User password re-confirm; warning shown if active protocols exist; reset email sent via Resend.
- **Estimate**: 2 days.

#### Task 4.3: Managed User Deletion with Export-First (US-ADM-04)
- **Description**: delete-managed-user flow per US-ADM-04: export to admin BEFORE any deletion side-effect; 48h-delayed-or-immediate-with-double-confirm mode; FK preservation in audit log.
- **Stories**: US-ADM-04
- **AC**: data export emailed to admin BEFORE deletion; user account + protocol/order/vial/outcome data removed; audit references preserved (no FK cascade).
- **Estimate**: 2 days.

#### Task 4.4: Ordering Module Isolation Feature Flag (US-ORD-08)
- **Description**: `DISABLE_ORDERING` env flag per ADR-015; all `/ordering/*` routes return 404/403 when set; UI hides ordering nav; tracker + reference fully functional with ordering disabled.
- **Stories**: US-ORD-08
- **AC**: feature flag toggles routes and UI; E2E test for both flag states; documented in operations §1 deployment.
- **Estimate**: 1 day.

#### Task 4.5: Phase 2 Legal Gate Completion
- **Description**: execute the 6-item checklist from PRD §7.5; capture managed-user signed acknowledgments in R2 `legal/acks/`; document in `docs/decisions/phase-2-legal-gate.md`.
- **Stories**: PRD §7.5 (gate, not a story)
- **AC**: all 6 items signed off; managed-user acks stored with 7y retention; annual review reminder set.
- **Estimate**: 1 day (self-review).

---

### Wave 5: Reminders, Outcomes, AI Layer

#### Task 5.1: Reminder Preferences + Web Push Subscription
- **Description**: ReminderPreference CRUD; service-worker push subscription registration; VAPID keys in env; push permission state tracking per ADR-007 step-5.
- **Stories**: US-TRK-09 (config side)
- **AC**: user can set daily reminder time + timezone + channel; push permission banner shown when not granted; iOS Safari install-prompt prerequisite UX.
- **Estimate**: 2 days.

#### Task 5.2: Reminder Dispatch Cron (15-minute tick)
- **Description**: `/api/cron/dose-reminders` triggered every 15 minutes by Railway Cron (per ADR-012, NOT hourly as the prior plan said); resolves users whose local time falls in the last 15-min window; dispatches Push (with email fallback per US-TRK-09 ACs 4-5).
- **Stories**: US-TRK-09 (dispatch side)
- **AC**: 15-min cadence; per-user timezone resolution; push-denied → silent fallback to email; email-failure logged but NOT retried.
- **Estimate**: 2 days.

#### Task 5.3: Subjective Outcomes + Correlation Timeline
- **Description**: OutcomeLog CRUD (one per user per scheduled day); ProtocolRating optional sub-entity; correlation timeline chart (dose events + outcome line) per US-TRK-07.
- **Stories**: US-TRK-06, US-TRK-07
- **AC**: unique `(userId, scheduledDate)` enforced at DB level; chart shows 30/90-day window; "Average outcome on dosed vs. not-dosed days" stats.
- **Estimate**: 2 days.

#### Task 5.4: AI Layer (Vercel AI SDK + Anthropic + Gemini fallback)
- **Description**: AI client wrapper per ADR-010; prompt caching (Anthropic); prompt-injection defenses (delimited untrusted input); structured-output Zod validation; provider fail-over Anthropic → Gemini. Initial use cases: PubMed citation extraction job + admin-only profile drafting.
- **Stories**: ADR-010 (no direct user story for v1)
- **AC**: every AI call wrapped with timeout + retry; AI outputs treated as untrusted (Zod-validated); AI failures NEVER block user-facing flows; one eval test per prompt in `tests/evals/`.
- **Estimate**: 3 days.

---

### Wave 6: Account Self-Service + Data Portability

#### Task 6.1: Account Deletion (48h delay + immediate + cancel-during-window)
- **Description**: schedule-deletion Server Action with mode selector (Delayed-48h | Immediate-with-double-confirm); deletion-pending banner during the 48h window; cancel-deletion action; export-first delivery.
- **Stories**: US-AUT-02
- **AC**: 48h-delay mode default; user can cancel by logging in during the window; immediate mode requires second confirmation; account deletion revokes Telegram session and audit events PRESERVE the deleted user's identity historically per ADR-009.
- **Estimate**: 2 days.

#### Task 6.2: Async Data Export Pipeline (R2 + Resend)
- **Description**: export job that generates JSON (+ CSV for dose logs and orders); uploads to R2; emails signed URL with 7-day expiry; daily cleanup cron deletes objects > 7 days old (per ADR-014).
- **Stories**: US-AUT-02 (export side); ADR-014; ADR-012
- **AC**: < 10MB exports return inline; ≥ 10MB exports go via R2 + email; cleanup cron tested; R2 native 14-day lifecycle as defense-in-depth.
- **Estimate**: 2 days.

#### Task 6.3: Audit Log Purge Cron + Backup Verify Cron
- **Description**: daily `audit-purge` job that deletes events > 90 days old (ADR-009 + ADR-012); `backup-verify` job that confirms Railway's daily DB backup completed and alerts via Sentry on miss.
- **Stories**: ADR-009, PRD §8.7
- **AC**: purge job is idempotent and safe to manually re-run; backup-verify pages on-call (P0) if backup missing.
- **Estimate**: 1 day.

#### Task 6.4: Vial Expiry + Stale Order Background Jobs
- **Description**: daily jobs to refresh "Expiring in N days" / "EXPIRED" flags on vials AND auto-flag orders in Sent ≥ 14 days as Stale (per ADR-012).
- **Stories**: US-ORD-07 (Stale side), PRD §5.2.6 (vial expiry)
- **AC**: both jobs run via Railway Cron with `CRON_SECRET` Bearer; correct timezone handling; audit events emitted for stale-flag transitions.
- **Estimate**: 1 day.

---

## 3. Critical Path Analysis

**Total tasks**: 28 (across 6 waves) + 2 prerequisite gates = 30 work items.

**Critical path** (longest dependency chain):
```
Gate 0.1 (MTProto feasibility)
  → 1.1 (Auth) + 1.2 (Audit infrastructure)
  → 1.3 (Reconstitution math, runs in parallel with 1.1/1.2)
  → 2.1 (Compound reference) + 2.7 (Reconstitution UI, depends on 1.3 + 2.1)
  → 2.2a/2.2b (Protocol CRUD + lifecycle)
  → 2.3a (Dose logging) + 2.4 (Site rotation)
  → 2.6 (PWA Sync)
  → 3.1 (Vendor) + 3.2 (MTProto client)
  → 3.3 (Order builder + send)
  → 3.4 (State machine + cancel)
  → 3.5 (Payment safety gate)
  → Gate 0.2 (Phase 2 legal gate)
  → 4.1-4.5 (Multi-user, can parallelize across 2 agents)
  → 5.x (Reminders / outcomes / AI, parallelizable)
  → 6.x (Account self-service, parallelizable with 5.x)
```

**Critical path length** (solo): ~12 weeks at 8 effective hours/day, 5 days/week, with ~30% overhead for testing + integration + revisions.

**With 2 agents in worktrees**: ~6-8 weeks. The parallelizable sections (Wave 2 multiple tasks, Wave 4 admin tasks, Wave 5 + Wave 6 independent) collapse to wall-clock time.

**Not on critical path** (can defer if schedule slips):
- Task 2.5 (Cycle Management) — defer to post-MVP if needed
- Task 2.8 (Stack Overview Dashboard) — basic version blocks dose logging UX; polish can defer
- Task 5.3 (Outcomes correlation) — Should Have, not Must Have
- Task 5.4 (AI Layer) — first use case is admin-only PubMed extraction; not user-blocking
- Task 6.2 (Async Export) — synchronous export sufficient at v1 scale; async is a Should Have

---

## 4. Cross-Cutting Agent Rules (binding)

1. **Transactional Audit**: every Server Action MUST use the `withAudit` helper to wrap mutations and audit-event writes in a single Prisma transaction. Use `expectAuditEvent(...)` in tests (per tdd-standards §3.2). Audit-failure-injection test required per Server Action.
2. **Decimal precision**: NEVER use `Float` for doses, volumes, concentrations, prices. All numeric safety-math fields are `Decimal` with explicit `@db.Decimal(precision, scale)` annotations.
3. **100% branch coverage** on `lib/reconstitution`, `lib/audit`, `lib/shared/math`. Vitest config enforces — falling below fails CI.
4. **IDOR prevention**: every DB query MUST include `where: { userId: session.user.id }` (or admin-equivalent role check for cross-user queries). The CLAUDE.md rule is binding.
5. **Idempotency**: every mutating endpoint MUST accept an `Idempotency-Key` per api-contracts §1.1. Use `idempotencyKey` UUID v4; 24h retention.
6. **TDD first**: every feature begins with a pending test skeleton in `tests/acceptance/` BEFORE implementation. Skipping an eval requires a justified comment per `.claude/rules/testing.md`.
7. **Rate limiting**: enforce the limits in api-contracts §9 (especially `/api/auth/*` 5/15min, `/actions/ordering/send-order` 10/hour, `/actions/auth/reset-password-request` 5/hour silent).
8. **CSP + security headers**: every page response includes the CSP from security-review §4.3; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; HSTS preload.
9. **PII discipline**: never log dose values, peptide names per user, wallet addresses, Telegram session strings, or full email addresses. See operations §7 logging policy.
10. **AI scope discipline**: AI is ONLY allowed for the 4 uses listed in ADR-010 §"Allowed AI uses". Any AI-generated output that affects state must go through human review (Power User approval). AI failures NEVER block user-facing dose logging, ordering, or reconstitution.

---

## 5. Story → Task Coverage Matrix

| Story | Task(s) |
|-------|---------|
| US-REF-01, US-REF-02 | 2.1 |
| US-TRK-01 | 2.2a |
| US-TRK-02 | 2.2b |
| US-TRK-03 | 2.3a + 2.6 (offline) |
| US-TRK-04 | 2.4 |
| US-TRK-05 | 2.3b |
| US-TRK-06 | 5.3 |
| US-TRK-07 | 5.3 |
| US-TRK-08 | 2.5 |
| US-TRK-09 | 5.1 + 5.2 |
| US-ANL-01 | 2.8 |
| US-REC-01 | 1.3 (math) + 2.7 (UI) |
| US-REC-02 | 2.7 |
| US-ORD-01 | 3.2 |
| US-ORD-02 | 3.3 (suggestions inline) |
| US-ORD-03 | 3.3 |
| US-ORD-04 | 3.5 |
| US-ORD-05 | 3.5 |
| US-ORD-06 | 3.1 |
| US-ORD-07 | 3.4 + 6.4 (stale cron) |
| US-ORD-08 | 4.4 |
| US-ORD-09 | 3.4 (await-vendor-reply state included) |
| US-ADM-01 | 1.6 |
| US-ADM-02 | 4.1 |
| US-ADM-03 | 4.2 + 2.2b (AC 4 mid-day deactivation) |
| US-ADM-04 | 4.3 |
| US-AUT-01 | 1.6 |
| US-AUT-02 | 6.1 + 6.2 |
| US-AUT-03 | 1.1 |
| US-AUT-04 | 1.4 |
| US-AUT-05 | 2.6 |
| US-AUT-06 | 1.4 |
| US-AUT-07 | 1.5 |

**All 30 user stories now have at least one implementation task.**

---

## 6. Cross-References

- **Stories**: `docs/user-stories.md` (30 stories).
- **PRD**: `docs/plan.md` (§5 features, §6 success criteria, §7.5 legal gates).
- **Domain models**: `docs/domain-models/` — each task touches at least one bounded context.
- **API contracts**: `docs/api-contracts.md` — each task implements specific endpoint contracts.
- **ADRs**: 1-15 — implementation must respect every accepted ADR.
- **Architecture**: `docs/system-architecture.md` (especially §3 data flows that map directly to tasks).
- **Operations**: `docs/operations-runbook.md` (§1 pipeline; §3.3 cron monitoring; §6 secrets that tasks may introduce).
- **Testing**: `docs/tdd-standards.md` (§8 invariant matrix maps to per-task test requirements).
- **Security**: `docs/security-review.md` (§4.3 binding CSP; §8 OWASP coverage).
- **Lessons**: `tasks/lessons.md` (append on PR completion per CLAUDE.md workflow step 9).
