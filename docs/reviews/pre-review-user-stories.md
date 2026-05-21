# Review: User Stories

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 13 new findings raised, all fixed; Full Pass  
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

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7), single-channel re-review of `docs/user-stories.md` (now 30 stories across 7 epics). Depth 5/strict. The prior multi-model dispatch (Claude+Codex+Gemini) artifacts in `docs/reviews/user-stories/` were used as input context but no new external CLI dispatch was performed in this re-review (auto-fix mode for a batched review run).

### New findings

| # | Severity | Finding | Trace |
|---|----------|---------|-------|
| N1 | **P1** | Missing story: a logged-in user changing their **own password** from settings. Only admin-triggered reset and unauth password-reset flows existed. | PRD §5.6 (Account actions) |
| N2 | **P1** | Missing story: a logged-in user changing their **own email**. PRD specifies current-password gate + verify-new-email — none of which was covered by any story. | PRD §5.6 |
| N3 | **P1** | Missing story: **Power User deletes a managed user account** with data-export-first delivered to the admin. PRD §5.5 explicitly lists this admin capability, but no story covered it. | PRD §5.5 |
| N4 | **P1** | US-ORD-07 state machine listed transitions but omitted the **Cancelled** terminal state and the Cancel action defined in PRD §5.4.4. | US-ORD-07 |
| N5 | P2 | US-ADM-01 lacked **Resend invite** AC, despite PRD §5.5 mandating the 4-state invite model and resend semantics. | US-ADM-01 |
| N6 | P2 | US-TRK-01 example covered only "daily" frequency; PRD §5.2.1 supports daily/EOD/specific days/custom interval. | US-TRK-01 |
| N7 | P2 | US-TRK-09 lacked edge cases for push-denied and email-delivery-failure paths. | US-TRK-09 |
| N8 | P2 | US-ORD-04 lacked the 60-second duplicate-send idempotency AC from PRD §5.4.3. | US-ORD-04 |
| N9 | P2 | New PRD content from step 2 (admin-initiated mid-day deactivation behavior on managed-user dashboard) had no story coverage. | PRD §5.2.1 |
| N10 | P3 | US-TRK-04 lacked the full selectable site list + route-respect + first-dose-no-history ACs from PRD §5.2.3. | US-TRK-04 |
| N11 | P3 | US-REF-01 lacked ACs for the "Profile in progress" placeholder and the "archived compound" backward-compat case from PRD §5.1. | US-REF-01 |
| N12 | P3 | US-AUT-02 lacked the 48-hour delay / immediate-with-double-confirm split + cancel-during-window detail from PRD §5.7. | US-AUT-02 |
| N13 | P3 | Gap between US-ORD-03 (Send Order) and US-ORD-04 (Payment) — no story covered the "waiting for vendor reply" state (PRD §5.4.4 step 1). | New story needed |

### Regressions detected

None. All 12 prior-pass findings remain RESOLVED.

### Fixes applied

