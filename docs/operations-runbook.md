# Operations Runbook

**Status:** Draft  
**Date:** 2026-05-20  
**System Architecture source:** `docs/system-architecture.md`  
**ADR source:** `docs/adrs/`  
**Methodology:** deep | Depth: 5/5

---

## 1. Deployment Pipeline & Environment Strategy

### 1.1 Pipeline Stages
| Stage | Action | Success Criteria |
|-------|--------|------------------|
| **Lint + Typecheck** | `pnpm lint && pnpm typecheck` | No errors |
| **Build** | `pnpm build` | Next.js build + Prisma generate succeed |
| **Schema validate** | `pnpm prisma validate` | Prisma schema parses |
| **Test (unit + integration)** | `pnpm test` | 100% pass; coverage thresholds met (100% branch on safety-critical modules per ADR-008) |
| **E2E** | `pnpm e2e` | All critical-path tests pass on chromium + webkit-iPhone viewport |
| **Evals** | `pnpm eval` | Score ≥ defined threshold per eval; non-blocking on CI failure-to-run, blocking on threshold miss |
| **Deploy** | `railway up` | Container successfully starts on Railway |
| **Verify** | `pnpm playwright test tests/e2e/smoke.spec.ts --env=production` | Production health check + critical paths green in < 2s page load |
| **Rollback** | `railway rollback` | Triggered automatically on Verify failure |

### 1.2 Environment Strategy
- **Preview**: Spin up ephemeral Railway environments for every PR. Used for automated E2E and visual review.
- **Staging**: Always-on environment matching production specs. Target for `main` branch before production cutover.
- **Production**: User-facing environment. Restricted access; only automated deployments from `Staging` verification.

---

## 2. Deployment Strategy: Blue-Green

We use Railway's built-in deployment management for zero-downtime cutover.

### 2.1 Migration Compatibility Rule
**Forward-Only Migrations**: All schema changes must be backward-compatible with the *previous* version of the application.
- **Rule**: Never drop a column or rename a table in a single step. 
- **Process**: Add new field -> Deploy -> Migrate Data -> Deploy -> Remove old field.

---

## 3. Monitoring & Alerting

### 3.1 Four Golden Signals
| Metric | Threshold (P95) | Rationale | Action |
|--------|-----------------|-----------|--------|
| **Latency** | > 1.5s | User frustration limit. | Check DB query plan / Slow RSCs. |
| **Traffic** | > 5 req/s sustained for 5 min | Unexpected load. Project target is 1-50 users (PRD §8.3); normal baseline < 1 req/s. Sustained > 5 req/s suggests a bot, scraper, or misbehaving client. | Investigate origin (Sentry IP analysis); rate-limit per §9 of api-contracts.md. |
| **Errors** | > 1% (5xx) | System instability. | Immediate triage via Sentry. |
| **Saturation** | > 80% CPU/RAM | Performance risk. | Scale instances / Check memory leaks. |

### 3.2 Health Check Endpoint
- **URL**: `/api/health`
- **Expected Status**: `200 OK` with body `{ "status": "ok", "checks": { ... } }`.
- **What it checks**: (1) DB connectivity via `SELECT 1` (P0 — gates the 200); (2) Resend API reachability via a no-op auth check (P1 — surfaced in `checks.resend`, does not fail the health probe); (3) R2 connectivity via a HEAD on the bucket (P1 — surfaced in `checks.r2`). Telegram and AI providers are NOT checked here — they're external and intentionally tolerant to transient failures.
- **Response Time SLA**: < 200ms.
- **Failure Threshold**: 3 consecutive failures (status != 200 or DB check fails) triggers instance restart via Railway.

### 3.3 Sentry Cron Monitoring

All 6 (Phase 1) + 1 (Phase 3) cron jobs registered in ADR-012 are monitored by Sentry Cron Monitors. Each job declares its schedule; missing a check-in within the expected window triggers a P1 alert.

