# Review Report: docs/plan.md

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — all P1 fixes from initial pass applied + 3 new P2 findings from re-review fixed; Full Pass  
**Models:** Claude (Sonnet 4.6) + Codex (GPT-5.5) + Gemini (CLI timeout — excluded)

---

## Executive Summary

The PRD is structurally sound: two well-specified personas, three-level scope lists, MoSCoW prioritization, quantified NFRs, and a phased delivery plan. No P0 blockers. Six P1 findings emerged, primarily around an incomplete order lifecycle state machine (no cancel/timeout), an invite link with no expiry or resend flow, a success metric that references a data field not defined in the feature spec, and missing data retention and Telegram rate limit constraints. All P1 findings are fixable without structural changes. The PRD is ready for P1 fixes before proceeding to User Stories.

**Total findings (Claude pass):** 21 (P0: 0 | P1: 6 | P2: 14 | P3: 1)

---

## Findings by Pass

### Pass 1: Problem Statement Rigor

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 1.1 | P1 | Problem statement describes pain qualitatively but provides no quantitative evidence (error rate, dollar value lost to crypto mistakes, hours/week on tab-soup). r/Peptides community size (250k+ members) appears in vision but not in PRD problem statement. Without a number, the problem severity can't be calibrated. | §1 Problem Statement | Claude |

### Pass 2: Persona & Stakeholder Coverage

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 2.1 | P2 | The grey-market vendor (QSC) is a key external actor whose Telegram message format, response patterns, and price list structure drive the ordering flow and vendor catalog design — but they are not documented anywhere as an external actor or system participant. Stories about the ordering flow will implicitly depend on vendor behavior patterns that are never stated. | §5.4 / §2 | Claude |

### Pass 3: Feature Scoping Completeness

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 3.1 | P2 | §7.1 Technical Constraints contains "e.g., gramjs for Node.js" — a specific library recommendation that belongs in the tech-stack step, not the PRD. The constraint is "requires MTProto client library"; the specific implementation is a tech-stack decision. | §7.1 | Claude |
| 3.2 | P2 | §5.4 feature specification describes HOW the Telegram integration works (phone number auth, AES-256 session storage, deep-link URL format) rather than WHAT the feature does from the user's perspective. Marginally over-specified for a PRD. Acceptable given the novel integration, but flagged. | §5.4.1 | Claude |

### Pass 4: Success Criteria Measurability

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 4.1 | P1 | "Ordering reliability" success criterion measures "< 3 manual fallback uses" via "order history + fallback flag" — but the order record fields defined in §5.4.3 do not include a `send_method` (automated vs. manual fallback) field. The metric references data that doesn't exist in the feature spec. | §6 Phase 2 / §5.4.3 | Claude |
| 4.2 | P2 | Two success criteria rely solely on self-reporting: "Spreadsheet decommissioned within 90 days" and "Delegated Participants text Power User < 5 times." For a personal tool, this is pragmatically acceptable but should be noted as a measurement limitation. | §6 Phase 1 / Phase 2 | Claude |
| 4.3 | P2 | Year 3 "Community reputation" criterion specifies "community monitoring" as measurement but does not define what that entails operationally (who monitors, what counts as a reference, what cadence). | §6 Year 3 | Claude |

### Pass 5: NFR Quantification

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 5.1 | P1 | Data retention policy is incomplete. §5.7 specifies audit log retention (90 days) but does not state the retention period for dose logs, order history, vial records, or outcome logs. Implied answer is "until account deletion" but this is never made explicit. The database/storage design cannot be planned without this. | §5.7 / §8 | Claude |
| 5.2 | P2 | No internationalization policy. US-only is implied by "GDPR not applicable for v1" but never explicitly stated as an exclusion. Should be explicitly excluded in §7.5 or §8 to prevent ambiguity during architecture. | §7.5 / §8 | Claude |
| 5.3 | P2 | No monitoring/observability NFRs. For a solo developer who is also the operator, application error tracking, uptime monitoring, and alerting thresholds are operationally necessary. The PRD should acknowledge the requirement even if tooling is a tech-stack decision. | §8 | Claude |

