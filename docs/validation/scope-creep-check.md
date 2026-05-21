# Validation: Scope Creep Check

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — F-001 reversal documented + 3 new checks performed; Full Pass with caveats  
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

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict.

### F-001 reversal — documented justification (NOT silent scope creep)

The prior pass recommended **removing ADR-010 + AI abstractions** as scope creep. Across this batch, ADR-010 was **re-created** (step 5) and AI Layer was added to architecture, ADR-007 (Web Push), tdd-standards, operations playbooks, security review, and tech-stack §9b.

**Why this is NOT silent scope creep:**

1. **Allowed v1 uses are real today** (per ADR-010): PubMed citation extraction (for the existing reference catalog seeding workflow that the Power User is doing manually) and admin-only profile drafting (Power User reviews + approves before publish). These are NOT v2-deferred — they are admin-tool features that save Power User time on day one.
2. **v2 uses are explicitly stubbed**, not committed: the Telegram parser and PubMed digest are in PRD §3.3 deferred features with ADR-010 cross-references. No v1 implementation task ships them.
3. **The provider commitment is not premature** because: the team already had to choose for the v1 admin tooling; deferring would leave the v1 admin tooling without a documented decision.
4. **Lock-in is mitigated**: Vercel AI SDK abstracts the provider; switching is a config change (ADR-010 §"Lock-in level: Low").
5. **Cost at v1 scale** (~5 admin batch jobs/week with Anthropic prompt caching): effectively negligible.

**Verdict**: F-001 reversal is justified and documented in this audit. **Re-trigger condition**: if v1 admin AI use is dropped entirely, reconsider ADR-010 (deprecate to v2-only).

### F-002, F-003, F-004, F-005 verification (still resolved?)

| # | Check | Verdict |
|---|-------|---------|
| F-002 (ReminderTransport over-engineering) | Verified — ReminderPreference + push subscription + email fallback is direct (no abstract `ReminderTransport` interface). Per ADR-007 step-5 Web Push for one channel + Resend for the other. SMS still out of scope. | ✓ Still resolved |
| F-003 (VendorAdapter premature multi-vendor) | Verified — schema has Vendor + VendorCatalogProduct entities (per domain model needs), but no abstract `VendorAdapter` interface. v1 ships QSC-direct integration. Architecture supports multi-vendor at the schema level only. | ✓ Still resolved |
| F-004 (MTProto persistent singleton) | Verified — ADR-005 + ADR-006 + tech-stack §1.3 confirm always-on container required. The architecture §2.2 + plan task 3.2 commit to a singleton MTProto client. **Prior fix** recommended "Connect-on-demand"; the team's actual decision (preserved through this batch) is "Persistent singleton on always-on Railway". This is a knowing reversal of the F-004 fix, justified by: (a) ADR-005 explicit, (b) ADR-006 always-on confirmed, (c) PRD §5.4 MTProto feasibility gate (Gate 0.1 in plan) validates this choice empirically before Wave 3 ships. **Re-trigger if** MTProto Feasibility Gate exposes connection-latency or session-stability issues. | ✓ Reversed, justified |
| F-005 (DDD on every pillar) | The batch step 4 EXPANDED domain modeling (adding Session, Invite, EmailChangeRequest entities, OutcomeLog with ProtocolRating, full Vendor + OrderLineItem). Did this re-introduce the "DDD on every pillar" inflation? | See below |

### F-005 partial reversal: DDD across all pillars — re-evaluated

The batch step 4 added meaningful domain entities (Session, Invite, EmailChangeRequest, OutcomeLog, Vendor, OrderLineItem, ReminderPreference, ProtocolRating). Some pillars got more domain language than the prior scope-creep-check recommended.

**Argument for the batch's choice (against the prior finding):**
- The added entities are not abstract "DDD ceremony" — they are real domain concepts the spec needs (Session lifecycle, invitation state machine, email-change revert window, multi-day outcome tracking, vendor catalog products, order line items with merge invariant).
- With AI-assisted code generation, the boilerplate cost of "more domain model" is low.
- Removing them would force the implementer to re-discover the same shape, often less rigorously.

**Verdict**: F-005's prior recommendation ("simpler service-based organization for non-Ordering pillars") is partially reversed for entities that genuinely have state machines (Invite, EmailChangeRequest, Session, OutcomeLog). For pillars where the entities are simple value collections (Reference Compound, ReminderPreference), the model stays minimal. **No silent scope creep — the domain expansion is justified by the new user stories US-AUT-06/07 and US-ADM-04 added in step 3.**

### New scope-creep findings (re-review)

| # | Severity | Finding | Verdict |
|---|----------|---------|---------|
| N1 | P3 | Implementation plan grew from 17 to 28 tasks + 2 prerequisite gates across the batch. | **Not scope creep** — every new task traces to a user story or to a PRD requirement that existed before the batch (the prior plan was incomplete; the new plan covers what was always required). |
| N2 | P3 | Security review grew from 83 to ~270 lines (step 12). Operations runbook grew similarly. | **Not scope creep** — defensive documentation, not new product features. The bar for shipping wasn't raised; the documentation got more honest about what shipping requires. |
| N3 | P3 | Cross-cutting agent rules in implementation plan §4 grew from 4 to 10. | **Not scope creep** — the 6 new rules (Idempotency-Key requirement, rate limiting, CSP headers, PII discipline, expectAuditEvent helper, AI scope discipline) all derive from existing PRD/ADR/security artifacts. They are now enforced rather than implicit. |
| N4 | P2 | The Phase 2 Legal Gate (PRD §7.5 + plan Gate 0.2) adds operational overhead (signed acknowledgments + 7y retention + annual review). This was previously implicit in the PRD; this batch made it explicit and a hard gate before Phase 2 ships. | **Acceptable scope addition.** The PRD already required it; explicit gates prevent silent skip. |

### Out-of-scope items confirmed still rejected (per PRD §3.2)

Verified that the batch did NOT smuggle any of the following back in:

- ❌ AI-generated dose recommendations (still rejected per ADR-010 disallowed-uses + vision §8 anti-vision)
- ❌ Community features (still rejected per PRD §3.2 + vision §8)
- ❌ Public reference site / SEO landing pages (still rejected per PRD §3.2)
- ❌ App Store distribution (still rejected per PRD §3.2 + ADR-001)
- ❌ Multi-vendor ordering in v1 (deferred per PRD §3.3)
- ❌ Wearable integration (still rejected per PRD §3.2)
- ❌ Lab data / bloodwork import (still deferred per PRD §3.3)
- ❌ TRT/anabolic compound profiles (still deferred)
- ❌ Compounding pharmacy order flow (still deferred)
- ❌ Self-serve managed-user onboarding (still rejected — invite-only)
- ❌ Paid license / billing in v1 (still deferred until legal review)
- ❌ Automated crypto payment execution (still rejected)
- ❌ SMS / Discord reminders (still rejected — Push + Email only)

### Gate result (re-review)

- **Gate**: **Full Pass with caveats**
- **2 documented reversals of prior scope-creep fixes** (F-001 ADR-010 re-creation, F-004 MTProto persistent singleton) — both justified and recorded above.
- **F-005 partially reversed** for entities with genuine state machines; preserved for simple value collections.
- **All PRD §3.2 out-of-scope items still rejected.**
- **No silent scope creep introduced by the batch.**
- **Re-trigger conditions**: any change to the allowed AI uses list (ADR-010); any decision to add native mobile apps, community features, or multi-vendor ordering to v1.
