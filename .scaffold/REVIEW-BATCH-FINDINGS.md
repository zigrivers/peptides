# Review Batch Findings Log — 2026-05-20

Batch: re-run 22 review/audit/validation steps at depth 5 strict with auto-fix.
Mode: reset → run with `--instructions "Apply fixes directly to the reviewed artifact instead of just listing issues. Summarize what you changed."`

## Status

| # | Step | Status | Findings | Fixed | Declined |
|---|------|--------|----------|-------|----------|
| 1 | review-vision | ✅ done | 6 (1×P1, 2×P2, 3×P3) | 6 | 1 retained (1.1) |
| 2 | review-prd | ✅ done | 3 (3×P2) | 3 | 1 retained (4.2) |
| 3 | review-user-stories | ✅ done | 13 (4×P1, 5×P2, 4×P3) | 13 | 0 |
| 4 | review-domain-modeling | ✅ done | 12 (5×P1, 4×P2, 3×P3) | 12 | 0 |
| 5 | review-adrs | ✅ done | 10 (1×P0 regression, 3×P1, 3×P2, 3×P3) | 8 fully + 2 partially | 2 partial (N9, N10) |
| 6 | review-architecture | ✅ done | 6 (4×P1, 2×P2) | 6 | 0 |
| 7 | review-database | ✅ done | 10 (2×P0, 6×P1, 2×P2) | 10 | 0 |
| 8 | review-api | ✅ done | 12 new + 8 PENDING repaired (1×P0 resolution-log regression, 10×P1, 2×P2) | 20 | 0 |
| 9 | review-ux | ✅ done | 13 (1×P1 regression, 6×P1, 4×P2, 2×P3) | 13 | 0 |
| 10 | review-testing | pending | | | |
| 11 | review-operations | pending | | | |
| 12 | review-security | pending | | | |
| 13 | platform-parity-review | pending | | | |
| 14 | workflow-audit | pending | | | |
| 15 | implementation-plan-review | pending | | | |
| 16 | cross-phase-consistency | pending | | | |
| 17 | decision-completeness | pending | | | |
| 18 | critical-path-walkthrough | pending | | | |
| 19 | dependency-graph-validation | pending | | | |
| 20 | implementability-dry-run | pending | | | |
| 21 | scope-creep-check | pending | | | |
| 22 | traceability-matrix | pending | | | |

## Detailed findings

(Per-step findings appended below as steps complete.)

---

### Step 1: review-vision

**Artifact**: `docs/vision.md` (244 → 261 lines after fixes)
**Review log**: `docs/reviews/vision-review-vision.md`
**Mode**: update / re-review
**Gate result**: Full Pass (upgraded from Conditional Pass)

**Findings raised (6 total):**

| # | Severity | Finding | Section |
|---|----------|---------|---------|
| N1 | P1 | Q9 Legal review trigger labeled PRD-blocking but contained no directional answer | §12 Q9 |
| N2 | P3 | §6 Genuine Differentiation lacked a closing consolidated competitive thesis sentence | §6 |
| N3 | P3 | §10 "20 successful orders" Year 1 metric ambiguous re: v1 guided-manual vs. automated | §10 |
| 1.3 | P3 | "Honest" was the pivot word but never operationally defined (re-opened from prior review) | §1 |
| 2.2 | P2 | Primary persona anchored to "you" without behavioral qualifier for future users (re-opened) | §4 |
| 3.3 | P2 | "Honesty earns trust — structural advantage" overclaimed; honesty is brand-level, not structural moat (re-opened) | §6 |

**Findings fixed (6):**