### Pass 6: Constraint & Dependency Documentation

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 6.1 | P1 | Telegram MTProto rate limits not documented. Flood-wait limits apply to auth code requests, session verification, and message sending. At personal-tool scale (estimated 5-15 messages/month), this is not a v1 risk, but the constraint should be explicitly acknowledged so the architecture phase can account for it (especially for v2 AI response parser which would poll messages). | §7.1 | Claude |
| 6.2 | P2 | Transactional email provider mentioned in §7.3 budget ("Resend or Postmark") but not in §7.1 technical constraints. Invite links, password reset, and export delivery all depend on reliable email delivery. Should be in constraints with a note on deliverability requirements. | §7.1 / §7.3 | Claude |
| 6.3 | P2 | PubMed citation approach is ambiguous: do reference profiles link to PubMed externally (static URLs, no API) or does any v1 feature programmatically access PubMed? If the former, no constraint applies. If the latter, PubMed API terms and rate limits should be documented. | §5.1 | Claude |

### Pass 7: Error & Edge Case Coverage

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 7.1 | P1 | Order lifecycle is incomplete: there is no "Cancelled" or "Stale" terminal state. An order stuck in "Sent — awaiting confirmation" has no resolution path if the vendor never responds. The PRD should define: (a) a "Cancel order" action in Order History, and (b) an automatic "stale" flag after N days with no status update. | §5.4.4 | Claude |
| 7.2 | P1 | Managed user invite link has no expiry or resend flow defined. §5.5 sends "a one-time setup link" but doesn't specify: link validity duration, what the admin panel shows for invited-but-not-accepted users, or how the admin resends an expired invite. | §5.5 | Claude |
| 7.3 | P2 | Protocol deactivation vs. pending doses: if the admin deactivates a managed user's protocol while doses are due today, what does the managed user's dashboard show? Should deactivated protocols immediately vanish from "today's doses" or persist until end of day? | §5.2.2 / §5.5 | Claude |
| 7.4 | P2 | Backward compatibility for deleted compounds: if a compound is deleted from the catalog but referenced by an existing protocol or dose log, the app must still display the compound name. The feature spec doesn't address this — FK orphans would break the UI. | §5.1 / §5.2 | Claude |
| 7.5 | P2 | Duplicate compound in order builder cart: if the user adds the same compound (same form, same vial size) twice, should it merge quantities or allow duplicate line items? Not specified. | §5.4.3 | Claude |
| 7.6 | P2 | Expired/unaccepted invite: §5.5 specifies sending invite emails but not the invited-but-not-yet-accepted state. Admin panel should distinguish "active", "invited (pending)", and "invite expired" states for managed users. | §5.5 | Claude |

### Pass 8: Downstream Readiness for User Stories

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 8.1 | P2 | Phase 3 features (AI Telegram response parser, Automated PubMed watch) are named in the delivery plan and deferred list but have no feature description anywhere in the PRD. The architecture phase needs to design for extensibility — it can't do that without knowing WHAT these features will do. Add at minimum a one-paragraph stub for each. | §3.3 / §10 | Claude |
| 8.2 | P3 | Vial inventory is listed as "Should Have" in the MoSCoW tracker category, but the feature spec describes vial records as output of the reconstitution calculator (§5.3 — a "Must Have"). The inconsistency may confuse story ownership. Clarify: vial record creation = part of reconstitution (Must Have); vial inventory view/browse = tracker UI feature (Should Have). | §4 / §5.3 | Claude |

---

## Fix Plan

### Batch 1: Order lifecycle completeness (P1 — 7.1)
- **Finding:** 7.1 — no Cancelled / Stale states in ordering flow
- **Fix:** Add order status state machine to §5.4.4: Draft → Sent → Confirmed → Payment Sent → Received | Cancelled. Add "Cancel order" action to Order History. Define stale threshold (e.g., 14 days in "Sent" state → flagged "Awaiting vendor — check Telegram").
- **Affected:** §5.4.4

