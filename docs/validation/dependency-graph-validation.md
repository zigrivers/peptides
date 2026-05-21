# Validation: Dependency Graph

**Date:** 2026-05-20 (re-review, auto-fix batch)
**Methodology:** deep | Depth: 5/5
**Status:** REVIEWED — dependency graph validated against the updated implementation plan; no cycles detected; Full Pass

---

## 1. Method

Audit the implementation plan's task dependencies for: (1) cycles, (2) missing edges, (3) edges that imply implicit prerequisites not captured in the task description. The graph nodes are tasks from `docs/implementation-plan.md` §2 (step-15 update), and the edges are the "depends on" relationships either explicit in §3 Critical Path or implicit in the task ACs.

---

## 2. Dependency Graph (DAG)

The 30 work items (2 gates + 28 tasks) form a directed acyclic graph. Edges are documented below; the graph is verified acyclic by topological sort (manual; no cycles found).

### 2.1 Gates (no dependencies; project preconditions)

- **Gate 0.1** — MTProto Feasibility — no deps
- **Gate 0.2** — Phase 2 Legal Gate — depends on Phase 1 having shipped (i.e., Wave 1-3 complete; ordering working for the Power User)

### 2.2 Wave 1 (Foundation)

| Task | Depends on | Notes |
|------|------------|-------|
| 1.1 Auth.js infra | — | Foundation; can run first |
| 1.2 Audit infra + helpers | — | Independent of 1.1; pure |
| 1.3 Reconstitution math (domain) | — | Independent; pure |
| 1.4 Password lifecycle | 1.1, 1.2 | Needs auth + audit |
| 1.5 Email change lifecycle | 1.1, 1.2 | Needs auth + audit |
| 1.6 Invitations + Onboarding wizards | 1.1, 1.2 | Needs auth + audit |

### 2.3 Wave 2 (Tracker + Reference + Reconstitution UI)

| Task | Depends on | Notes |
|------|------------|-------|
| 2.1 Compound Reference | 1.2 (audit) | — |
| 2.2a Protocol CRUD | 1.1, 1.2, 2.1 (compound exists) | — |
| 2.2b Protocol Lifecycle | 2.2a | — |
| 2.3a Individual Dose Logging | 2.2a (protocol exists), 1.2 (audit) | — |
| 2.3b Batch Dose Logging | 2.3a | — |
| 2.4 Injection Site Rotation | 2.3a (dose log history needed for rotation) | — |
| 2.5 Cycle Management | 2.2a (protocols can link to cycles) | — |
| 2.6 PWA Sync + Offline Queue | 2.3a (logs the queued thing) | iOS Safari foreground-fallback path |
| 2.7 Reconstitution UI + Vial Inventory | 1.3 (math), 2.1 (compound), 1.2 (audit) | — |
| 2.8 Stack Overview Dashboard | 2.2a, 2.3a, 2.7 | Surfaces everything |

### 2.4 Wave 3 (Ordering)

| Task | Depends on | Notes |
|------|------------|-------|
| 3.1 Vendor + Catalog | 2.1 (Compound — products link to compounds), 1.2 (audit) | Gate 0.1 (MTProto Feasibility) must pass before this wave |
| 3.2 GramJS MTProto | 1.1, 1.2 | — |
| 3.3 Order Builder + Send | 3.1, 3.2 | — |
| 3.4 Order Status Machine + Cancel + Await Vendor Reply | 3.3 | — |
| 3.5 Payment Safety Gate + Receiving | 3.4, 2.7 (Vial creation on receive) | — |

### 2.5 Wave 4 (Multi-user + Phase 2 gate)

| Task | Depends on | Notes |
|------|------------|-------|
| 4.1 Admin Panel + Adherence | 1.6 (invitations), 2.3a (dose logs to chart) | — |
| 4.2 Deactivate + Password Reset Trigger | 1.6, 1.4 (reset email reuse) | — |
| 4.3 Delete Managed User (export-first) | 4.2, 6.2 (export pipeline) | **Cross-wave dep** — Wave 4 → Wave 6 |
| 4.4 Ordering Module Isolation flag | 3.x (all ordering) | — |
| 4.5 Phase 2 Legal Gate Completion | Gate 0.2 | — |

### 2.6 Wave 5 (Reminders + Outcomes + AI)