1. **N1 — Q9 legal review trigger (P1)** — Provided directional answer: legal review required before (a) any non-family external user OR (b) any paid license sale; personal + family use below threshold; listed re-trigger conditions. Relabeled `[RESOLVED]`. **Why this is the right fix:** PRD generation cannot make scope decisions about "when does legal review happen" without a default. The chosen threshold reflects the personal-tool-first sequencing already in the vision and the harm-reduction framing.
2. **N2 — Competitive thesis (P3)** — Added closing sentence: *"We win by being the only product that closes the order → inventory → dose → log data loop for users sourcing outside App Store ecosystems."* **Why:** Reader was previously required to synthesize 8 differentiation bullets into a thesis; a single declarative sentence makes the moat statement quotable and testable.
3. **N3 — 20 orders metric (P3)** — Clarified guided-manual scope explicitly; noted v2 automation not required for the Year 1 target. **Why:** Internal consistency between §5 v1 sourcing scope and §10 success criteria.
4. **1.3 — "Honest" operationally defined (P3)** — Added 5-point operational definition in §1: name the grey market explicitly; no insincere disclaimers; primary-research citations + anecdote labeling; safety features never paywalled; vendor referral never biases recommendations. **Why:** "Honest" is referenced as a guiding principle throughout the doc; without operational meaning it drifts during downstream synthesis. The 5 bullets are testable.
5. **2.2 — Power User qualifier checklist (P2)** — Added 5-point fit checklist (3+ peptides concurrent; cycles with PK/biomarker awareness; crypto-comfortable; sources outside telehealth; logs outcomes) with explicit "fails one — wrong product; fails two — categorically wrong product" rule. **Why:** Without a qualifier the persona can drift toward borderline users (someone curious about 1 peptide; someone who wants telehealth-only). Drift turns the product into a generic tracker. The checklist hardens the audience boundary.
6. **3.3 — Moat correctly framed (P2)** — Rewrote the prior overclaim. Acknowledged honesty alone is not the moat; named the structural moat as (web platform) + (closed data loop) + (grey-market-first). Honesty is consequence, not cause. **Why:** Mis-stating the moat distorts roadmap priorities — investing in honesty signaling instead of investing in the data-loop infrastructure would be the wrong call.

**Intentionally retained / declined (1):**

- **1.1 (P2)** — Vision statement names functions ("learn, dose, track, source") rather than positive change in the user's life. *Why retained:* prior 3-model consensus already accepted; founder confirmed it reads correctly for the target audience; re-revising the North Star line risks regression for downstream docs that quote its phrasing. Marked as a permanent known quality gap in the review artifact.

**Regressions from prior review:** None.

**Files modified:**
- `docs/vision.md` (+22 lines, -5 lines)
- `docs/reviews/vision-review-vision.md` (+75 lines)

---

### Step 2: review-prd

**Artifact**: `docs/plan.md` (991 → ~1008 lines after fixes)
**Review log**: `docs/reviews/pre-review-prd.md`
**Mode**: update / re-review
**Gate result**: Conditional Pass → **Full Pass**

**Findings raised (3 total):**

| # | Severity | Finding | Section |
|---|----------|---------|---------|
| N1 | P2 | §6 Year 3 "Community reputation" measurement undefined operationally (no who/what/cadence/threshold) | §6 |
| N2 | P2 | §7.5 Phase 2 legal gate has no specified reviewer, scope, or pass/fail criteria | §7.5 |
| N3 | P2 | §5.2.1 protocol lifecycle has `deactivated` status with undefined dashboard behavior; subsumes prior P2 7.3 | §5.2.1 + §5.5 |

**Findings fixed (3):**

1. **N3 — Deactivated protocol behavior (P2)** — Added a full Deactivated paragraph (terminal soft-delete, immediately excluded from "today's doses," visible under Inactive filter, dose history preserved, not resumable — clone to revive). Added a separate "Admin-initiated deactivation of a managed user's protocol" paragraph defining dashboard refresh behavior and in-flight log handling. **Why this is the right fix:** the lifecycle type had four states but only three were behaviorally specified — `deactivated` was a "ghost state" that stories couldn't be written against. Defining both the protocol-level behavior and the admin-initiated mid-day variant closes the loop completely.
2. **N1 — Community reputation operationalized (P2)** — Replaced "Community monitoring" with a quarterly monitoring protocol: 3 named subreddits + 2-3 biohacker Discords; counts only unsolicited mentions by non-Power-User-affiliated users; target ≥ 5 references per quarter by end of Year 3; log location `docs/community-references.md`. **Why:** the prior text was aspirational language hiding inside a measurement column; without a protocol, the criterion could never be evaluated as pass/fail.
3. **N2 — Phase 2 legal gate operationalized (P2)** — Rewrote the gate as a 6-item checklist with hard-pass criteria: (1) written managed-user acknowledgment, (2) no minors/incapacity, (3) data-export + deletion flows verified, (4) audit log integrity, (5) honest product framing, (6) state-law review. Added the rule "if any item fails, Phase 2 does not ship." **Why:** the Phase 2 gate in §10 referenced this review as a blocker, but the review itself was undefined — the gate could be silently waved through. The checklist makes the gate falsifiable.