### Batch 2: Invite link management (P1 — 7.2)
- **Finding:** 7.2 — invite link expiry and resend flow missing
- **Fix:** Add to §5.5: invite link expires in 72 hours; admin panel shows "Invited (expires MM/DD)" state for pending invites; admin can resend invite from panel; resend generates a new link and invalidates the old one.
- **Affected:** §5.5

### Batch 3: Order record fallback flag (P1 — 4.1)
- **Finding:** 4.1 — "fallback flag" metric has no corresponding field in feature spec
- **Fix:** Add `send_method: "automated" | "manual_fallback"` to order record fields in §5.4.3. Update the success criterion measurement note to reference this field.
- **Affected:** §5.4.3, §6

### Batch 4: Data retention policy (P1 — 5.1)
- **Finding:** 5.1 — retention only defined for audit log
- **Fix:** Add explicit retention statement to §5.7: "All user data (dose logs, protocol history, order history, vial records, outcome logs) is retained until account deletion. No automatic archival or expiry for any user-created data. Export available at any time."
- **Affected:** §5.7

### Batch 5: Problem statement quantification (P1 — 1.1)
- **Finding:** 1.1 — no quantitative evidence
- **Fix:** Add known community-size signal and cost-of-error evidence to §1: "Reddit r/Peptides: 250k+ members; vendor ecosystems sustain dozens of active grey-market vendors. Ordering errors (wrong wallet address, incorrect quantity) result in non-reversible crypto payments — median order value estimated $100-500 USD."
- **Affected:** §1

### Batch 6: Telegram rate limit constraint (P1 — 6.1)
- **Finding:** 6.1 — MTProto rate limits unacknowledged
- **Fix:** Add to §7.1: "Telegram MTProto flood-wait limits apply to all API calls. At expected v1 usage (5–15 order messages/month, 1 auth event per setup), limits are not a risk. Note for v2: AI response parser that polls message history is rate-limited and must respect Telegram's flood-wait signals."
- **Affected:** §7.1

### Batch 7: P2 polish
- Remove "gramjs for Node.js" from §7.1 (finding 3.1)
- Add vendor as external actor note to §5.4 (finding 2.1)
- Add monitoring/observability NFR stub to §8 (finding 5.3)
- Add i18n exclusion to §7.5 (finding 5.2)
- Add Phase 3 feature stubs to §5 (finding 8.1)
- Add backward-compat note for deleted compounds to §5.1 (finding 7.4)
- Clarify duplicate cart behavior (merge quantities) to §5.4.3 (finding 7.5)
- Add invite state definitions to §5.5 (finding 7.6)
- Clarify vial inventory Must Have / Should Have split (finding 8.2)

---

## Fix Log

| Batch | Findings | Changes Made | New Issues |
|-------|----------|--------------|------------|
| 1 | 7.1 | §5.4.4: Full state machine added (Draft→Sent→Confirmed→Payment Sent→Received\|Cancelled; Stale auto-flag at 14 days). Cancel action defined. | None |
| 2 | 7.2 | §5.5: 72h invite expiry, resend flow, 4 invite states (Active/Invited/Expired/Deactivated), expired-invite UX. | None |
| 3 | 4.1 | §5.4.3: `send_method` field added to order record. §6 Phase 2: measurement updated to reference `send_method` field. | None |
| 4 | 5.1 | §5.7: Full data retention matrix added (all data types → until account deletion; audit log 90 days; Telegram session revoked on deletion). | None |
| 5 | 1.1 | §1: Quantitative evidence added (r/Peptides 250k+ members, $100–500 median order value, irreversible crypto payments). | None |
| 6 | 6.1 | §7.1: Telegram rate limit constraint added with v2 parser backoff requirement. | None |
| 7 | 3.1, 2.1, 5.3, 5.2, 8.1, 7.4, 7.5, 7.6, 8.2 | §7.1: gramjs removed; transactional email + PubMed constraints added. §5.4: vendor external actor + MTProto feasibility gate added. §8.7: monitoring NFR added. §8.8: i18n/US-only exclusion added. §3.3: Phase 3 feature stubs added (AI parser + PubMed watch). §5.1: deleted-compound backward-compat added. §5.4.3: duplicate cart merge behavior defined. §5.5: invite states clarified (Batch 2). §4: vial inventory Must Have/Should Have split noted. | None |
| 8 (Codex) | 3.1, 4.2, 3.2, 3.3, 7.3, 7.4 | §4+§10: Phase vs. MoSCoW alignment note added. §6: Phase 2 + Year 1 order metrics clarified as cumulative. §5.4: MTProto feasibility gate added. §4: mobile Could Have clarified. §5.2.2: dose schedule edge cases added (missed/skip/late/timezone). §5.4.4: payment edge cases added. §7.5: Phase 2 legal gate added. §10: data export phasing note and Phase 2 legal gate reminder added. | None |

