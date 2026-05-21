# ADR-012: Use Railway Cron for Scheduled Jobs

## Status
Accepted

## Context
Dose reminders, stale-order detection, and audit purges require a reliable task scheduler. Next.js does not have a built-in background job processor.

## Decision
We will use Railway's native Cron scheduler to trigger API routes in the monolith for recurring tasks.

## Alternatives Considered
- **Inngest**: Excellent for complex workflows, but potentially overkill for v1.
- **BullMQ + Redis**: Adds significant operational complexity (requires Redis).
- **Upstash Workflow**: Good serverless option, but Railway Cron is already integrated into the hosting platform.

## Cron Schedules (initial)

| Job | Schedule (UTC) | Endpoint | Source ADR / PRD |
|-----|----------------|----------|------------------|
| **Dose reminder dispatch** | Every 15 minutes | `POST /api/cron/dose-reminders` | PRD §5.2.7, ADR-007 (Web Push) |
| **Stale order auto-flag** | Daily at 09:00 UTC | `POST /api/cron/stale-orders` | PRD §5.4.4 (14-day stale threshold) |
| **Audit log purge** | Daily at 04:00 UTC | `POST /api/cron/audit-purge` | ADR-009 (90-day rolling retention) |
| **Database backup verification** | Daily at 05:00 UTC | `POST /api/cron/backup-verify` | PRD §8.7 (Monitoring: backup verification) |
| **Async export cleanup** | Daily at 03:00 UTC | `POST /api/cron/export-cleanup` | ADR-014 (R2 lifecycle: expire links after 7 days) |
| **PubMed digest** (v2) | Weekly Sunday 12:00 UTC | `POST /api/cron/pubmed-digest` | ADR-010, PRD §3.3 — Phase 3 |

The "dispatch every 15 minutes" cadence for dose reminders is intentional: it lets the dispatch loop compute "who should be reminded right now" against the user's configured local time without needing a per-user wake-up timer.

All cron endpoints share the `CRON_SECRET` Bearer-token check at the edge; non-matching requests get a 401.

## Consequences
- **Benefits**: Zero additional infrastructure cost; simple implementation via HTTP endpoints; centralized monitoring in Railway. The schedule table is reviewable in one place; cron drift is detectable by inspection.
- **Costs**: Endpoints must be secured with a shared secret (`CRON_SECRET`); limited to periodic tasks (no fine-grained event-driven delays). The 15-minute dispatch cadence means a user can be reminded up to 14 minutes after their configured time — acceptable for a single daily reminder, but not for sub-minute precision.

## Traces
- PRD §5.2.7 (Dose Reminders), §5.4.4 (Order state machine — Stale auto-flag), §5.7 (Audit log retention), §8.7 (Backup verification)
- ADRs: ADR-007 (PWA + Web Push), ADR-009 (Audit log), ADR-010 (AI Strategy — PubMed digest), ADR-014 (R2 export cleanup)