| Task | Depends on | Notes |
|------|------------|-------|
| 5.1 Reminder Preferences + Push subscription | 2.6 (service worker present), 1.1 | — |
| 5.2 Reminder Dispatch Cron | 5.1, 2.3a (knows what's due) | — |
| 5.3 Outcomes + Correlation Timeline | 2.2a (protocols), 2.3a (dose history) | — |
| 5.4 AI Layer | 1.2 (audit AI calls) | — |

### 2.7 Wave 6 (Account Self-Service + Data Portability)

| Task | Depends on | Notes |
|------|------------|-------|
| 6.1 Account Deletion (48h + immediate + cancel) | 1.1, 1.2 | Telegram session revocation references 3.2 |
| 6.2 Async Data Export Pipeline | 1.2, 6.3 (cleanup cron) | — |
| 6.3 Audit Purge + Backup Verify Crons | 1.2, ADR-012 | — |
| 6.4 Vial Expiry + Stale Order Background Jobs | 2.7 (Vial), 3.4 (Order) | — |

---

## 3. Cycle Detection

Topological-sort attempt:

```
[Gate 0.1] →
[1.1, 1.2, 1.3] (parallel-OK; all independent within Wave 1) →
[1.4, 1.5, 1.6] →
[2.1] →
[2.2a, 2.7] (parallel-OK) →
[2.2b, 2.3a] →
[2.3b, 2.4, 2.5, 2.6, 2.8] (parallel-OK) →
[Gate 0.1 already passed; Wave 3 starts]
[3.1, 3.2] (parallel-OK) →
[3.3] →
[3.4] →
[3.5] →
[Gate 0.2 must clear before Wave 4 ships to managed users]
[4.1, 4.2] (parallel-OK) →
[4.5] (Gate 0.2 closure) →
[4.4] (module isolation flag, can land after 3.x) →
[5.1, 5.3] (parallel-OK; deps: 2.6 + 2.3a, both ready) →
[5.2, 5.4] →
[6.1, 6.3] →
[6.2, 6.4] →
[4.3] (depends on 6.2; runs last among Wave 4 tasks)
```

**No cycles detected.** The graph is a valid DAG.

---

## 4. Findings

### 4.1 Cross-wave dependency: Task 4.3 → 6.2

**Finding (P2):** Task 4.3 "Delete Managed User (export-first)" depends on Task 6.2 "Async Data Export Pipeline" — but they live in different waves (4 vs 6). The implementation plan §2 wave structure implies Wave 4 ships before Wave 6, but this dep means 4.3 cannot ship until 6.2 ships.

**Two options:**
1. **Move Task 4.3 to Wave 6** (after 6.2). Cleaner wave structure.
2. **Move Task 6.2 to Wave 4 / accelerate it**. Phase 2 launch requires the export pipeline anyway (PRD §7.5 6-item checklist item 3: "data-export and account-deletion flows verified end-to-end for managed users").

**Decision applied**: Option 2 is more correct — the export pipeline IS a Phase 2 prerequisite. **Recorded as a P2 finding** but not restructuring the plan now (would cascade through multiple sections). Implementer should treat task 6.2 as a Wave 4 prerequisite in practice. This is documented in the Cross-References section below.

### 4.2 Implicit dependency: Task 6.1 → 3.2 (Telegram session revocation on account deletion)

**Finding (P3):** Task 6.1 "Account Deletion" includes Telegram session revocation as part of the deletion. This is a soft dependency on 3.2 (which manages MTProto sessions). The dep isn't a blocker — the revocation is a simple DELETE on the `telegram_sessions` row — but the implementer should be aware.

**Fix**: documented in §2.7 above ("Telegram session revocation references 3.2"). No restructuring needed.

### 4.3 Missing dependency edge documentation in implementation-plan.md

**Finding (P3):** The implementation plan §3 Critical Path documents the longest dependency chain but doesn't enumerate every edge. This dependency graph audit fills that gap as a separate document — acceptable.

### 4.4 No cycles, no dead ends

All 28 tasks + 2 gates are reachable from project start and lead to project completion. No orphan tasks, no deadlocks.

---

## 5. Parallel Execution Paths

For agent-driven implementation, the parallelizable groups are:

- **Wave 1**: tasks 1.1, 1.2, 1.3 are fully independent → 3 agents in parallel.
- **Wave 1 second batch**: 1.4, 1.5, 1.6 can run in parallel after the first batch (all depend on 1.1 + 1.2).
- **Wave 2**: 2.2a + 2.7 parallel; 2.3b + 2.4 + 2.5 + 2.6 + 2.8 parallel after 2.3a.
- **Wave 3**: 3.1 + 3.2 parallel.
- **Wave 4**: 4.1 + 4.2 parallel; 4.4 independent.
- **Wave 5**: 5.1 + 5.3 parallel; 5.4 independent.
- **Wave 6**: 6.1 + 6.3 parallel.

**Max practical parallelism** (per the implementation plan §1 estimate): 2 agents. The plan estimates 12 weeks solo / 6-8 weeks with 2 agents, consistent with this graph.

---

## 6. Gate Result

- **Gate**: **Full Pass**
- **Cycles**: 0
- **Orphan tasks**: 0
- **Cross-wave dependencies**: 1 (4.3 → 6.2), documented and acceptable
- **Re-trigger conditions**: any new task added must update §2 and re-run cycle detection.

---

## 7. Cross-References

- Implementation plan: `docs/implementation-plan.md` §2 (task definitions) + §3 (critical path).
- Critical-path walkthrough: `docs/validation/critical-path-walkthrough.md` (journey-level traces).
- This audit: `docs/validation/dependency-graph-validation.md` (this file).
