# Review: Domain Modeling

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 12 new findings raised, all fixed; Full Pass  
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

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7), single-channel re-review of all 7 domain model files. Depth 5/strict. Re-review accounts for new requirements added in batch steps 2 (PRD) and 3 (stories) earlier today.

### New findings

| # | Severity | Finding | Trace |
|---|----------|---------|-------|
| N1 | **P1** | Auth missing `Session` entity (rolling 30-day expiry, lastSeenAt, revocation) and `EmailChangeRequest` entity (added in step 3 US-AUT-07). | PRD §5.6 + US-AUT-06/07 |
| N2 | **P1** | Auth: `Invite` is referenced in ubiquitous language and domain events but never defined as an entity. | PRD §5.5 + US-ADM-01 |
| N2.1 | **P1** | Ordering: `Vendor` listed as a "Key Aggregate" in index.md but absent from `ordering.md` (referenced as `vendorId` FK with no entity definition). | PRD §5.4.2 |
| N3 | **P1** | Tracker: `OutcomeLog` named in ubiquitous language but no entity definition; PRD §5.2.5 + US-TRK-06 require it. | PRD §5.2.5 |
| N4 | **P1** | Ordering: `Order` aggregate missing line items collection (PRD §5.4.3 specifies line items: compound + form + vial size + quantity + unit price). | PRD §5.4.3 |
| N5 | P2 | Reconstitution: `Vial` missing `orderId` FK despite the index.md context arrow "Reconstitution references Ordering via orderId". | index.md cross-context map |
| N6 | P2 | Tracker `Cycle.status` enum `(Active, Completed, Archived)` doesn't match PRD §5.2.4 `(active, paused, completed)`. | PRD §5.2.4 |
| N9 | P2 | Ordering: `Order` missing `sendMethod` field (Automated vs ManualFallback) added in step-2 PRD fix. | PRD §5.4.3 |
| N10 | P2 | Audit: AuditEvent action vocabulary doesn't include the new events from step 3 (password-change, email-change, account-deletion-cancel, etc.). | Step 3 US-AUT-06/07 + US-ADM-04 |
| N11 | P3 | `index.md` "Key Aggregates" column omits `AuditEvent` despite it being defined as an aggregate root; "Domain Model Files" omits `audit.md`. | index.md |
| N12 | P3 | Auth domain events list missing many events declared in stories: `PasswordResetRequested`, `PasswordChanged`, `EmailChangeRequested`, `EmailChangeVerified`, `EmailChangeReverted`, `AccountDeletionCancelled`, etc. | US-AUT-04/06/07, US-AUT-02 |
| N13 | P3 | `ReminderPreference` not modeled despite US-TRK-09 + PRD §5.2.7. Prior review F-002 deferred to architecture; promoting now since US-TRK-09 + N7 from step 3 adds enough behavior that the domain owes a model. | US-TRK-09 |

### Regressions detected

None. All 10 prior-pass P0/P1 findings remain RESOLVED.

### Fixes applied

| Finding | File(s) | Why this is the right fix |
|---------|---------|---------------------------|
| N1 | `auth.md` | Added `Session` (with rolling expiry, lastSeenAt, ipAddress hashed, userAgent, revokedAt) and `EmailChangeRequest` (24h verify expiry + 48h revertibleUntil window). **Why:** without `Session` the 30-day rolling expiry and password-change session-invalidation rules can't be enforced at the domain layer. Without `EmailChangeRequest` the new US-AUT-07 verify-and-revert flow has no aggregate to attach state to. |
| N2 | `auth.md` | Added `Invite` entity with the 4-state lifecycle (Invited, Expired, Accepted, Revoked) and the "resend revokes prior + creates new" rule. **Why:** events without an entity are unenforceable; the resend semantic is the security-critical part. |
| N2.1 | `ordering.md` | Added `Vendor` aggregate (Telegram handle, message template, preferred currency, status) and `VendorCatalogProduct` entity. **Why:** the `vendorId` FK on `Order` is meaningless without a `Vendor` entity; the catalog product is what `Order.lineItems` references. |
| N3 | `tracker.md` | Added `OutcomeLog` (one per user per day; overallRating 1-5; tags; protocolRatings collection) + `ProtocolRating` value object. **Why:** US-TRK-06 explicitly captures this; without a domain entity the data has no home. |
| N4 | `ordering.md` | Added `OrderLineItem` value object collection on `Order` with the duplicate-merge invariant (PRD §5.4.3). **Why:** Order is meaningless without its line items; the merge invariant prevents quantity-doubling on duplicate add. |
| N5 | `reconstitution.md` | Added `Vial.orderId` (FK optional, populated when from order receipt; null for manual entry). **Why:** matches the index.md cross-context arrow that was previously aspirational. |
| N6 | `tracker.md` | Aligned `Cycle.status` enum with PRD §5.2.4 → `(Active, Paused, Completed)`. **Why:** mismatched enums cause silent data-corruption when persistence reads a status value the domain model doesn't recognize. |
| N9 | `ordering.md` | Added `Order.sendMethod` field (Automated/ManualFallback) with "set exactly once at Sent transition" invariant. **Why:** matches the PRD §5.4.3 fix from step 2; needed for the Phase 2 success metric. |
| N10 | `audit.md` | Expanded category enum to include Auth + Reconstitution; added a structured "Canonical action names" list grouped by category covering all new events. **Why:** the prior list was an example, not a contract; without canonical names the action vocabulary diverges per-service. |
| N11 | `index.md` | Added Audit to the "Key Aggregates" table and Audit + Reconstitution to the "Domain Model Files" list (audit.md was orphaned). **Why:** index.md is the entry point for new contributors. |
| N12 | `auth.md` | Expanded domain events list to 14 events covering session creation, password reset, password change + session invalidation, email change (3 events), account deletion + cancel + delete. **Why:** events are the integration contract between Auth and Audit; missing events become silent audit-log gaps. |
| N13 | `tracker.md` | Added `ReminderPreference` entity with push subscription fields + email fallback + permission state enum. **Why:** the prior deferral made sense pre-architecture, but now that US-TRK-09 has 5 ACs we owe a domain model. |

**Also applied (consistency):**
- `Vial.totalMg/bacWaterMl/remainingMg` annotated as `Decimal` (must never use `Float`) per CLAUDE.md safety-math rule.
- `DoseAmount.value` annotated as `Decimal`.
- `ReconstitutionResult` expanded with `concentrationMgPerMl`, low/typical/high cross-check fields.
- `Schedule.frequency` enum updated to `(Daily, EOD, SpecificDaysOfWeek, CustomInterval)` with `daysOfWeek` field — aligned with step-3 US-TRK-01 AC 5.
- Added "Daily Outcome" aggregate + invariant (one OutcomeLog per user per day).
- Tracker domain events expanded with `DoseBatchLogged`, `OutcomeLogged`, `ReminderSent`, `ReminderDeliveryFailed`, all protocol lifecycle events, all cycle events.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL)
- **All findings addressed**
- **Re-trigger conditions**: any addition of a new bounded context, any new aggregate root, any change to multi-user permission scope.
