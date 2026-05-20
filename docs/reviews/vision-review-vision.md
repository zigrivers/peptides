# Review Report: docs/vision.md

**Date**: 2026-05-20 (initial) / 2026-05-20 (re-review, auto-fix batch)
**Methodology**: deep | Depth: 5/5
**Status**: RE-REVIEWED — all new findings fixed
**Models**: Claude (Sonnet 4.6) + Codex (GPT-5.5) + Gemini (initial); Claude (Opus 4.7) for re-review

---

## Executive Summary

The vision document is strategically sound with a clear differentiated position (grey-market-first, ordering moat, honesty principle). No P0 blockers. Four P1 gaps emerged — primarily around multi-user architecture, sourcing boundary definition, competitive scan completeness, and an architecture mismatch (local-first vision vs. confirmed web-app architecture). Three models participated; Codex produced the most actionable P1 findings via live web search on the competitive landscape. All P1 findings were resolved before the PRD phase.

**Total findings:** 16 (P0: 0 | P1: 5 | P2: 8 | P3: 3)

---

## Findings by Pass

### Pass 1: Vision Clarity

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 1.1 | P2 | Vision statement names product functions ("learn, dose, track, source") rather than describing positive change in the user's life | §1 Vision Statement | Consensus (Claude + Codex + Gemini) |
| 1.2 | P2 | Meta-commentary annotation "(23 words. Testable...)" is authoring notes embedded in the document, not content | §1 Vision Statement | Claude |
| 1.3 | P3 | "Honest" is the pivot word of the vision but is not operationally defined within the document | §1 Vision Statement | Gemini |

### Pass 2: Audience Precision

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 2.1 | P1 | Secondary persona (Guided Newcomer) is ambiguous — could be a delegated participant managed by Power User, or a self-serve newcomer. These require fundamentally different UX and feature investment. | §4 Target Audience | Consensus (Claude + Codex) |
| 2.2 | P2 | Primary persona is defined as "you" (the founder) without a behavioral qualification checklist for identifying future users who match the profile | §4 Target Audience | Codex + Gemini |

### Pass 3: Competitive Rigor

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 3.1 | P1 | Competitive scan is incomplete for the 2026 market. Active competitors not covered: Titer (privacy-first, AES-256, multi-compound), Regimen (TRT+peptides+GLP-1), SHOTLOG (calculator + injection rotation + wellness journal), Shotlee (free, dose logging), The Pep Planner, Regimen. Titer's privacy positioning directly competes with the stated privacy principle. | §6 Competitive Landscape | Codex (with web search) |
| 3.2 | P2 | "Ordering integration is the moat" is stated but not layered — relies on full Telegram automation, which is acknowledged as a stretch goal. A moat that may not ship in v1 is a weak moat. | §6 / §11 | Consensus (Codex + Gemini) |
| 3.3 | P2 | "Honesty is a moat" claim is brand-level, not structural. Any competitor could adopt an honest tone. The structural moat is ordering integration + grey-market-first positioning. | §6 Genuine Differentiation | Claude |

### Pass 4: Strategic Coherence

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 4.1 | P1 | ARCHITECTURE MISMATCH: Principle 4 ("local-first / private-by-default") contradicts the confirmed multi-tenant web app architecture (user accounts, cloud DB, super admin). The privacy commitment is real but "local-first" is not accurate. | §7 Principle 4 | Claude (discovered via user decision) |
| 4.2 | P1 | Compliance contradiction: §11 suggests "selling the license as a generic protocol manager without surfacing ordering" — this contradicts Principle 3 (honesty over compliance theater). Resolved: ordering is an opt-in advanced module; the product is honestly described as tracker/reference first. | §11 Strategic Risks | Codex |
| 4.3 | P2 | Principle 2 ("power over simplicity for the Power User, with guided flows for newcomers") is a compound conditional that weakens its decision-making utility. It is unclear which wins when building a feature. | §7 Principle 2 | Claude |
| 4.4 | P2 | AI policy boundary is operationally undefined — anti-vision rejects "AI peptide coach" but leaves room for "AI research summarizer." The line between summarizing and recommending is not stated. | §7 Anti-Vision / §8 | Codex |
| 4.5 | P2 | Lifetime license sustainability: ongoing costs (reference maintenance, vendor flow updates, security, legal review) may not be covered by one-time license. This assumption should be explicit. | §9 Business Model | Consensus (Claude + Codex) |