| Finding | Action taken | Why this is the right fix |
|---------|--------------|---------------------------|
| N1 | **Added US-AUT-06: Change Own Password** with 5 ACs covering current-password gate, strength rule, same-as-current rejection, session invalidation (all other sessions logged out), and audit log. | A change-password flow is foundational table-stakes auth; without a story the implementation agent would either skip it or invent semantics. The session-invalidation AC is the non-obvious one — it's a common security expectation but easy to miss without an explicit story. |
| N2 | **Added US-AUT-07: Change Own Email** with 5 ACs covering current-password gate, verify-new-email link (24h expiry), conflict check that doesn't leak ownership, old-email revert-within-48h notification, and audit. | Email change is a high-risk action (account-takeover vector). The old-email revert notification is the one piece that prevents silent takeover and was missing entirely from the existing stories. |
| N3 | **Added US-ADM-04: Delete Managed User** with 5 ACs: export-first to admin, double-confirm + 48h delay or immediate option, audit log capture, FK preservation in audit log, and super-admin guard. | PRD §5.5 mandates this capability but the prior stories stopped at deactivation. Without the export-first AC the implementation agent might delete data without preserving the managed user's right to a copy. |
| N4 | Updated US-ORD-07 with 4 ACs: full state machine including Cancelled terminal, Stale auto-flag with banner, Cancel action from any non-terminal state, and forward-only rule for non-cancel transitions. | The prior story documented the happy path but skipped the (frequent) failure cases — orders that never get a vendor reply and need to be cancelled. The forward-only AC closes a subtle hole where an implementation might allow walking the state machine backwards on retry. |
| N5 | Updated US-ADM-01 with ACs 3-5: 4-state invite model, resend semantics that invalidate prior link, and duplicate-invite guards (existing-account + pending-invite). | Resend invite is a guaranteed real-world need (links expire, users miss the email). The "invalidates the prior link" semantic is the security-critical detail. |
| N6 | Added AC 5 to US-TRK-01 listing the 4 supported frequency types. | Without this AC, implementers might ship "daily only" and call it done, then have to retrofit EOD and custom intervals — which would break early dose-schedule data. |
| N7 | Added AC 4 (push denied → banner + fallback to email) and AC 5 (email failure silently logged, not retried) to US-TRK-09. | Reminders are a "best-effort delivery" feature, not a transactional system. The silent-fail-soft AC prevents a noisy retry loop or false error states when the underlying email service is down. |
| N8 | Added AC 3 (60-second duplicate-send confirmation) and AC 4 (stale wallet warning showing prior address for comparison) to US-ORD-04. | Both ACs target the highest-cost error mode in the system: sending crypto to a wrong wallet. The duplicate-send AC catches double-click race conditions; the stale-wallet AC catches the scenario where the user reuses a vendor's old address from a previous order. |
| N9 | Added AC 4 to US-ADM-03 covering admin-initiated mid-day deactivation behavior on the managed user's dashboard, in-flight log handling (last-writer-wins), and audit-log preservation. | This matches the PRD update made in step 2; without explicit story coverage the implementation could leave a phantom "today's dose" entry on the managed user's screen that they can't act on. |
| N10 | Added ACs 3-5 to US-TRK-04: full selectable site list (8 sites), route-aware filtering (subcutaneous vs. intramuscular), and first-dose-no-history behavior. | These match PRD §5.2.3 verbatim; without them the implementation could ship a smaller, ad-hoc site list inconsistent with the PRD. |
| N11 | Added AC 5 (Profile in progress placeholder) and AC 6 (archived-compound display) to US-REF-01. | Both cover backward-compatibility edge cases that the PRD specifies but stories had implicitly assumed would never happen — they will, and silent failures here would corrupt dose-log displays. |
| N12 | Added AC 1 (sync/async download thresholds), AC 2 (48h delay default + cancel during window), AC 3 (immediate option via second double-confirmation), and AC 4 (Telegram session revocation) to US-AUT-02. | The 48-hour cancel window is an important user safety net that wasn't visible in the original story. The session-revocation AC ensures the deleted account's Telegram session can't be replayed post-deletion. |
| N13 | **Added US-ORD-09: Await Vendor Reply** with 3 ACs covering the "Sent — waiting for vendor confirmation" state, the Telegram deep-link to vendor chat, and the "Capture vendor reply" action that bridges into US-ORD-04. | The gap between Send (US-ORD-03) and Payment (US-ORD-04) was where the user actually reads the vendor's message. Without a named state the implementation might collapse it into the order detail page with no clear "what do I do next" UX. |

### Story count change

Before: 26 stories across 7 epics.  
After: 30 stories across 7 epics (added US-AUT-06, US-AUT-07, US-ADM-04, US-ORD-09).

### Re-validation (post-fix)

| Pass | Result |
|------|--------|
| Pass 1 — PRD Coverage | All Must Have PRD features now have at least one story; Should Haves substantially covered; new admin lifecycle (delete + mid-day deactivation) covered. ✓ |
| Pass 2 — Consistency | New frequencies (EOD, specific days, custom interval) align with PRD §5.2.1. ✓ |
| Pass 3 — Structural Integrity | New stories follow Given/When/Then or Capability/AC patterns; all are independently estimable. ✓ |
| Pass 4 — Downstream Readiness | Safety guardrails in reconstitution still present; duplicate-send guardrail added to ordering. ✓ |
| Pass 5 — AC Quality | All P1 fixes include the non-obvious AC (session invalidation, old-email revert, export-first, etc.). ✓ |
| Pass 6 — Traceability | All new ACs trace to specific PRD sections. ✓ |

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL Conditional Pass)
- **All P0/P1/P2/P3 items now addressed**
- **No retained gaps**
- **Re-trigger conditions**: PRD changes to §5.5 (multi-user), §5.6 (auth), §5.4.4 (order state machine), or §5.2.7 (reminders) require re-reviewing the touching stories.
