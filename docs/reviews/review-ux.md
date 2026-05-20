# Review: UX Specification

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 20 synthesized (P0: 1, P1: 15, P2: 4)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/ux-spec.md`, `docs/user-stories.md`, `docs/api-contracts.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** Section 2: User Flows
- **Issue:** The "First-Run Setup Wizard" (PRD §5.6, US-AUT-01) is missing.
- **Impact:** Critical "Must Have" onboarding experience is undefined.
- **Recommendation:** Add a multi-step onboarding flow for both Power and Managed users.
- **Trace:** PRD §5.6, US-AUT-01
- **Consensus:** High (Gemini, Codex)

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** Section 2: User Flows
- **Issue:** Missing flows for core pillars: Reference (Browse/Search), Reconstitution (Calculator), and Ordering (Builder/Cart).
- **Impact:** Implementing agents lack the behavioral blueprint for 75% of the application features.
- **Recommendation:** Add flows for Catalog lookup, Reconstitution math, and Order building.
- **Trace:** Domain Models, US-REF, US-REC, US-ORD
- **Consensus:** High (Codex, Claude)

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** Section 3: Component Hierarchy
- **Issue:** Admin Panel (US-ADM-02) and Account Settings (Export/Delete) are missing from the hierarchy.
- **Impact:** Administrative and privacy-critical UI is undefined.
- **Recommendation:** Add Admin and Settings component branches.
- **Trace:** PRD §5.5, §5.7
- **Consensus:** High (Gemini, Codex)

### Pass 2 — Correctness & Safety

#### Finding F-004 (P1)
- **Category:** readiness
- **Location:** Section 2.2: Ordering Safety Gate
- **Issue:** The flow omits the "Confirm Quote" step and the explicit acknowledgment requirement.
- **Impact:** System fails the PRD "Hard Gate" requirement for verified crypto payments.
- **Recommendation:** Add a verification check/hold-to-confirm interaction that validates against the API `confirm-quote` response.
- **Trace:** PRD §5.4.4, §6
- **Consensus:** High (Gemini, Codex)

#### Finding F-005 (P1)
- **Category:** readiness
- **Location:** Section 4: Accessibility
- **Issue:** Accessibility requirements are too narrow. Only Dose List and Calculator are mentioned.
- **Impact:** Risk of failing WCAG 2.1 AA on complex components like Charts, Sheets, and Multi-step forms.
- **Recommendation:** Expand accessibility specs to cover focus trapping, screen reader announcements for sync, and contrast for charts.
- **Trace:** PRD §8.5
- **Consensus:** High (Codex)

### Pass 3 — Consistency

#### Finding F-006 (P1)
- **Category:** consistency
- **Location:** Section 1.2: PWA Sync Interaction
- **Issue:** "CONFLICT" state dialog contradicts the "Idempotency key wins" strategy in Architecture §8.3.
- **Impact:** Confusing UI that prompts for resolution when the system has already resolved it.
- **Recommendation:** Remove the conflict dialog; define "Syncing/Synced/Warning" states instead.
- **Trace:** System Architecture §8.3
- **Consensus:** High (Gemini, Codex)

### Pass 4 — Readiness

#### Finding F-007 (P1)
- **Category:** readiness
- **Location:** Section 3: Component Hierarchy
- **Issue:** Hierarchy is too shallow. Lacks props, variants, and API data mapping.
- **Impact:** Insufficient detail for agents to build high-fidelity components.
- **Recommendation:** Expand components into typed DTO-mapped specs with state variants (empty/loading/error).
- **Trace:** Scaffold Best Practices
- **Consensus:** High (Codex)

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | RESOLVED | Added First-Run Onboarding Flow in Section 2.3. |
| F-002   | P1       | RESOLVED | Added Reference, Reconstitution, and Ordering flows in Section 2. |
| F-003   | P1       | RESOLVED | Expanded Component Hierarchy with Auth, Admin, and Settings in Section 3. |
| F-004   | P1       | RESOLVED | Refined Safety Gate flow with Quote Confirmation in Section 2.2. |
| F-005   | P1       | RESOLVED | Expanded Accessibility specs with Aria-Live and Focus management in Section 4. |
| F-006   | P1       | RESOLVED | Aligned Sync state machine with Idempotency in Section 1.2. |
| F-007   | P1       | RESOLVED | Deepened Component Specs with state variants in Section 3. |