| Job | Expected check-in window | Action on miss |
|-----|--------------------------|----------------|
| Dose reminder dispatch | Every 15 min ± 5 min | P1 alert; check Railway Cron logs + Resend status |
| Stale order auto-flag | Daily ± 1 hour | P2 alert; check job logs |
| Audit purge | Daily ± 1 hour | P1 alert (regulatory implications); investigate immediately |
| Backup verify | Daily ± 1 hour | P0 alert (no backup = no DR); page on-call |
| Export cleanup | Daily ± 1 hour | P3 alert; non-urgent |
| Vial expiry | Daily ± 1 hour | P3 alert; non-urgent |
| PubMed digest (v2) | Weekly ± 6 hours | P3 alert; reschedule manually if needed |

---

## 4. Incident Response

### 4.1 Alert Playbooks
- **Latency Spike**: (1) Check Railway metrics for CPU/RAM saturation. (2) Identify slow Prisma queries via Sentry. (3) If DB related, scale Railway DB tier or add an index.
- **Error Rate Spike**: (1) Filter Sentry by `release_id`. (2) If new release, `railway rollback`. (3) If persistent, check MTProto session health + Resend status + AI provider status.
- **Telegram Send Fail**: (1) Check `AuditEvent` for `TELEGRAM_SESSION_REVOKED` events. (2) Verify Power User session status in UI. (3) Surface manual-fallback instructions to the user. (4) If the failure is rate-limit related (flood-wait), back off per architecture §8.2.
- **Resend (email) failure**: (1) Check Resend status page + Sentry for HTTP-error patterns. (2) For *transactional* emails (invite, password reset, email-change verify, export delivery): surface a "Try again" CTA in the user UI; allow retry. (3) For *reminder* emails (US-TRK-09 fail-soft): no user-facing action — failure is silent by design; log only. (4) If sustained > 1h, evaluate emergency switch to SES per ADR-011 alternatives.
- **R2 (object storage) outage**: (1) Check Cloudflare status page. (2) Async export pipeline (per architecture §3.8) auto-retries 3× with exponential backoff. (3) If sustained > 1h: pause new export requests at the API layer with `429 rate_limited` + `Retry-After: 3600`. (4) User-facing message: "Exports are temporarily unavailable — try again in 1 hour." (5) Existing signed URLs remain valid for their 7-day window even when R2 ingestion is down.
- **AI provider failure (Anthropic + Gemini)**: (1) Vercel AI SDK auto-fails-over per ADR-010 (Anthropic → Gemini and vice versa). (2) If BOTH fail: dependent features degrade gracefully — PubMed digest skips that week; profile drafting falls back to manual entry. (3) AI failures NEVER block user-facing dose logging, ordering, or reconstitution flows (per ADR-010). (4) If sustained > 24h with both providers: surface a banner on admin pages — "AI features temporarily disabled." Do NOT surface to managed users.
- **Cron job missed (any of 7 jobs)**: (1) Sentry Cron Monitor fires P0/P1/P2/P3 per §3.3. (2) Check Railway Cron dashboard for the missed run timestamp. (3) For dose reminders specifically — DO NOT back-fill the missed reminders; the next tick (within 15 min) will catch any user whose reminder is still pending. (4) For audit purge — manual run is safe and idempotent: `pnpm tsx scripts/audit-purge.ts`. (5) For backup verify — page on-call immediately; verify the latest backup manually via Railway dashboard.
- **Phase 2 legal-gate operational follow-up** (post-ship): if the Phase 2 launch milestone is hit and managed users are created, ensure: (a) PRD §7.5 6-item checklist is signed off and stored in `docs/decisions/phase-2-legal-gate.md`; (b) the managed-user signed-acknowledgment artifacts are stored in R2 under `legal/acks/{userId}.pdf` with 7-year retention; (c) annual review reminder is set.

### 4.2 Rollback Trigger Conditions
**Automatic Rollback**:
- `Verify` stage smoke tests fail.
- Health check endpoint returns `503` for > 60 seconds post-deploy.

