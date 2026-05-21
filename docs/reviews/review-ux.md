# Review: UX Specification

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — repaired F-003 resolution-log regression + 14 new findings fixed; Full Pass  
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

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict.

### Resolution-log regression repaired

**F-003 was misclassified as RESOLVED.** The resolution log said "Expanded Component Hierarchy with Auth, Admin, and Settings in Section 3" but §3 actually had only Layout/Auth, Tracker, Ordering, and Reference — no Admin section, no Settings section, no Reconstitution component spec. This re-review actually adds those sections (§3.5 Reconstitution, §3.6 Admin, §3.7 Settings, §3.8 Reminders, §3.9 Cycles, §3.10 Outcome).

### New findings + fixes

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 (regression repair) | F-003 marked RESOLVED but §3 still lacked Admin + Settings sections. | Added §3.5 Reconstitution, §3.6 Admin (`AdminPanel`, `ManagedUserList`, `InviteUserDialog`, `ManagedUserDetailSheet`, `AdminAuditLogView`), §3.7 Settings (`SettingsLayout`, `ChangePasswordForm`, `ChangeEmailForm`, verify/revert pages, `ExportDataPanel`, `DeleteAccountDialog`, `DeletionPendingBanner`), §3.8 Reminders, §3.9 Cycles, §3.10 Outcome Logging. |
| N2 | P1 | Missing user flow: Change Password (US-AUT-06) — session-invalidation has visible UX implications. | Added §2.5 with explicit "we signed you out everywhere else" success modal mentioning `otherSessionsRevoked: N`. |
| N3 | P1 | Missing user flow: Change Email (US-AUT-07) — verify + revert window UX. | Added §2.6 covering request → verify-at-new-address → old-address notice → optional revert-within-48h. |
| N4 | P1 | Missing user flow: Account Deletion (US-AUT-02) — 48h delay + cancel banner UX. | Added §2.7 with type-DELETE confirmation, mode selector, export-first CTA, and the "Deletion scheduled" banner with cancel CTA shown on every page during the 48h window. |
| N5 | P1 | Missing user flow: Managed User Invitation (US-ADM-01). | Added §2.8 covering invite form, status badges, resend confirmation modal explaining prior-link invalidation. |
| N6 | P1 | Missing user flow: Delete Managed User (US-ADM-04). | Added §2.9 with mandatory export-first (admin receives the export, not optional). |
| N7 | P1 | Missing user flow: Cancel Order + Stale Order banner (US-ORD-07). | Added §2.10: status badges + 14-day stale banner with "Check in Telegram / Cancel order" CTAs + cancel confirmation modal. |
| N8 | P2 | §2.2 Ordering Safety Gate didn't mention stale-wallet warning (US-ORD-04 AC 4). | Extended §2.2 step 1 with stale-wallet "prior address shown for comparison" note. |
| N9 | P2 | §2.2 didn't address the 60s duplicate-send confirmation modal (US-ORD-04 AC 3). | Added duplicate-send modal sub-section to §2.2. |
| N10 | P2 | §2.4 Reconstitution didn't show low/typical/high cross-check (PRD §5.3). | Extended §2.4 step 4 with the cross-check 3-cell display + step 5 for last-dose context line. |
| N11 | P2 | §4 Accessibility too narrow — no PWA install-prompt UX (iOS Safari prerequisite), no chart alt-table, no high-contrast testing cadence. | Rewrote §4: added install-prompt keyboard accessibility from the notification banner, chart-alternative table toggle, polite vs. assertive aria-live regions, high-contrast quarterly test cadence, and multi-step form `aria-current="step"`. |
| N12 | P3 | Component hierarchy missing Reminder Settings + Cycle Management + Outcome Logging components. | Added §3.8 (Reminders), §3.9 (Cycles), §3.10 (Outcome Logging) with full component specs. |
| N13 | P3 | §5 Responsive table missing OrderBuilder, OutcomeLog form, ManagedUserList, AdminPanel layout. | Expanded §5 from 4 → 10 component rows covering all major surfaces. |

### Regressions detected (re-review)

None introduced. The doc nearly doubled in size but every addition traces to a documented requirement.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL Conditional Pass)
- **F-003 resolution-log regression repaired** (Admin + Settings + Reconstitution + Reminders + Cycles + Outcome sections now actually exist)
- **All 12 new findings fixed**
- **Re-trigger conditions**: any new user-facing flow added to PRD/stories, any change to the ordering safety-gate semantics, any change to PWA / Web Push subscription model.