**Intentionally retained / declined (1):**

- **4.2 (P2)** — Spreadsheet decommissioning and DP support-burden metrics are self-reported. *Why retained:* acceptable for a personal tool; no automated proxy available without invasive instrumentation (which would violate the privacy principle).

**Regressions from prior review:** None. All 6 P1 fixes from the initial review remain intact.

**Files modified:**
- `docs/plan.md` (+18 lines, -3 lines)
- `docs/reviews/pre-review-prd.md` (+50 lines)

---

### Step 3: review-user-stories (multi-model context, single-channel re-review)

**Artifact**: `docs/user-stories.md` (457 → ~600 lines after fixes)
**Review log**: `docs/reviews/pre-review-user-stories.md`
**Mode**: update / re-review (prior multi-model artifacts in `docs/reviews/user-stories/` used as input context)
**Gate result**: **Full Pass** (upgraded from initial Conditional Pass)

**Findings raised (13 total):**

| # | Severity | Finding (one-line) |
|---|----------|--------------------|
| N1 | P1 | Missing: user changes own password (PRD §5.6) |
| N2 | P1 | Missing: user changes own email (PRD §5.6) |
| N3 | P1 | Missing: Power User deletes managed user account with data export (PRD §5.5) |
| N4 | P1 | US-ORD-07 state machine missing Cancelled terminal state + Cancel action (PRD §5.4.4) |
| N5 | P2 | US-ADM-01 missing Resend invite AC (PRD §5.5) |
| N6 | P2 | US-TRK-01 missing EOD/specific-days/custom-interval frequencies (PRD §5.2.1) |
| N7 | P2 | US-TRK-09 missing push-denied + email-failure edge cases (PRD §5.2.7) |
| N8 | P2 | US-ORD-04 missing 60-sec duplicate-send idempotency (PRD §5.4.3) |
| N9 | P2 | Admin-initiated mid-day deactivation behavior not covered (PRD §5.2.1 step-2 addition) |
| N10 | P3 | US-TRK-04 missing full site list + route-respect + first-dose ACs (PRD §5.2.3) |
| N11 | P3 | US-REF-01 missing "Profile in progress" + archived-compound ACs (PRD §5.1) |
| N12 | P3 | US-AUT-02 missing 48h delay / immediate option / session revoke detail (PRD §5.7) |
| N13 | P3 | Gap between Send and Payment — "awaiting vendor reply" state had no story (PRD §5.4.4 step 1) |

**Findings fixed (13) — high-level summary:**

1. **N1 — US-AUT-06 added (Change Own Password)**. 5 ACs including the non-obvious "all other sessions invalidated" rule. **Why:** change-password is foundational auth that was simply missing; session-invalidation is the security-critical AC that's easy to forget.
2. **N2 — US-AUT-07 added (Change Own Email)**. 5 ACs including verify-new-email gate and the **old-email revert-within-48h notification**. **Why:** email change is an account-takeover vector — the old-email notification prevents silent compromise.
3. **N3 — US-ADM-04 added (Delete Managed User)**. 5 ACs including export-first-to-admin and FK preservation in audit log. **Why:** the prior stories stopped at deactivation; the export-first AC protects the managed user's data rights even at delete time.
4. **N4 — US-ORD-07 expanded**. Added Cancelled terminal state, Cancel-from-any-non-terminal action, Stale auto-flag banner, forward-only transition rule. **Why:** the happy path was covered but failure paths (vendor never replies → user wants to cancel) were not — this is a frequent real-world case.
5. **N5 — US-ADM-01 expanded**. 4-state invite model + resend semantics (invalidates prior link) + duplicate-invite guards. **Why:** resend is a guaranteed need; "invalidates the prior link" is the security-critical detail.
6. **N6 — US-TRK-01 + AC 5**. Lists 4 supported frequencies. **Why:** without this AC, implementers may ship "daily only" and have to retrofit.
7. **N7 — US-TRK-09 + ACs 4-5**. Push-denied banner-and-fallback; email failure logged-not-retried. **Why:** reminders are best-effort; silent fail-soft prevents noisy retry loops.
8. **N8 — US-ORD-04 + ACs 3-4**. 60-second duplicate-send confirmation; stale-wallet warning showing prior address. **Why:** both target the highest-cost error mode in the system (wrong-wallet crypto sends).
9. **N9 — US-ADM-03 + AC 4**. Mid-day deactivation behavior on managed user's dashboard; in-flight log handling. **Why:** mirrors the PRD update from step 2; prevents phantom "today's dose" entries on managed user screens.
10. **N10 — US-TRK-04 + ACs 3-5**. Full 8-site list, route-aware filtering, first-dose behavior. **Why:** matches PRD §5.2.3 verbatim; prevents ad-hoc smaller site lists.
11. **N11 — US-REF-01 + ACs 5-6**. Profile-in-progress placeholder; archived-compound display. **Why:** silent failures on these paths would corrupt dose-log displays.
12. **N12 — US-AUT-02 expanded**. 48h delay default with in-window cancel, immediate option via second confirm, Telegram session revocation, sync/async export thresholds. **Why:** the 48h window is an important user safety net; session-revoke prevents post-deletion replay.
13. **N13 — US-ORD-09 added (Await Vendor Reply)**. 3 ACs covering the in-between state, vendor chat deep-link, capture-vendor-reply action bridging to US-ORD-04. **Why:** the gap between Send and Payment was where the user reads vendor's message; without a named state the implementation could collapse it confusingly.

