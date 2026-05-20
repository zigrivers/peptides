# Validation: Scope Creep Check

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 14 synthesized (P1: 4, P2: 8, P3: 2)
- **Passes run:** 5 of 5
- **Artifacts checked:** All documentation, architecture, and implementation tasks.

---

## Findings by Pass

### Pass 1 — Feature Creep

#### Finding F-001 (P1)
- **Category:** creep
- **Location:** ADR-010 / System Architecture §6
- **Issue:** The architecture promotes AI infrastructure (Vercel AI SDK, Gemini selection) to an accepted stack decision for v1. AI Telegram parsing and PubMed digests are explicitly deferred to v2/Phase 3.
- **Impact:** Premature commitment to a model/SDK that may change by the time Phase 3 work begins; unnecessary infrastructure overhead in v1.
- **Recommendation:** Defer AI strategy selection until Phase 3 work starts. Remove ADR-010 and the AIModelProvider extension point.
- **Trace:** PRD §10 Phase 3

#### Finding F-002 (P2)
- **Category:** creep
- **Location:** System Architecture §6
- **Issue:** `ReminderTransport` plans extensible channels like SMS and Discord. PRD scopes only Push and Email, and explicitly lists SMS as out of scope.
- **Impact:** Over-engineering the notification layer.
- **Recommendation:** Implement direct Push/Email logic; remove the transport abstraction for v1.
- **Trace:** PRD §5.2.7, §8.6

### Pass 2 — Gold-Plating

#### Finding F-003 (P1)
- **Category:** goldplating
- **Location:** System Architecture §6
- **Issue:** `VendorAdapter` anticipates multi-vendor support. v1 is restricted to the QSC catalog only.
- **Impact:** Unnecessary abstraction layer for a single-vendor implementation.
- **Recommendation:** Implement direct QSC message formatting; introduce the adapter only when a second vendor is added in v2.
- **Trace:** PRD §10 Phase 1

#### Finding F-004 (P2)
- **Category:** inflation
- **Location:** System Architecture §2.2
- **Issue:** The persistent singleton MTProto client adds runtime lifecycle complexity (always-on state management) for a v1 use case of extremely low transaction volume (5-15 messages/month).
- **Impact:** Higher operational risk and memory usage for a task that can be handled with on-demand connections.
- **Recommendation:** Switch to "Connect-on-demand" pattern with session string reuse; add persistence only if feasibility testing proves connection latency is prohibitive.
- **Trace:** PRD §7.1, §8.1

### Pass 3 — Complexity Inflation

#### Finding F-005 (P2)
- **Category:** inflation
- **Location:** Domain Models Overview
- **Issue:** Applying full tactical DDD (Aggregates, Domain Events, Invariants) across every pillar. PRD requires module isolation for Ordering, but does not mandate DDD for simple pillars like Reference or Tracker.
- **Impact:** Excessive boilerplate for v1.
- **Recommendation:** Use simpler service-based organization for non-Ordering pillars until complexity justifies DDD patterns.
- **Trace:** PRD §7.5

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | RESOLVED | Removed ADR-010 and AI abstractions from architecture. |
| F-002   | P2       | RESOLVED | Removed `ReminderTransport` extension point. |
| F-003   | P1       | RESOLVED | Removed `VendorAdapter` extension point. |
| F-004   | P2       | RESOLVED | Switched to on-demand MTProto connection in Architecture §2.2. |
| F-005   | P2       | RESOLVED | Simplified non-Ordering domains to service-based organization. |