### Pass 5: Downstream Readiness

| # | Severity | Finding | Location | Source |
|---|----------|---------|----------|--------|
| 5.1 | P1 | Open Question 5 (multi-user architecture) is PRD-blocking — resolved per user: web app with user accounts, Power User as super admin, each user sees own data. This must be incorporated into the vision. | §12 Open Questions | Consensus (all 3 models) |
| 5.2 | P1 | Sourcing boundary not defined: the vision does not state what v1 ordering does vs. defers. Blocks user stories for the ordering module. | §5 / §11 | Codex |
| 5.3 | P2 | Open Question 2 (platform shape) needs a directional answer before PRD; now resolved: multi-tenant web app. | §12 Open Questions | Claude + Codex |
| 5.4 | P2 | Success criteria lack safety/quality thresholds for dose math and order confirmation flows — dangerous if wrong. | §10 Success Criteria | Codex |
| 5.5 | P3 | Open Questions not labeled as PRD-blocking vs. tech-stack-blocking vs. later. Hard to know what blocks PRD. | §12 Open Questions | Codex |

---

## Multi-Model Synthesis

### Consensus Findings (2+ models agree — high confidence)
- Multi-user architecture is PRD-blocking (all 3)
- Vision statement functional not aspirational (all 3)
- Secondary persona ambiguous (Claude + Codex)
- Ordering moat weakened by guided-manual-first (Codex + Gemini)
- Business model sustainability underestimated (Claude + Codex)

### Divergent Findings
- **Gemini**: Flagged de-platforming/hosting risk as P1. Claude assessed this as MEDIUM risk already covered in §11. **Resolution**: MEDIUM risk already in §11; no separate finding added.
- **Codex**: Flagged competitors with live web search — validated independently. Accepted as P1.

---

## Fix Plan

### Batch 1: Architecture alignment — Principle 4 reframe (P1)
- **Finding**: 4.1 — "local-first" is inaccurate; architecture is confirmed multi-tenant web app
- **Fix approach**: Reframe Principle 4 from "local-first / private-by-default" to "user-controlled data over engagement-driven data mining." Privacy commitment = no data selling, no protocol-data analytics, user can export/delete all data.
- **Affected sections**: §7 Principle 4, §5 Value Prop item 5

### Batch 2: Multi-user architecture resolution (P1)
- **Findings**: 2.1, 5.1 — secondary persona clarity + Q5 resolution
- **Fix approach**: Update secondary persona to "Delegated Participant (v1)." Add resolved architecture to §4 and close Q5 in §12 with the decision.
- **Affected sections**: §4, §12 Q5

### Batch 3: Sourcing boundary definition (P1)
- **Finding**: 5.2 — ordering scope unclear
- **Fix approach**: Add sourcing boundary callout: v1 = structured order composition + payment checklist + inventory capture. Telegram automation = v2 stretch goal. Update differentiation to layered moat definition.
- **Affected sections**: §5, §6 Genuine Differentiation, §12 Q4

### Batch 4: Compliance strategy clarification (P1)
- **Findings**: 4.2 — compliance contradiction
- **Fix approach**: Replace "sell as generic manager to hide ordering" with: "ordering is an opt-in advanced module; product is honestly described as tracker/reference first; Stripe/mainstream processors for base license, crypto or permissive processors for ordering feature access."
- **Affected sections**: §11 Strategic Risks

### Batch 5: Competitive scan expansion (P1)
- **Finding**: 3.1 — missing 2026 competitors
- **Fix approach**: Add Titer, Regimen, SHOTLOG, Shotlee, The Pep Planner to competitive landscape with strengths/weaknesses.
- **Affected sections**: §6 Competitive Landscape

