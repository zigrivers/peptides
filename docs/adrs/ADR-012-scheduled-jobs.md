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

## Consequences
- **Benefits**: Zero additional infrastructure cost; simple implementation via HTTP endpoints; centralized monitoring in Railway.
- **Costs**: Endpoints must be secured with a shared secret (`CRON_SECRET`); limited to periodic tasks (no fine-grained event-driven delays).
