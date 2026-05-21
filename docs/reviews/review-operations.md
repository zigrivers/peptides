# Review: Operations Runbook

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 12 new findings fixed; Full Pass  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 14 synthesized (P1: 10, P2: 3, P3: 1)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/operations-runbook.md`, `docs/system-architecture.md`, `docs/adrs/*.md`

---

## Findings by Pass

### Pass 1 — Deployment Coverage

#### Finding F-001 (P1)
- **Category:** coverage
- **Location:** Section 1: Deployment Pipeline
- **Issue:** The pipeline omits explicit "Staging" or "Preview" environment deployments. PRD §8.7 requires zero-downtime and high reliability, which is difficult to guarantee without a pre-production verification environment.
- **Impact:** Production-only bugs (e.g., MTProto session issues) may bypass CI and hit users.
- **Recommendation:** Add Section 1.2: Environment Strategy defining Staging (matching production) vs Preview (PR-based) environments on Railway.
- **Trace:** PRD §8.7

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** Section 2: Deployment Strategy
- **Issue:** Blue-Green details are vague. Missing logic for database schema compatibility during cutover.
- **Impact:** Migration-related downtime or data corruption if the new version is incompatible with the existing DB state during cutover.
- **Recommendation:** Define "Forward-only" migration rule: schema changes must be backward-compatible with the previous app version.
- **Trace:** ADR-002

### Pass 2 — Monitoring & Incident Response

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** Section 3.1: Four Golden Signals
- **Issue:** Missing alert playbooks for identified thresholds. Thresholds are defined, but the "Action" column is too high-level (e.g., "Investigate DB").
- **Impact:** Slow incident resolution; solo developer relies on memory rather than documented steps during stress.
- **Recommendation:** Add Section 4.3: Alert Playbooks with step-by-step triage for Latency, Errors, and MTProto failures.
- **Trace:** Meta-Prompt: Expected Outputs

#### Finding F-004 (P1)
- **Category:** readiness
- **Location:** Section 4.2: Rollback Trigger Conditions
- **Issue:** Missing specific "MTProto health" trigger condition. Since the app relies on a stateful singleton for ordering, session death is a critical P1 failure mode.
- **Impact:** Ordering pillar remains broken even if the container is "healthy" at the load balancer level.
- **Recommendation:** Add "MTProto session invalidation rate > 5%" as a P1 incident trigger.
- **Trace:** ADR-005

### Pass 3 — Consistency & Readiness

#### Finding F-005 (P1)
- **Category:** consistency
- **Location:** Section 5: Disaster Recovery
- **Issue:** RPO (24 Hours) contradicts the high-reliability requirement for dose logging. 24 hours of data loss could mean missing an entire daily protocol cycle for all users.
- **Impact:** Critical medical-adjacent data loss; violates user trust.
- **Recommendation:** Target 1-hour RPO using Railway's automated backup + WAL archiving if available, or document the 24-hour risk explicitly.
- **Trace:** PRD §8.1

#### Finding F-006 (P2)
- **Category:** coverage
- **Location:** Section 6: Secret Rotation
- **Issue:** Missing `NEXTAUTH_SECRET` and `CLOUDFLARE_R2_KEY` in rotation table.
- **Impact:** Security oversight in key lifecycle management.
- **Recommendation:** Add all PRD §7.3 infrastructure keys to the rotation table.
- **Trace:** ADR-014

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | RESOLVED | Added Environment Strategy (Preview, Staging) in Section 1.2. |
| F-002   | P1       | RESOLVED | Added Migration Compatibility Rule in Section 2.1. |
| F-003   | P1       | RESOLVED | Added explicit Alert Playbooks for 3 scenarios in Section 4.1. |
| F-004   | P1       | RESOLVED | Added MTProto session invalidation trigger in Section 4.2. |
| F-005   | P1       | RESOLVED | Refined RPO target to 1 hour using WAL backups (Section 5). |
| F-006   | P2       | RESOLVED | Expanded Secret Rotation table with all infra keys (Section 6). |

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict. Accounts for new requirements from steps 2-10.

### New findings + fixes

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 | §3.1 Traffic threshold "> 100 req/s" — absurdly high for a 1-50 user app per PRD §8.3. | Lowered to "> 5 req/s sustained for 5 min" with rationale referencing baseline < 1 req/s and the rate-limit table in api-contracts.md §9. |
| N2 | P1 | Missing playbook for Resend (email) failures — architecture §8.1 distinguished transactional-vs-reminder behavior but the runbook had no operational guidance. | Added Resend playbook to §4.1: transactional emails → user-facing retry CTA; reminder emails → silent fail-soft (logged, no retry, no UI); SES emergency-switch escalation if > 1h. |
| N3 | P1 | Missing playbook for AI provider failures (ADR-010). | Added AI provider playbook to §4.1: Vercel AI SDK auto-fail-over; if both providers fail, dependent features degrade gracefully; AI failures NEVER block user-facing flows; admin-only banner if > 24h. |
| N4 | P1 | Missing playbook for R2 outage — export pipeline failure surface. | Added R2 playbook to §4.1: 3× exponential backoff in the export job; pause new requests at the API with `429 + Retry-After: 3600` if sustained > 1h; existing signed URLs still valid during ingestion outage. |
| N5 | P1 | Missing playbook for cron-missed events — 7 cron jobs from ADR-012. | Added §3.3 Sentry Cron Monitoring table covering all 7 jobs with per-job severity (P0 for backup-verify; P1 for audit-purge; P3 for vial-expiry, etc.) AND added cron-missed playbook to §4.1 including the "don't back-fill dose reminders — next 15-min tick will catch" rule. |
| N6 | P1 | RPO inconsistency between operations runbook (1h) and architecture §8.4 (24h). | Added a clarifying note to §5: 1h is the target; if Railway WAL retention degrades, fall back to the 24h architecture target. Quarterly DR test cadence added. |
| N7 | P2 | §3 monitoring missed Sentry Cron Monitor wiring (ADR-012). | Added §3.3 with per-job check-in window and miss-action severity. |
| N8 | P2 | §6 Secret Rotation table missing several env vars from steps 5-7 additions. | Expanded table from 5 → 10 entries: added `CRON_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`/`PRIVATE_KEY`, `SENTRY_AUTH_TOKEN`. Renamed `TELEGRAM_KEY` → `TELEGRAM_SESSION_KEY` for clarity. Added an explicit VAPID rotation caveat (rotating orphans all push subscriptions). |
| N9 | P2 | Missing Phase 2 legal-gate operational follow-up (step-2 PRD addition). | Added playbook entry covering the 6-item checklist (PRD §7.5), where to store managed-user signed acks (R2 `legal/acks/` with 7y retention), annual review reminder. |
| N10 | P2 | §1 Pipeline Stages missing Eval gate. | Added Evals step between E2E and Deploy: `pnpm eval` with score thresholds; non-blocking on CI-failure-to-run, blocking on threshold miss. Also added explicit Lint+Typecheck + Schema-validate stages. |
| N11 | P3 | `/api/health` endpoint contract under-specified. | Defined the contract in §3.2: 200 with `{ status, checks }` body; DB connectivity gates the 200 (P0); Resend + R2 surfaced in `checks` but don't fail health (P1); Telegram + AI intentionally NOT checked (external + tolerant to transient failures). |
| N12 | P3 | No log retention / log management policy. | Added §7 Logging Policy: Pino structured JSON; PII rules (never log dose values, peptide names per user, wallet addresses, session strings, full emails); retention windows for Sentry / Railway / AuditEvent; `LOG_LEVEL=debug` is incident-only, never persistent. |

### Regressions detected (re-review)

None introduced.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **All 12 new findings fixed**
- **Re-trigger conditions**: any new external service (must add to §4.1 playbooks + §6 secret table); any new cron job (must add to §3.3 monitoring); any change to PRD §8.4 RPO/RTO numbers.
