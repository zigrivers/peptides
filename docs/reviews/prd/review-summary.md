# PRD Multi-Model Review — Synthesis

**Date:** 2026-05-20  
**PRD:** `docs/plan.md`  
**Models:** Claude (Sonnet 4.6) + Codex (GPT-5.5) + Gemini (timeout — excluded)  
**Status:** COMPLETE — all P1 fixes applied

---

## Model Coverage

| Model | Findings | Gate | Status |
|-------|----------|------|--------|
| Claude (Sonnet 4.6) | 21 (P0: 0, P1: 6, P2: 14, P3: 1) | Conditional Pass | Complete |
| Codex (GPT-5.5) | 26 (P0: 3, P1: 14, P2: 5, P3: 0) | Fail | Complete |
| Gemini | — | N/A | CLI timeout |

---

## Consensus Findings (both models flagged)

| Topic | Claude | Codex | Disposition |
|-------|--------|-------|-------------|
| Problem statement lacks quantitative evidence | 1.1 P1 | 1.1 P1 | **Fixed** — §1 quantified |
| Order lifecycle missing cancel/stale states | 7.1 P1 | 3.4 P1 | **Fixed** — §5.4.4 state machine added |
| Invite link expiry and resend flow missing | 7.2 P1 | 7.5 P2 | **Fixed** — §5.5 72h expiry + resend flow |
| Data retention incomplete | 5.1 P1 | 5.2 P1 | **Fixed** — §5.7 retention matrix added |
| Telegram rate limits undocumented | 6.1 P1 | (in 6.2) | **Fixed** — §7.1 rate limit note added |
| Monitoring/observability NFR missing | 5.3 P2 | 5.1 P1 | **Fixed** — §8.7 added |
| i18n policy not stated | 5.2 P2 | 5.3 P2 | **Fixed** — §8.8 added |

---

## Divergent Findings

### Codex-unique P0s — synthesized assessment

**Codex 3.1 — Scope/MoSCoW/phase delivery conflict (P0)**  
Assessment: Valid concern; rated P1 not P0 for a personal tool with a solo developer where intent is clear. The terminology "v1 scope" vs. "Phase 2 delivery" was ambiguous.  
Fix: Added clarifying alignment note to §4 and §10 explaining phases = build order, MoSCoW = completeness gate. Data export phasing clarified (deletion export = Phase 1; settings UI = Phase 3).

**Codex 6.1 — Legal/regulatory review deferred too late (P0)**  
Assessment: Valid for managed user data obligations; the PRD already gates on "legal review before paid license" but didn't address Phase 2 data stewardship.  
Fix: Added Phase 2 legal gate to §7.5 covering managed user data obligations review before Phase 2 ships.

**Codex 8.1 — User stories can't be sequenced (P0)**  
Assessment: Downstream consequence of 3.1. Resolved by 3.1 fix.

### Codex-unique P1s — applied

| Finding | Codex | Fix Applied |
|---------|-------|-------------|
| Mobile MoSCoW contradiction | 3.3 | §4 clarifying note: mobile dose-logging = first-class NFR; "mobile layout" Could Have = admin/PU polish |
| Order success metric conflict Phase 2 vs. Year 1 | 4.2 | §6 both targets clarified as cumulative |
| MTProto feasibility not gated | 3.2 | §5.4 feasibility gate added |
| External dependency limits undocumented | 6.2 | §7.1 transactional email + PubMed constraints added |
| Dose schedule edge cases | 7.3 | §5.2.2 missed/skip/late/timezone cases added |
| Payment edge cases | 7.4 | §5.4.4 duplicate send + stale wallet + vendor price change added |
| Fallback flag field missing from order record | Claude 4.1 | §5.4.3 `send_method` field added to order record |

### Codex-unique P1s — deferred to User Stories

| Finding | Codex | Rationale |
|---------|-------|-----------|
| Power User persona is "Everything User" | 2.1 | Intentional: solo builder is legitimately all roles; note in §2 is sufficient |
| Compliance stakeholder not represented | 2.2 | Addressed by Phase 2 legal gate in §7.5 |
| Session expiry mid-flow | 7.1 | Appropriate level for user stories, not PRD |
| Concurrent access conflicts | 7.2 | Story-level acceptance criteria |
| Permission matrix | 8.3 | User stories deliverable |

---

## Final Gate Result

**Gate:** **Conditional Pass** — proceed to User Stories with constraints

**Remaining P2 items (none block stories):** See `pre-review-prd.md` §Pass 4.2, 4.3 (self-reported metrics), 8.1 (Phase 3 stubs — addressed).

**Handoff notes to User Stories phase:**
- Ordering epics require the state machine from §5.4.4 (Draft → Sent → Confirmed → Payment Sent → Received | Cancelled; Stale auto-flag)
- Multi-user epics require the invite lifecycle from §5.5 (72h expiry, resend, 4 invite states)
- Mobile dose-logging is first-class — stories must include mobile acceptance criteria
- Reconstitution + payment flows: 100% unit test coverage required per §7.4
- Phase 3 features (AI parser, PubMed watch) now have stubs in §3.3 for architecture extensibility design
- Legal gate required before Phase 2 stories are shipped
- MTProto feasibility gate required before Phase 1 ordering stories are marked done