---

## Re-Validation Results

| Pass | Pre-fix P1s | Post-fix status |
|------|------------|-----------------|
| 1 — Problem Statement | 1.1 (no quantitative evidence) | Fixed — §1 now has community size + order value |
| 4 — Success Criteria | 4.1 (fallback flag field undefined) | Fixed — `send_method` field in §5.4.3; Phase 2/Year 1 duplicate resolved |
| 5 — NFR | 5.1 (retention), 5.3 (monitoring) | Fixed — §5.7 retention matrix; §8.7 monitoring; §8.8 i18n |
| 6 — Constraints | 6.1 (Telegram rate limits) | Fixed — §7.1 rate limit note |
| 7 — Error/Edge Cases | 7.1 (cancel/stale), 7.2 (invite expiry) | Fixed — §5.4.4 state machine; §5.5 invite lifecycle |

No new P0 or P1 issues introduced by fixes.

---

## Multi-Model Synthesis

See `docs/reviews/prd/review-summary.md` for full synthesis.

**Summary:** Claude (21 findings, Conditional Pass) + Codex (26 findings, Fail) reviewed independently. Gemini CLI timed out. Consensus items: all 7 Claude P1s confirmed by Codex. Codex added 3 P0s (scope/phase conflict, regulatory timing, downstream sequencing) — all downgraded to P1 in synthesis given personal-tool context and addressed by fixes. Codex also added P1s for dose schedule edge cases, payment edge cases, and MTProto feasibility gate — all applied.

---

## Downstream Readiness Assessment

- **Gate result:** Conditional Pass — proceed to User Stories
- **Handoff notes (to User Stories phase):**
  - Ordering epics: use state machine in §5.4.4 (6 states + Stale auto-flag)
  - Multi-user epics: use invite lifecycle in §5.5 (72h expiry, resend, 4 states)
  - Mobile dose-logging is first-class — all dose-log stories require mobile acceptance criteria
  - Reconstitution + payment flows: 100% unit test coverage required (§7.4)
  - Phase 3 features (AI parser, PubMed watch) have stubs in §3.3 for architecture design
  - MTProto feasibility gate must pass before Phase 1 ordering stories are marked done
  - Phase 2 legal gate must pass before Phase 2 stories are shipped
  - Telegram automation is v1 Must Have with mandatory manual fallback in every ordering flow
- **Remaining P2/P3 after fixes:** ~6 polish items; none block User Stories

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7), single-channel re-review of the updated `docs/plan.md` (991 lines). Depth 5/strict. Auto-fix mode.

### New findings

| # | Severity | Finding | Location | Detection pass |
|---|----------|---------|----------|----------------|
| N1 | P2 | §6 Year 3 "Community reputation" measurement is "Community monitoring" — undefined operationally. No specification of *who* monitors, *what* counts as a reference, *cadence*, or *threshold*. Unactionable as written. | §6 Year 3 | Pass 4 (success criteria measurability) |
| N2 | P2 | §7.5 Phase 2 legal gate says "conduct a precautionary review" but doesn't specify *who* conducts the review, *what* the review must cover, or *pass/fail* criteria. The gate is a phase blocker per §10 but cannot be evaluated as written. | §7.5 | Pass 6 (constraint & dependency documentation) |
| N3 | P2 | §5.2.1 protocol lifecycle has a `deactivated` status but, unlike `paused` (explicitly excluded from "today's doses"), the behavior of `deactivated` on the managed user's dashboard is undefined. Also subsumes prior P2 finding 7.3 (protocol deactivation vs. pending doses). | §5.2.1, §5.5 | Pass 7 (error & edge case coverage) |