**Story count change:** 26 → 30 (added US-AUT-06, US-AUT-07, US-ADM-04, US-ORD-09).

**Intentionally retained / declined:** None.

**Regressions from prior review:** None.

**Files modified:**
- `docs/user-stories.md` (+~155 lines, -8 lines)
- `docs/reviews/pre-review-user-stories.md` (+~120 lines)

---

### Step 4: review-domain-modeling

**Artifacts**: 7 files in `docs/domain-models/` (index, auth, tracker, reconstitution, ordering, audit, reference) — 529 → ~750 lines after fixes
**Review log**: `docs/reviews/review-domain-modeling.md`
**Mode**: update / re-review (accounts for new requirements from batch steps 2-3)
**Gate result**: **Full Pass** (upgraded from INITIAL)

**Findings raised (12 total):**

| # | Sev | Finding (one-line) |
|---|-----|--------------------|
| N1 | P1 | Auth: missing `Session` + `EmailChangeRequest` entities |
| N2 | P1 | Auth: `Invite` referenced but never defined as entity |
| N2.1 | P1 | Ordering: `Vendor` listed as Key Aggregate but absent from ordering.md |
| N3 | P1 | Tracker: `OutcomeLog` named in ubiquitous language but never modeled |
| N4 | P1 | Ordering: `Order` missing line items collection |
| N5 | P2 | Reconstitution: `Vial.orderId` missing despite cross-context arrow |
| N6 | P2 | Cycle.status enum mismatch with PRD §5.2.4 |
| N9 | P2 | Order missing `sendMethod` field from step-2 PRD fix |
| N10 | P2 | Audit: action vocabulary missing new auth + email events |
| N11 | P3 | index.md omits AuditEvent + audit.md from listings |
| N12 | P3 | Auth domain events list incomplete |
| N13 | P3 | `ReminderPreference` not modeled (promoted from prior F-002 deferral) |

**Findings fixed (12):**

