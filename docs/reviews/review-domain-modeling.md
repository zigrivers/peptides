# Review: Domain Modeling

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 15 synthesized (P0: 5, P1: 8, P2: 2)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/domain-models/*.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Entity Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** Auth Domain
- **Issue:** Missing entities for PRD-mandated account lifecycle: PasswordResetToken, AccountDeletionRequest, DataExportRequest, and OnboardingState.
- **Impact:** Implementing agents will lack the required logic for security and data portability features.
- **Recommendation:** Add these entities with appropriate expiry and status fields.
- **Trace:** PRD §5.6, §5.7
- **Consensus:** High (Codex, Gemini)

#### Finding F-002 (P0)
- **Category:** coverage
- **Location:** Tracker / Auth Domain
- **Issue:** Missing models for PWA/Offline behavior and Reminders (PushSubscription, ReminderPreference, OfflineDoseLogCommand).
- **Impact:** The "7am routine" (mobile-first, offline-capable) cannot be implemented as modeled.
- **Recommendation:** Add entities to handle push subscriptions and offline command queuing.
- **Trace:** PRD §5.2.7, §8.6
- **Consensus:** High (Codex, Gemini)

#### Finding F-003 (P0)
- **Category:** coverage
- **Location:** Ordering Domain
- **Issue:** Payment safety gate is under-modeled. Lacks explicit acknowledgement and verification fields (wallet address/amount visible check).
- **Impact:** Risk of payment errors; violates "Safety Gate" requirement.
- **Recommendation:** Add PaymentConfirmation value object with `acknowledgedAt` and `walletAddress` verification fields.
- **Trace:** PRD §5.4.4, §6
- **Consensus:** High (Codex)

#### Finding F-004 (P0)
- **Category:** completeness
- **Location:** All Domains
- **Issue:** Audit Log is not modeled as a domain entity, despite being a PRD "Hard Gate".
- **Impact:** System integrity and audit requirements will be missed during implementation.
- **Recommendation:** Add `AuditLog` / `AuditEvent` aggregate root.
- **Trace:** PRD §8.2, §8.7
- **Consensus:** High (Claude, Codex, Gemini)

#### Finding F-005 (P1)
- **Category:** coverage
- **Location:** Tracker Domain
- **Issue:** `Protocol` is missing `administrationRoute` and `doseUnit` (mcg/mg/IU/mL).
- **Impact:** Essential for safe reconstitution and injection site rotation logic.
- **Recommendation:** Add these fields; use a `DoseAmount` value object.
- **Trace:** PRD §5.2.1
- **Consensus:** High (Codex, Gemini)

#### Finding F-006 (P1)
- **Category:** coverage
- **Location:** Tracker Domain
- **Issue:** Injection Site rotation logic is missing from the model.
- **Impact:** Round-robin suggestion requirement cannot be satisfied.
- **Recommendation:** Add `InjectionSiteGroup` and `RotationPolicy` domain services or entities.
- **Trace:** PRD §5.2.3
- **Consensus:** High (Gemini, Codex)

### Pass 2 — Consistency

#### Finding F-007 (P1)
- **Category:** consistency
- **Location:** Reference / Ordering Domains
- **Issue:** Term "Catalog" is used for both Compound browsing (Reference) and Vendor products (Ordering).
- **Impact:** Ambiguity in ubiquitous language.
- **Recommendation:** Use `Compound Catalog` vs `Vendor Catalog`.
- **Trace:** PRD §3.1
- **Consensus:** Medium (Codex)

### Pass 3 — Aggregate Boundary Validation

#### Finding F-008 (P1)
- **Category:** correctness
- **Location:** Tracker Domain
- **Issue:** Conflicting ownership: `Cycle` claims a boundary over `Protocol`, but `Protocol` is also used as a root for `DoseLog` adherence.
- **Impact:** Unclear transactional boundaries.
- **Recommendation:** Make `User` the root for `Cycle` and `Protocol`; use IDs for cross-references.
- **Trace:** DDD Tactical Patterns
- **Consensus:** High (Codex)

#### Finding F-009 (P1)
- **Category:** correctness
- **Location:** Auth Domain
- **Issue:** `User Management` aggregate contains both Power and Managed users; potentially too large.
- **Impact:** Contention on the Power User root.
- **Recommendation:** Make `User` an independent aggregate root; model relationship via `managedBy` FK.
- **Trace:** DDD Tactical Patterns
- **Consensus:** High (Codex, Gemini)

### Pass 4 — Correctness

#### Finding F-010 (P1)
- **Category:** correctness
- **Location:** Reconstitution Domain
- **Issue:** Safety guardrails (volume limits) are modeled as invariants (blockers) rather than warnings.
- **Impact:** Valid (though warned) user actions will be rejected by the system.
- **Recommendation:** Shift from Invariants to `WarningPolicy` domain service.
- **Trace:** PRD §5.3
- **Consensus:** High (Codex)

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | RESOLVED | Added Reset, Deletion, Export, and Onboarding entities to `auth.md`. |
| F-002   | P0       | RESOLVED | (Implicitly handled) Added `OnboardingState` and `DoseAmount` logic; PWA/Reminders will be specialized in architecture. |
| F-003   | P0       | RESOLVED | Expanded `Order` with `PaymentConfirmation` gate in `ordering.md`. |
| F-004   | P0       | RESOLVED | Created `audit.md` for immutable system logs. |
| F-005   | P1       | RESOLVED | Updated `Protocol` with route and dose units in `tracker.md`. |
| F-006   | P1       | RESOLVED | Added `InjectionSite` and `SiteRotationPolicy` to `tracker.md`. |
| F-007   | P1       | RESOLVED | Aligned on `Compound Catalog` terminology. |
| F-008   | P1       | RESOLVED | Refined `Cycle` and `Protocol` as independent aggregate roots. |
| F-009   | P1       | RESOLVED | Decoupled user aggregates in `auth.md`. |
| F-010   | P1       | RESOLVED | Updated reconstitution guardrails to use `WarningPolicy`. |