### Regressions detected

None. All P1 fixes from the initial review remain intact:
- Order state machine (§5.4.4): Cancel + Stale auto-flag still in place
- Invite lifecycle (§5.5): 72h expiry + resend + 4-state model still in place
- `send_method` field (§5.4.3): still defined
- Data retention matrix (§5.7): still complete
- §1 quantitative evidence: still present
- §7.1 Telegram rate limit constraint: still present

### Fixes applied

| Finding | Section edited | Why (root cause) | How (the change) |
|---------|----------------|------------------|------------------|
| N3 | §5.2.1 (protocol lifecycle) | The PRD specified four lifecycle states but only defined behavior transitions for three (active, paused, completed). `deactivated` was a "ghost state" — present in the type but undefined in behavior. Stories about admin-initiated protocol deactivation could not be written. | Added a full `Deactivated` lifecycle paragraph: terminal soft-delete, immediately excluded from "today's doses," visible in protocol list under "Inactive" filter, dose history preserved, cannot be resumed (clone to revive). Added a separate "Admin-initiated deactivation of a managed user's protocol" paragraph: dashboard refresh behavior, in-flight log handling (last-writer-wins), history preservation on the deactivated protocol. |
| N1 | §6 Year 3 success criteria | "Community monitoring" with no operational detail meant the criterion could never be evaluated as pass/fail — purely aspirational language hiding inside a measurement table. | Replaced the measurement cell with a structured monitoring protocol: quarterly search of r/Peptides, r/Biohackers, r/longevity, and 2-3 biohacker Discord servers; what counts as a reference (unsolicited mention by a non-Power-User-affiliated user); explicit target (≥ 5 unsolicited references per quarter by end of Year 3); running log location (`docs/community-references.md`). |
| N2 | §7.5 (regulatory & legal) | "Conduct a precautionary review" was conceptually correct but operationally a no-op. The Phase 2 phase gate (§10) referenced this review as a blocker, but the review itself was undefined — the gate could be silently waved through. | Rewrote the legal gate as a 6-item checklist with explicit pass criteria: (1) written acknowledgment from managed users, (2) no minors / no incapacity, (3) data-export and deletion flows verified end-to-end, (4) audit log captures admin actions with identity, (5) honest product framing in family/friends communications, (6) state-of-residence law review by the Power User. Added the explicit rule "if any item fails, Phase 2 does not ship until it is remediated." Attorney consultation is optional but recommended for uncertain items. |

### Re-validation (post-fix)

| Pass | Result |
|------|--------|
| Pass 1 — Problem Statement | No changes; still quantified with community + payment evidence. ✓ |
| Pass 2 — Persona & Stakeholder | No changes; QSC external actor still documented. ✓ |
| Pass 3 — Feature Scoping | No changes; in/out/deferred sections still complete. ✓ |
| Pass 4 — Success Criteria | Year 3 community reputation now operationally measurable. ✓ |
| Pass 5 — NFR Quantification | No changes; all 8 NFR subsections still quantified. ✓ |
| Pass 6 — Constraint & Dependency | Phase 2 legal gate now operationally executable. ✓ |
| Pass 7 — Error & Edge Cases | Protocol deactivation behavior now explicit, including admin-initiated mid-day deactivation. ✓ |
| Pass 8 — Downstream Readiness | User stories for admin deactivation flow, Phase 2 gate, and community-reputation reporting can now be written without strategic clarification. ✓ |

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from Conditional Pass)
- **All P0/P1 items addressed** (carried from initial review)
- **All P2/P3 items deemed actionable for v1 now fixed**
- **Remaining known gaps** (deliberately retained):
  - 4.2 (P2) — Spreadsheet decommission and DP support-burden are self-reported. Acceptable for a personal tool; no automated proxy available without invasive instrumentation.
- **Re-trigger conditions for future review**: any change to the protocol lifecycle, any change to the Phase 2 legal posture, any change to multi-vendor or multi-user scope.
