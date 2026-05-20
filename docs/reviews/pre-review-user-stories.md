# Review: User Stories

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 12 synthesized (P0: 2, P1: 7, P2: 3)
- **Passes run:** 6 of 6
- **Artifacts checked:** `docs/user-stories.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — PRD Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** Epic 6: Auth & Account Management
- **Issue:** Core authentication infrastructure (email/password, sessions, password reset, change email/password) is missing from the stories. Only onboarding and deletion are covered.
- **Impact:** Implementing agents will lack the requirements for the foundational security layer.
- **Recommendation:** Add stories for Registration/Login, Session Management, and Password Reset.
- **Trace:** PRD §5.6
- **Consensus:** High (Claude, Codex, Gemini)

#### Finding F-002 (P0)
- **Category:** coverage
- **Location:** Epic 6: Auth & Account Management
- **Issue:** PWA and Offline requirements (manifest, home screen install, offline dose-log queuing) are missing.
- **Impact:** The "7am routine" use case is compromised if the user has no signal and the app doesn't queue doses.
- **Recommendation:** Add a PWA/Offline story; add AC to US-TRK-03/05 for offline queuing.
- **Trace:** PRD §8.6
- **Consensus:** High (Claude, Codex, Gemini)

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** Epic 2: Tracker Pillar
- **Issue:** Cycle Management is missing. PRD requires cycles with dates, associated protocols, and break periods.
- **Impact:** Users cannot group protocols into logical cycles as required by the PRD.
- **Recommendation:** Add US-TRK-08: Manage Cycles.
- **Trace:** PRD §5.2.4
- **Consensus:** High (Claude, Gemini)

#### Finding F-004 (P1)
- **Category:** coverage
- **Location:** Epic 2: Tracker Pillar
- **Issue:** Protocol lifecycle is incomplete (Clone, Restart Cycle, Edit, Deactivate).
- **Impact:** Critical "Must Have" features from MoSCoW are missing.
- **Recommendation:** Expand US-TRK-01/02 or add separate stories for Clone and Restart Cycle.
- **Trace:** PRD §5.2.1
- **Consensus:** Medium (Codex, Gemini)

#### Finding F-005 (P1)
- **Category:** coverage
- **Location:** Epic 2: Tracker Pillar
- **Issue:** Dose Reminders (Push/Email) are missing.
- **Impact:** Retention risk if users forget to log doses.
- **Recommendation:** Add a story for configuring and delivering reminders.
- **Trace:** PRD §5.2.7
- **Consensus:** High (Claude, Codex, Gemini)

#### Finding F-006 (P1)
- **Category:** coverage
- **Location:** Epic 4: Ordering Pillar
- **Issue:** Vendor Catalog Management and Order State Machine (Draft, Sent, Confirmed, Stale, etc.) are missing.
- **Impact:** Sourcing workflow is too thin; lacks the required status tracking.
- **Recommendation:** Add stories for Catalog Management and Order Status Tracking.
- **Trace:** PRD §5.4.2, §5.4.4
- **Consensus:** High (Codex)

### Pass 2 — Consistency

#### Finding F-007 (P1)
- **Category:** consistency
- **Location:** US-TRK-01
- **Issue:** Frequency "250mcg twice daily" is used in the example, but the PRD protocol frequency model doesn't explicitly support intra-day dose times in v1.
- **Impact:** Ambiguity in whether the app supports multiple scheduled doses per day.
- **Recommendation:** Either simplify example to "daily" or update PRD/Stories to clarify intra-day scheduling.
- **Trace:** PRD §5.2.1
- **Consensus:** Single-source (Codex)

### Pass 3 — Structural Integrity (INVEST)

#### Finding F-008 (P2)
- **Category:** completeness
- **Location:** US-TRK-03 / US-TRK-05
- **Issue:** Missed vs Skipped dose distinction is not captured in AC.
- **Impact:** Adherence metrics will be inaccurate if skips aren't recorded.
- **Recommendation:** Add AC to distinguish manual "Skip" action from "Not Logged".
- **Trace:** PRD §5.2.2
- **Consensus:** High (Claude, Gemini, Codex)

### Pass 4 — Downstream Readiness

#### Finding F-009 (P1)
- **Category:** completeness
- **Location:** US-REC-01
- **Issue:** Reconstitution guardrails (Large volume warning, low BAC volume warning, dose-range safety) are not in AC.
- **Impact:** Safety-critical math checks might be missed in implementation.
- **Recommendation:** Add specific AC for these safety warnings.
- **Trace:** PRD §5.3
- **Consensus:** High (Codex)

### Pass 5 — Acceptance Criteria Quality

#### Finding F-010 (P2)
- **Category:** consistency
- **Location:** US-ORD-05
- **Issue:** Story says inventory is "automatically updated", PRD requires a prompt/review before adding ordered items to vials.
- **Impact:** User might accidentally bloat inventory with items they didn't actually receive.
- **Recommendation:** Change AC to "prompt to add to inventory".
- **Trace:** PRD §5.4.4
- **Consensus:** Single-source (Codex)

### Pass 6 — Traceability

#### Finding F-011 (P1)
- **Category:** coverage
- **Location:** Epic 5: Multi-User & Admin
- **Issue:** Admin lifecycle (edit/deactivate managed user, resend invite) is missing.
- **Impact:** Power User cannot manage accounts after creation.
- **Recommendation:** Add admin management stories.
- **Trace:** PRD §5.5
- **Consensus:** Medium (Codex)

#### Finding F-012 (P2)
- **Category:** coverage
- **Location:** Entire Document
- **Issue:** Monitoring and Audit Log requirements are missing.
- **Impact:** Silent failures in Telegram ordering or audit trail gaps.
- **Recommendation:** Add AC for monitoring alerts and audit record creation.
- **Trace:** PRD §8.7
- **Consensus:** Medium (Gemini, Codex)

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | RESOLVED | Added US-AUT-03 (Registration/Login) and US-AUT-04 (Password Reset). |
| F-002   | P0       | RESOLVED | Added US-AUT-05 (PWA/Offline) and updated US-TRK-03/05 with offline queuing AC. |
| F-003   | P1       | RESOLVED | Added US-TRK-08 (Manage Cycles). |
| F-004   | P1       | RESOLVED | Expanded US-TRK-01 (Edit) and US-TRK-02 (Clone, Restart Cycle). |
| F-005   | P1       | RESOLVED | Added US-TRK-09 (Dose Reminders). |
| F-006   | P1       | RESOLVED | Added US-ORD-06 (Catalog Management) and US-ORD-07 (Status Machine). |
| F-007   | P1       | RESOLVED | Updated US-TRK-01 example to "daily". |
| F-008   | P2       | RESOLVED | Updated US-TRK-03 AC to include explicit "Skip" action. |
| F-009   | P1       | RESOLVED | Updated US-REC-01 with AC 3 (Safety Guardrails). |
| F-010   | P2       | RESOLVED | Updated US-ORD-05 AC to use prompt for inventory update. |
| F-011   | P1       | RESOLVED | Added US-ADM-03 (Manage Managed Users). |
| F-012   | P2       | RESOLVED | Added Audit Log ACs to US-TRK-01, US-ORD-03, US-ORD-06. |