1. **N1 — Session + EmailChangeRequest (P1, auth.md)**. **Why:** without `Session` the 30-day rolling expiry and password-change session-invalidation rules can't be enforced at the domain layer; without `EmailChangeRequest` the new US-AUT-07 verify-and-revert flow has no aggregate to attach state to. Added both with full attribute sets including the 48h revert window for email changes.
2. **N2 — Invite entity added (P1, auth.md)**. **Why:** events without an entity are unenforceable; the "resend revokes prior + creates new" rule is the security-critical part of the multi-user invitation flow.
3. **N2.1 — Vendor + VendorCatalogProduct (P1, ordering.md)**. **Why:** the `vendorId` FK on Order was pointing nowhere; the catalog product is what line items reference.
4. **N3 — OutcomeLog + ProtocolRating (P1, tracker.md)**. **Why:** US-TRK-06 captures this; without a domain entity the data has no home and persistence has no schema target.
5. **N4 — OrderLineItem value object (P1, ordering.md)**. **Why:** Order is meaningless without line items; the duplicate-merge invariant (PRD §5.4.3) prevents quantity-doubling bugs on duplicate add.
6. **N5 — Vial.orderId FK (P2, reconstitution.md)**. **Why:** matches the index.md cross-context arrow that was previously aspirational; lets the inventory-on-receipt flow be traced.
7. **N6 — Cycle.status enum aligned (P2, tracker.md)**. **Why:** mismatched enums cause silent data-corruption when persistence reads a status value the domain model doesn't recognize. PRD is the source of truth.
8. **N9 — Order.sendMethod (P2, ordering.md)**. Added with "set exactly once at Sent transition, immutable afterward" invariant. **Why:** Phase 2 success metric depends on this field.
9. **N10 — Audit action vocabulary (P2, audit.md)**. **Why:** the prior list was an example, not a contract; without canonical names the action vocabulary diverges per-service and audit queries break.
10. **N11 — index.md fixes (P3)**. Added Audit to Key Aggregates + audit.md to file listing. **Why:** index.md is the entry point for new contributors.
11. **N12 — Auth events list (P3, auth.md)**. Expanded from 4 events to 14 covering session creation, password reset/change, email change (3), account deletion + cancel. **Why:** events are the integration contract between Auth and Audit; missing events become silent audit-log gaps.
12. **N13 — ReminderPreference (P3, tracker.md)**. **Why:** prior deferral made sense pre-architecture, but US-TRK-09 (step 3) added 5 ACs — the domain owes a model.

**Also applied (consistency hardening):**

- `Decimal` annotations on `Vial.totalMg/bacWaterMl/remainingMg`, `DoseAmount.value`, and all `ReconstitutionResult` numeric fields — per `.claude/rules/safety-math.md` ("ALWAYS use Decimal — NEVER Float"). The prior models used `number` ambiguously.
- `ReconstitutionResult` expanded with `concentrationMgPerMl` + low/typical/high cross-check fields per PRD §5.3.
- `Schedule.frequency` enum updated to `(Daily, EOD, SpecificDaysOfWeek, CustomInterval)` with `daysOfWeek` field — aligned with step-3 US-TRK-01 AC 5. (The prior model had `MWF` as an enum value, which conflated specific-days-of-week into a single hard-coded combination.)
- Added "Daily Outcome" aggregate + uniqueness invariant (one OutcomeLog per user per scheduled date).
- Tracker domain events expanded with `DoseBatchLogged`, `OutcomeLogged`, `ReminderSent`, `ReminderDeliveryFailed`, all protocol lifecycle events, all cycle events.

**Intentionally retained / declined:** None.

**Regressions from prior review:** None.

**Files modified:**
- `docs/domain-models/index.md` (+3 lines)
- `docs/domain-models/auth.md` (+~50 lines)
- `docs/domain-models/tracker.md` (+~50 lines, partial rewrite of value objects + events)
- `docs/domain-models/reconstitution.md` (+~10 lines, Decimal annotations)
- `docs/domain-models/ordering.md` (full rewrite, +~80 lines net)
- `docs/domain-models/audit.md` (+~15 lines)
- `docs/reviews/review-domain-modeling.md` (+~80 lines)

---

### Step 5: review-adrs (regression repair + new findings)

**Artifacts**: 14 ADRs + index in `docs/adrs/` — initial state: ADR-010 silently missing
**Review log**: `docs/reviews/review-adrs.md`
**Mode**: update / re-review (accounts for new requirements from steps 2-4)
**Gate result**: **Full Pass** (with 2 P3 polish items explicitly deferred)

**Critical: P0 regression repaired** — the prior review's Resolution Log claimed F-001 was RESOLVED with "Added ADR-010", but the file did not exist and the index did not list ADR-010. This re-review actually creates ADR-010 and adds it to the index.

**Findings raised (10 total):**

