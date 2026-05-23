# Handoff — End of Autonomous Build Session (Tasks 5.1 → 6.4)

**Date:** 2026-05-23
**Branch:** `main` (all work merged)
**Last commit on main:** `c5a7479 feat(reconstitution): Task 6.4 — vial expiry background job (#43)`

---

## What shipped this session

Seven PRs merged into `main`, in order:

| PR | Task | Title | MMR rounds |
|----|------|-------|-----------|
| #37 | 5.1 | Reminder preferences + web push subscription | 2 |
| #38 | 5.2 | Dose reminder dispatch cron (15-min tick) | 4 |
| #39 | 5.3 | Outcome logging + dose×outcome correlation | 7 |
| #40 | 5.4 | AI layer (Vercel AI SDK + Anthropic + Gemini) | 5 |
| #41 | 6.1 | Account self-deletion (48h delay + immediate + cancel) | 9 |
| #42 | 6.3 | Audit purge cron + backup verify cron | 3 |
| #43 | 6.4 | Vial expiry background job | 1 |

All 7 PRs are at `verdict: degraded-pass` (Gemini + Codex green; Claude channel `auth_failed` throughout the session — known infra issue).

### High-level state

- **Wave 5 complete** (Reminders + Outcomes + AI).
- **Wave 6 complete** except R2 + signed-URL upgrade for Task 6.2 (deferred — inline-email up to 17MB still works fine at v1 scale).
- **All 28 implementation-plan tasks** that were in scope at session start are now merged.

### Things shipped in detail

- **Notifications context** (`lib/notifications/`): `ReminderPreference` CRUD, push subscription register/unregister with anti-hijack ownership check, 15-min cron dispatcher with TZ-aware local-day dedupe via CAS on `lastDispatchedAt`, partial-delivery audit modeling, lazy-init web-push + Resend.
- **Outcomes** (`lib/tracker/`): `upsertOutcome` with atomic `outcomeLog.upsert` keyed on `(userId, scheduledDate)`, per-protocol rating sub-entity with `@@unique([outcomeLogId, protocolId])`, dose×outcome correlation timeline (SVG + accessible data table).
- **AI** (`lib/ai/`): Vercel-AI-SDK orchestrator with timeout, retry-once on transient (timeout/provider error), no-retry on deterministic (invalid_schema/aborted), Anthropic→Gemini fail-over, disallowed-phrase guard for compound profile drafts. Sanitised audit metadata (no prompt content).
- **Self-deletion** (`lib/auth/application/scheduleAccountDeletion.ts`): 48h delayed + immediate + cancel flows. Refuses managed users AND users with managed accounts (prevent orphans). DELETION_PENDING users may sign in but are restricted to `/settings` via middleware (status embedded in JWT). signOut after schedule/cancel forces JWT refresh.
- **Audit purge + backup-verify** (`lib/audit/application/AuditPurgeService.ts` + `app/api/cron/backup-verify/route.ts`): chunked 90-day purge, DB-liveness backup check.
- **Vial expiry** (`lib/reconstitution/application/VialExpiryService.ts`): daily transition RECONSTITUTED → EXPIRED with VIAL_EXPIRED audit, TOCTOU defense via re-verified expiresAt in updateMany.

## What's left in `docs/implementation-plan.md`

Everything in scope at session start is now merged. The only item explicitly deferred:

- **R2 + signed-URL upgrade for Task 6.2** — current inline-email handles up to ~17 MB raw export. A future task can layer R2 + signed URL on top of `lib/auth/application/requestDataExport.ts` once exports approach that limit.

Open follow-ups embedded in plans (defer markers in their respective `plans/*.md` files):
- Task 6.1 plan has a "Deferred MMR findings" section listing one P2 (unreachable success state by design) and one P3 (manual `escapeHtml`).

## Required env vars added this session

| Var | Used by | Required for |
|-----|---------|--------------|
| `WEB_PUSH_PUBLIC_KEY` | Task 5.1 | Web push subscriptions; settings UI gracefully degrades to email-only when unset |
| `WEB_PUSH_PRIVATE_KEY` | Task 5.2 | Push send from the reminder cron; lazy-init wrapper |
| `ANTHROPIC_API_KEY` | Task 5.4 | Anthropic provider; AI features return `ai_unavailable` when unset |
| `GOOGLE_GENERATIVE_AI_API_KEY` (or `GEMINI_API_KEY`) | Task 5.4 | Gemini fallback provider |

All four are added to `.env.example` with comments. CI builds and tests pass without any of them set (lazy-init pattern from Task 4.3's Resend lesson).

## Cron routes added this session

| Path | Schedule (ADR-012) | Implementation |
|------|--------------------|----------------|
| `POST /api/cron/dose-reminders` | every 15 min | `lib/notifications/application/ReminderDispatcher.ts` |
| `POST /api/cron/audit-purge` | daily 04:00 UTC | `lib/audit/application/AuditPurgeService.ts` |
| `POST /api/cron/backup-verify` | daily 05:00 UTC | inline route — `SELECT 1` liveness check |
| `POST /api/cron/vial-expiry` | daily | `lib/reconstitution/application/VialExpiryService.ts` |

All routes share the `Authorization: Bearer ${CRON_SECRET}` guard.

## New audit actions

Added to `lib/audit/domain/AuditEvent.ts`:
- Notification: `REMINDER_PREFERENCE_UPDATED`, `PUSH_PERMISSION_STATE_CHANGED`, `PUSH_SUBSCRIPTION_REGISTERED`, `PUSH_SUBSCRIPTION_REMOVED`, `REMINDER_DISPATCHED`
- Outcomes: `OUTCOME_LOGGED`, `OUTCOME_UPDATED`, `PROTOCOL_RATED`
- AI: `AI_REQUEST_INITIATED`, `AI_REQUEST_FAILED`
- Reconstitution: `VIAL_EXPIRED`

New `Notification` AuditCategory.

## Identity-scoping exceptions added

In both `CLAUDE.md` and `AGENTS.md`:
- `PushSubscriptionRepo.findByEndpoint` (anti-hijack ownership check)
- `dispatchDoseReminders` (cron global scan)
- `purgeOldAuditEvents` (cron global scan; AuditEvent has no userId column)
- `markVialsExpired` (cron global scan)

## Known false positives logged in AGENTS.md

- `INLINE_EXPORT_MAX_BYTES = 17 * 1024 * 1024` — Codex periodically flags against an outdated Resend 10 MB limit; the value is correct.
- `AuthRepository.findByEmailForAuth` does select `status` (Task 6.1 round-9).

## Verification

```bash
# Confirm all 7 PRs merged
gh pr list --state merged --limit 8
# Last 4 commits on main
git log --oneline -8
# Local checks still pass
pnpm check
```
