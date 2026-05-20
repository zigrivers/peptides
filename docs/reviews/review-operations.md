# Review: Operations Runbook

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
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