| # | Sev | Finding |
|---|-----|---------|
| N1 | **P0** | ADR-010 (AI strategy) was marked RESOLVED in the prior review but the file didn't exist |
| N2 | P1 | ADR-004 (Auth.js) didn't address Session/Invite/EmailChangeRequest entities from step 4 |
| N3 | P1 | ADR-007 (PWA) didn't address Web Push subscription for US-TRK-09 dose reminders |
| N4 | P1 | ADR-009 (Audit) retention policy didn't address actor/subject user-id preservation on user deletion |
| N5 | P2 | ADR-008 (Testing) mentioned 100% coverage but didn't reference safety-math.md / testing.md rules |
| N6 | P2 | ADR-012 (Cron) didn't specify schedules for stale-order, audit purge, reminder dispatch, etc. |
| N7 | P2 | ADR-014 (R2) didn't address lifecycle / expired export cleanup |
| N8 | P3 | index.md didn't list ADR-010 (consequent to N1) |
| N9 | P3 | ADRs lack metadata footer (Decided By / Reviewed By) |
| N10 | P3 | Most ADRs lack explicit "Traces" / requirement-trace sections |

**Findings fixed (8 fully + 2 partially):**

1. **N1 — ADR-010 created (P0)** — Anthropic Claude primary (Sonnet 4.6 drafting, Haiku 4.5 batch), Gemini secondary, OpenAI not v1, full allowed/disallowed-uses lists, Anthropic prompt caching non-optional, AI failure-handling policy. Added to index.md. **Why this is the right fix:** the file's absence meant Phase 3 features had no architectural foundation; the prior "resolved" marker masked the gap. The detailed allowed/disallowed list is the binding constraint that prevents AI scope creep.
2. **N2 — ADR-004 expanded (P1)** — Mapping section for Session/Invite/EmailChangeRequest/PasswordResetToken. **Why:** Auth.js's Session table covers part of the domain Session entity but not revocation; Invite/EmailChangeRequest/PasswordResetToken require custom tables. Without this mapping the implementer might either re-implement Session storage or skip the custom tables entirely.
3. **N3 — ADR-007 expanded (P1)** — Web Push subscription via service worker, VAPID keys as env vars, iOS Safari install constraint, email as mandatory fallback. **Why:** US-TRK-09 depends on Web Push but the PWA ADR was silent — the implementer might miss the dependency or pick a different push mechanism.
4. **N4 — ADR-009 expanded (P1)** — User Reference Preservation section: actor/subject user IDs are historical references with NO FK constraint, no cascade-delete, LEFT JOIN + "[deleted user]" display. **Why:** the audit trail must survive user deletion to be useful as a forensic record; without explicit "no FK" the implementer could accidentally cascade-delete audit history on account deletion.
5. **N5 — ADR-008 expanded (P2)** — "Coverage Requirements (binding)" section with explicit rule references. **Why:** the "100% coverage" target was aspirational without an enforcement mechanism; binding the ADR to the rules makes the gate enforceable in CI.
6. **N6 — ADR-012 expanded (P2)** — Cron Schedules table with 6 jobs (dose reminders every 15min, stale orders daily 09:00 UTC, audit purge 04:00 UTC, backup verify 05:00 UTC, export cleanup 03:00 UTC, PubMed digest weekly). **Why:** schedules drift without an authoritative list; the table is a single review surface.
7. **N7 — ADR-014 expanded (P2)** — Lifecycle policy: 7-day signed URL + 7-day R2 retention + daily cleanup cron + 14-day defense-in-depth R2 native policy. **Why:** PRD §5.7 said exports are emailed within 5 min but didn't say how long they last — without the policy R2 grows unbounded.
8. **N8 — index.md updated (P3)** — Added ADR-010 row.
9. **N9 — Metadata footer (P3) — DEFERRED** with rationale: org-process polish; solo build has no separate reviewer; re-trigger when team size > 1.
10. **N10 — Traces sections (P3) — PARTIALLY FIXED**: added to ADR-004, 007, 008, 009, 012, 014 (the ones whose decisions trace to multiple PRD/story/domain artifacts). Deferred for ADR-001, 002, 003, 005, 006, 011, 013, 015 — those have less-ambiguous PRD anchors and the prior review already addressed the most-critical (ADR-005 via F-004).

**Regressions from prior review:**
- F-001 was a P0 regression (ADR-010 missing despite RESOLVED marker). **Repaired in this re-review.** No regressions introduced by these fixes.