**Manual Rollback (P0/P1)**:
- 5xx error rate > 5% for > 5 minutes.
- MTProto session invalidation rate > 5% (Mass logouts).
- Safety-critical math regression reported.

---

## 5. Disaster Recovery (DR)

| Metric | Target | Description |
|--------|--------|-------------|
| **RTO** | 4 Hours | Maximum time to restore service. |
| **RPO** | 1 Hour | Maximum data loss acceptable (via Railway WAL archiving). **Note:** PRD §8.4 originally stated 24h; this runbook tightens to 1h. WAL archiving makes 1h achievable; if Railway's WAL retention degrades, fall back to the 24h target documented in PRD §8.4 and update this row. |

- **Storage**: Cloudflare R2 (Global durability; 11-9s durability tier).
- **Database**: Railway Managed Postgres with automated WAL archiving for point-in-time recovery.
- **DR test cadence**: quarterly — restore the most recent backup to a staging instance, run E2E smoke tests, document RTO actual.

---

## 6. Secret Rotation Procedure

| Secret | Frequency | Impact | Notes |
|--------|-----------|--------|-------|
| `DATABASE_URL` | 6 months | High | Triggers redeploy; coordinate with maintenance window |
| `RESEND_API_KEY` | 1 year | Low | New key in env, redeploy; old key remains valid for 24h |
| `NEXTAUTH_SECRET` | 1 year | Medium | **Invalidates all sessions**; coordinate with low-traffic window; users must re-login |
| `TELEGRAM_SESSION_KEY` (AES-256 master) | On breach only | **Critical** | Re-encrypts every stored MTProto session — see migration script below |
| `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` | 1 year | Low | Rotate as a pair; signed-URL grace period covers in-flight downloads |
| `CRON_SECRET` | 6 months | Medium | All cron endpoints reject 401 with old token; coordinate with Railway Cron config update |
| `ANTHROPIC_API_KEY` | 1 year | Low | AI fail-over to Gemini covers gap during rotation |
| `GEMINI_API_KEY` | 1 year | Low | Same fail-over coverage |
| `WEB_PUSH_VAPID_PUBLIC_KEY` + `WEB_PUSH_VAPID_PRIVATE_KEY` | Never rotated routinely | Critical | Rotating invalidates ALL push subscriptions; users must re-subscribe. Rotate only on breach. |
| `SENTRY_AUTH_TOKEN` | 1 year | Low | Build-time only; no runtime impact |

**MTProto Session Rotation Script**: If `TELEGRAM_SESSION_KEY` is rotated, run `pnpm tsx scripts/rotate-sessions.ts` to re-encrypt every stored session string using the new master key before the new app version goes live. The script reads `TELEGRAM_SESSION_KEY_OLD` and `TELEGRAM_SESSION_KEY_NEW` from env, decrypts each row's `sessionString` with the old key, re-encrypts with the new, and writes back in a single transaction.

**VAPID rotation caveat**: VAPID public/private key pairs identify the SERVER to push services. If they are rotated, all existing push subscriptions become orphaned (push services will reject pushes signed with the new keys for subscriptions issued under the old keys). For this reason VAPID keys are NEVER rotated routinely — only on confirmed breach. If rotation is required: deploy new keys, then have the client UX prompt every user to re-subscribe on next login. Set `pushPermissionState = NOT_PROMPTED` for all users to trigger re-prompt.

---

## 7. Logging Policy

- **Structured logging**: all application logs use Pino with JSON output. Pino + Sentry capture.
- **PII / health-adjacent data**: NEVER log dose values, peptide names per user, wallet addresses, Telegram session strings, or full email addresses. Hash emails to first-3 + domain for log correlation if needed.
- **Log retention**:
  - Sentry: 30 days for free tier; 90 days on paid tier (current default).
  - Railway log stream: 7 days.
  - Application audit log in DB (`AuditEvent`): 90 days (per ADR-009).
- **Log levels in production**: `info` baseline; `debug` only enabled temporarily via env-var `LOG_LEVEL=debug` for incident triage (NEVER persistent due to PII risk).
