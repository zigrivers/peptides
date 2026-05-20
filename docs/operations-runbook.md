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
| **Build** | `pnpm build` | Static analysis passes; build artifacts generated. |
| **Test** | `pnpm test` & `pnpm e2e` | 100% of critical path tests pass. |
| **Deploy** | `railway up` | Container successfully starts on Railway. |
| **Verify** | `pnpm playwright test tests/e2e/smoke.spec.ts` | Production health check and core UI load in < 2s. |
| **Rollback** | `railway rollback` | Triggered automatically on Verify failure. |

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
| **Traffic** | > 100 req/s | Unexpected load. | Investigate origin (DDoS/Bots). |
| **Errors** | > 1% (5xx) | System instability. | Immediate triage via Sentry. |
| **Saturation** | > 80% CPU/RAM | Performance risk. | Scale instances / Check memory leaks. |

### 3.2 Health Check Endpoint
- **URL**: `/api/health`
- **Expected Status**: `200 OK`
- **Response Time SLA**: < 200ms
- **Failure Threshold**: 3 consecutive failures triggers instance restart.

---

## 4. Incident Response

### 4.1 Alert Playbooks
- **Latency Spike**: (1) Check Railway metrics for CPU/RAM saturation. (2) Identify slow Prisma queries via Sentry. (3) If DB related, scale Railway DB tier.
- **Error Rate Spike**: (1) Filter Sentry by `release_id`. (2) If new release, `railway rollback`. (3) If persistent, check MTProto session health.
- **Telegram Send Fail**: (1) Check `AuditLog` for session invalidation events. (2) Verify Power User session status in UI. (3) Trigger manual fallback instructions.

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
| **RPO** | 1 Hour | Maximum data loss acceptable (via Railway WAL backups). |

- **Storage**: Cloudflare R2 (Global durability).
- **Database**: Railway Managed Postgres with automated WAL archiving for point-in-time recovery.

---

## 6. Secret Rotation Procedure

| Secret | Frequency | Impact |
|--------|-----------|--------|
| `DATABASE_URL` | 6 Months | High (Triggers redeploy) |
| `RESEND_API_KEY` | 1 Year | Low |
| `NEXTAUTH_SECRET` | 1 Year | Medium (Invalidates all sessions) |
| `TELEGRAM_KEY` | On Breach | Critical (Requires re-encryption script) |
| `R2_ACCESS_KEYS` | 1 Year | Low |

**MTProto Session Rotation**: If `TELEGRAM_KEY` is rotated, run `pnpm ts-node scripts/rotate-sessions.ts` to re-encrypt session strings using the new master key before the new app version goes live.