**Files modified:**
- `docs/adrs/ADR-010-ai-strategy.md` (new file, 39 lines)
- `docs/adrs/index.md` (+1 line)
- `docs/adrs/ADR-004-authjs.md` (+~22 lines)
- `docs/adrs/ADR-007-pwa-offline.md` (+~18 lines)
- `docs/adrs/ADR-008-testing-strategy.md` (+~12 lines)
- `docs/adrs/ADR-009-audit-logging.md` (+~18 lines)
- `docs/adrs/ADR-012-scheduled-jobs.md` (+~22 lines)
- `docs/adrs/ADR-014-object-storage.md` (+~18 lines)
- `docs/reviews/review-adrs.md` (+~75 lines)

---

### Step 6: review-architecture

**Artifact**: `docs/system-architecture.md` (144 → ~260 lines after fixes)
**Review log**: `docs/reviews/review-architecture.md`
**Mode**: update / re-review (accounts for new requirements from steps 2-5)
**Gate result**: **Full Pass** (upgraded from INITIAL)

**Findings raised (6 total):**

| # | Sev | Finding (one-line) |
|---|-----|--------------------|
| N1 | P1 | §2.1 Component Overview missing Admin, Export Pipeline, AI Layer components |
| N2 | P1 | §3 only had 2 flows; missing 6 (account deletion, password change, email change, invitation, reminder dispatch, async export) |
| N3 | P1 | §6 Cron table disagreed with ADR-012 step-5 update |
| N4 | P1 | Architecture silent on AI layer despite ADR-010 |
| N5 | P2 | §8 Failure Modes sparse (3 entries); missing Resend, Push, R2, cron-missed, AI failures |
| N6 | P2 | No rate-limit / backoff policy table |

**All 6 fixed.** Highlights:

1. **N1** — Expanded the component table from 9 → 12 entries; called out Admin + Export Pipeline + AI Layer; Auth/Ordering rows expanded with step-5 entity scope. **Why:** without these the architecture doesn't account for ~25% of the new functionality from steps 2-3.
2. **N2** — Added 6 new data flows in §3.3-§3.8 covering all the auth/admin flows added in steps 2-3. **Why:** the existing 2 flows (dose logging, ordering) were the most-critical flows but the new password/email change flows have important security semantics (session invalidation, verify + 48h revert) that need to be designed at architecture time, not implementation time.
3. **N3** — Rewrote the cron table aligned with ADR-012. **Why:** divergence between architecture and ADR is exactly the kind of silent drift that produces missed jobs or wrong frequencies — the cross-reference rule ("ADR is authoritative; updates land there first") prevents future drift.
4. **N4** — Added AI Layer to component table + mentioned in cron + failure-mode sections. **Why:** ADR-010 was created in step 5 but the architecture hadn't acknowledged it; the "AI failures never block user-facing flows" rule belongs in the architecture, not just in the ADR.
5. **N5** — Rewrote §8 as §8.1 with 9 failure modes covering all external services. Added the silent-fail-soft policy for reminder emails (US-TRK-09 AC 5) and the AI-failure-isolation policy. **Why:** the prior 3 entries were a starting point; without comprehensive failure coverage the implementation defaults to "crash" or "retry forever" — both wrong.
6. **N6** — Added §8.2 Rate limits and backoff policies table. **Why:** without explicit per-service rate-limit handling the system will hit production limits silently or implement ad-hoc per-call retry logic that diverges.

**Regressions:** None. All 8 prior-pass findings remain RESOLVED.

**Files modified:**
- `docs/system-architecture.md` (+~116 lines, partial rewrite of §2.1, §6, §7, §8)
- `docs/reviews/review-architecture.md` (+~60 lines)

---

### Step 7: review-database (2 P0s repaired + 8 new findings fixed)

**Artifacts**: `docs/database-schema.md` (295 → ~380 lines, full rewrite) + `prisma/schema.prisma` (substantial changes)
**Review log**: `docs/reviews/review-database.md`
**Mode**: update / re-review
**Gate result**: **Full Pass** (upgraded from INITIAL)

**Two critical issues repaired:**

1. **P0 schema compile-blocker**: `prisma/schema.prisma:69` had `expires_at Integer?` — not a valid Prisma scalar type. The schema would fail `prisma generate`. Fixed to `Int?`.
2. **P0 doc drift**: `docs/database-schema.md` still showed the pre-F001-fix schema even though the actual `schema.prisma` had been updated by the prior review. Reviewers and implementers were seeing two contradicting schemas. Doc fully rewritten to mirror the actual schema with explicit "Source of truth" header pointing at `schema.prisma`.