### Batch 6: Quick P2/P3 cleanup (P2/P3)
- Remove meta-commentary annotation from §1
- Reframe Principle 2 to remove compound conditional
- Add AI policy note to §8 Anti-Vision
- Add quality threshold to §10 Success Criteria (zero dose-calc defects)
- Label Open Questions as PRD-blocking / tech-stack / later
- Add directional answer to Q2 (web app confirmed)

---

## Fix Log

| Batch | Findings | Changes Made | New Issues |
|-------|----------|--------------|------------|
| 1 | 4.1 | Principle 4 reframed: "user-controlled data" over "local-first" | None |
| 2 | 2.1, 5.1 | Secondary persona = Delegated Participant v1; Q5 resolved | None |
| 3 | 5.2 | Sourcing boundary added to §5; moat layered in §6 | None |
| 4 | 4.2 | Compliance contradiction removed; ordering = advanced opt-in module | None |
| 5 | 3.1 | Titer, Regimen, SHOTLOG, Shotlee, The Pep Planner added to §6 | None |
| 6 | 1.2, 4.3, 4.4, 5.4, 5.5 | Meta-commentary removed; P2/P3 polish applied | None |

---

## Re-Validation Results

All 5 passes re-run against the updated vision.md:
- Pass 1 (Vision Clarity): Meta-commentary removed. Principle statement updated. P2 vision-is-functional finding remains as a known quality gap (not blocking).
- Pass 2 (Audience Precision): Secondary persona clarified. Architecture decision resolves delegation model.
- Pass 3 (Competitive Rigor): New competitors added with honest strength/weakness. Layered moat definition strengthens differentiation.
- Pass 4 (Strategic Coherence): Principle 4 corrected. Compliance strategy clarified. No new contradictions introduced.
- Pass 5 (Downstream Readiness): Q2 and Q5 resolved. Sourcing boundary defined. PRD can proceed.

No new P0/P1 findings introduced by fixes.

---

## Downstream Readiness Assessment

- **Gate result**: Conditional Pass
- **Handoff notes**:
  - PRD should treat the product as a multi-tenant web app; "local-first" language in old versions is superseded
  - Ordering feature = opt-in advanced module; PRD should scope v1 ordering as guided-manual only
  - Secondary persona = Delegated Participant managed by super admin; no self-serve newcomer onboarding in v1
  - Platform is web app; App Store is explicitly excluded
  - Q3 (local-first sync approach) is now moot — replaced by standard web app DB + auth
- **Remaining P2/P3 items**: Vision statement still describes features not positive change (P2 — known quality gap, acceptable for a personal tool vision); AI policy boundary still implicit (P2 — can be resolved in PRD or tech-stack step)

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7), single-channel re-review of the updated `docs/vision.md`. Depth 5/strict. Auto-fix mode: findings are fixed inline and recorded here.

### New findings

| # | Severity | Finding | Location | Detection |
|---|----------|---------|----------|-----------|
| N1 | **P1** | §12 Q9 "Legal review trigger" is labeled `[PRD-blocking]` but contains no directional decision — only restates the open question. PRD generation will stall here. | §12 Q9 | Pass 5 (downstream readiness) |
| N2 | P3 | §6 Genuine Differentiation lists 8 advantage bullets but never closes with a consolidated competitive thesis sentence. Reader must synthesize "where we win" themselves. | §6 line ~107 | Pass 3 (competitive rigor) |
| N3 | P3 | §10 Year 1 target "20 successful orders" doesn't specify guided-manual vs. automated ordering, creating ambiguity against §5's v1 scope note. | §10 line ~188 | Pass 4 (strategic coherence) + Pass 5 (handoff clarity) |

### Previously accepted P2/P3 findings re-opened for this fix batch

Per the auto-fix directive ("fix all findings"), these prior-pass findings that were accepted as known gaps are now fixed:

| # | Severity | Prior finding | Why fix now |
|---|----------|---------------|-------------|
| 1.3 | P3 | "Honest" is the pivot word but never operationally defined | Operational definition prevents drift across PRD/spec generation |
| 2.2 | P2 | Primary persona anchored to "you" without behavioral qualifier for identifying future Power Users | A qualifier checklist constrains scope decisions; prevents accidentally building for borderline users |
| 3.3 | P2 | "Honest tone earns trust — a structural advantage" overclaims; honest tone is brand-level, not structural | Mis-stating the moat distorts roadmap priorities |

### Intentionally retained (NOT fixed)

- **1.1 (P2)**: Vision statement names functions ("learn, dose, track, source") rather than describing positive change in the user's life. Retained because the prior 3-model consensus already accepted this gap, the founder confirmed the statement reads correctly for the target audience, and re-revising the North Star line risks regression for downstream documents that already reference its phrasing. Marked as a permanent known quality gap.

### Regressions detected

None. All P1 findings from the initial review remain fixed.

### Fixes applied

| Finding | Section edited | Why (root cause) | How (the change) |
|---------|----------------|------------------|------------------|
| 1.3 | §1, after vision statement | "Honest" was used as a load-bearing principle without operational meaning, leaving room for drift downstream | Added a 5-point "what 'honest' means here, operationally" list: (1) name the grey market, (2) no insincere disclaimers, (3) primary-research citations + anecdote labeling, (4) no paywalled safety features, (5) vendor referral revenue never biases sourcing recommendations |
| 2.2 | §4, after Primary Persona success criteria | Persona was anchored to "you" with behaviors implied but no test for matching future users — risk of scope drift when family adopts and friends-of-friends ask for access | Added a "Future Power User qualifier" 5-point checklist (3+ peptides concurrently with intent; cycles with PK/biomarker awareness; crypto-comfortable; sources outside telehealth; logs outcomes today or wants to) with the explicit rule "fails one — wrong product; fails two — categorically wrong product" |
| 3.3 + N2 | §6, end of Genuine Differentiation | The "honesty earns trust" bullet overstated honesty as a moat (which it is not — competitors could mimic it). Reader also had to synthesize 8 advantages into a thesis themselves | Rewrote the bullet to acknowledge honesty alone is not the moat; named the structural moat explicitly as (web platform) + (closed data loop) + (grey-market-first sourcing); added a "Net competitive thesis" closing sentence |
| N3 | §10 Year 1 success | "20 successful orders" was ambiguous against §5 v1 scope (guided-manual) — could read as either guided-manual or fully automated | Rewrote to explicitly say v1 guided-manual mode (app composes Telegram message + payment checklist; user clicks send and pays); noted v2 full automation is not required to hit the Year 1 metric |
| N1 | §12 Q9 | Q9 was labeled PRD-blocking but the body said "Define the line" without defining it — PRD generation could not proceed | Resolved with a directional default: legal review required before (a) any non-family external user accesses the app, OR (b) any paid license sale, whichever first. Personal + family use below the threshold. Listed three explicit re-trigger conditions. Relabeled `[RESOLVED — PRD inherits this default]` |

### Re-validation (post-fix)

- **Pass 1 (Vision Clarity)**: "Honest" now operationally defined. Vision statement unchanged (intentional). ✓
- **Pass 2 (Audience Precision)**: Power User qualifier checklist now provides a fitness test for future users. ✓
- **Pass 3 (Competitive Rigor)**: Moat correctly attributed to structural factors; honesty correctly framed as consequence not cause; net thesis closes the section. ✓
- **Pass 4 (Strategic Coherence)**: §10 Year 1 metric now consistent with §5 v1 scope. No new contradictions introduced. ✓
- **Pass 5 (Downstream Readiness)**: Q9 resolved; all `[PRD-blocking]` items now have directional answers. PRD can proceed without strategic clarification. ✓

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from Conditional Pass)
- **All PRD-blocking opens resolved**: Q4, Q5, Q8, Q9 all have decisions
- **Remaining known gaps** (deliberately retained):
  - 1.1 (P2) — vision statement is functional, not aspirational (accepted)
- **Re-trigger conditions for future review**: significant change to multi-user architecture; new payment-processor exposure event; FDA enforcement action against a similar grey-market peptide product; expansion of the audience scope beyond the explicit "NOT" list