**Findings raised (10 total):**

| # | Sev | Finding |
|---|-----|---------|
| N1 | P0 | `expires_at Integer?` — invalid Prisma type, schema doesn't compile |
| N2 | P0 | docs/database-schema.md documented the stale pre-fix schema |
| N3 | P1 | Missing `EmailChangeRequest` model (step-4 domain addition for US-AUT-07) |
| N4 | P1 | `Session` missing extension cols `lastSeenAt`, `revokedAt`, `ipAddress`, `userAgent` per ADR-004 step-5 |
| N5 | P1 | `OrderItem` was degenerate (only quantity); missing compoundId, form, vialSizeMg, unitPrice, currency per step-4 |
| N6 | P1 | `Order` missing `sendMethod`, `staleFlaggedAt`, `cancelledAt`, `cancelledByUserId`, `receivedAt` |
| N7 | P1 | `Vendor` missing `userId`, `messageTemplate`, `preferredCurrency`, `createdAt` |
| N8 | P1 | `OutcomeLog` mismatched domain (field name `date` vs `scheduledDate`, missing constraints + ProtocolRating) |
| N9 | P2 | `ReminderPreference` missing `pushPermissionState`, `emailFallbackEnabled` per step-4 + ADR-007 step-5 |
| N10 | P2 | §2 silent on AuditEvent historical-reference policy (ADR-009 step-5) |

**All 10 fixed.** Highlights:

1. **N1** — `Integer?` → `Int?`. **Why critical:** the schema literally would not compile; this single character bug blocked every implementer.
2. **N2** — Full doc rewrite with "Source of truth: prisma/schema.prisma" header. **Why critical:** docs that contradict the code are worse than missing docs; downstream agents would have implemented to the doc and broken production.
3. **N5/N6/N7** — Replaced the degenerate Order/OrderItem/Vendor models with the full step-4 domain shape. Added the `@@unique([orderId, compoundId, form, vialSizeMg])` index that implements the PRD §5.4.3 duplicate-merge invariant at the DB level (not just application-level). **Why:** without proper line items, every order is just a quantity number — vendors get incoherent messages, inventory updates can't link to specific compounds.
4. **N8** — Renamed OutcomeLog fields to match domain; added the unique-per-day constraint and ProtocolRating sub-entity. **Why:** field-name drift between schema and domain leads to silent persistence failures during implementation.
5. **N9** — Expanded ReminderPreference with `pushPermissionState` (matches ADR-007 step-5 Web Push subscription policy). **Why:** without this field the reminder UI can't distinguish "user hasn't been asked" from "user denied permission" and would re-prompt obnoxiously.
6. **N10** — Added explicit comment to `AuditEvent` in schema.prisma documenting the no-FK rule + §2.3 Referential Integrity Exceptions section in the doc. **Why:** the no-FK policy is easy to break with a "helpful" Prisma migration that adds the constraint.

**Also added:**

- `User.vendors` and `User.emailChangeRequests` back-references.
- `Compound.orderItems` back-reference.
- `@@index([userId, revokedAt])` on Session for active-session enumeration on password change.
- `@@index([userId, status])` on EmailChangeRequest for the settings page lookup.
- `@@index([category, timestamp])` on AuditEvent for category-scoped audit pages.
- Migration safety checklist in §4.1 (binding: no Decimal downgrade without ADR; no AuditEvent column drop without retention exemption).
- Cross-references section (§7) linking to domain models, ADRs, and PRD sections.

**Regressions:** None introduced. The 9 prior-pass P0/P1 fixes (F-001..F-009) remain in place; this re-review caught that they were never reflected in the doc.

**Files modified:**
- `prisma/schema.prisma` (+~70 lines net: EmailChangeRequest, Session ext fields, OrderItem rewrite, Vendor expansion, OutcomeLog rename+constraints, ProtocolRating new, ReminderPreference fields, AuditEvent comment + index)
- `docs/database-schema.md` (full rewrite, 295 → ~380 lines)
- `docs/reviews/review-database.md` (+~60 lines)

