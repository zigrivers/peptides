# Multi-Model Innovation Synthesis — User Stories

**Date:** 2026-05-20
**Step:** innovate-user-stories (depth 5/5)
**Source:** `docs/user-stories.md` (24 stories across 6 epics)
**Scope guard:** `docs/plan.md` v1 PRD

## Models Used

| Channel | CLI | Model | Findings | Status |
|---|---|---|---|---|
| Claude (self-review) | n/a | claude-opus-4-7 | 24 | OK |
| Codex | `codex exec` | gpt-5 | 18 | OK |
| Gemini | `gemini -p` | gemini-2.5-pro | 18 | OK (after retry — initial NumericalClassifier route failed; succeeded with explicit `-m gemini-2.5-pro`) |

All three channels produced valid JSON with the requested structure. Total raw findings: **60**. After reconciliation: **32 distinct themes**.

## Consensus Findings (2+ models agree)

These themes appeared in two or more independent passes and carry the highest confidence.

| Theme | Models | Recommendation | Cost |
|---|---|---|---|
| Pre-fill BAC water from prior reconstitution (opt-in chip, not auto-fill) | Claude + Codex + Gemini | must-have | trivial |
| 5-7 second Undo toast on dose log | Claude + Gemini | must-have | trivial |
| Wallet address character diff on payment gate | Claude + Gemini | must-have | moderate |
| Persistent offline sync indicator (status + queue count) | Claude + Codex + Gemini | must-have | moderate |
| First-login dashboard empty state with role-aware CTA | Claude + Codex + Gemini | must-have | trivial |
| Role-aware progressive disclosure (collapsed sections / single-dose card for Delegated Participants) | Claude + Codex | must-have | trivial-to-moderate |
| Accessibility — warning badges via color + icon + text; text equivalents for visual content | Claude + Codex | must-have | trivial-to-moderate |
| Local idempotency for offline duplicate-tap prevention | Claude (implied) + Codex | must-have | moderate |
| Telegram send-failure recovery as first-class state with composed-message retention | Claude + Codex | must-have | moderate |
| Haptic feedback on critical confirmations | Claude + Gemini | must-have | trivial |
| Body-map visualization for injection site rotation | Codex + Gemini | backlog | moderate |

## Single-Source Findings (one model only)

### Codex-only
- Safe preselection in batch logging (uncheck unavailable doses)
- Field-level reconstitution guardrails with sticky summary
- Protocol schedule preview (next 7 dates) before save
- Bulk admin actions on managed-user adherence table
- Keyboard shortcuts (`/` search, `L` batch log)
- Remembered dashboard density
- Correlation chart explain-on-hover/tap
- Thumb-safe chunked wallet address display
- Privacy-preserving auth form patterns
- Ordering-disabled fallback page (when `DISABLE_ORDERING=true`)

### Gemini-only
- Visual syringe preview graphic on reconstitution result (1mL insulin syringe with plunger at unit mark)
- Real-time syringe unit conversion in protocol editor
- Contextual protocol defaults (last protocol's dose/frequency for the same compound)
- Reason text on inventory suggestions ("8 days remaining")
- Large dose deviation confirmation (>50% from scheduled)
- Add-all-suggested batch action in order builder
- Show active protocols when assigning to a managed user
- Clone-protocol-to-new-managed-user shortcut after invite
- PWA home screen icon badge for pending doses
- Keyboard shortcut for Log All Scheduled
- **REJECTED:** AI-generated plain-language compound summary — out of scope (introduces a new AI generation pipeline; PRD §5.1 keeps profile content human-curated for v1)

### Claude-only
- Vial expiry default from compound profile shelf-life (instead of fixed 14 days)
- Pre-confirm reconstitution summary line before Record
- Inline editable dose amount during batch review
- `inputmode='decimal'` on all dose fields
- Days-since-last-use at each rotation site candidate
- Anti-clipboard wallet typing on first vendor use (backlog)
- Recently-viewed compounds row in catalog
- Clipboard-assisted regex vendor reply capture (backlog — v2 AI parser supersedes)
- Skeleton states + lazy-load citations on compound profile
- Outcome-log tag presets from recent usage
- Copy-invite-link action alongside email send
- Stale-data badge when cache > 30 min old
- Visible "next reminder" time on dashboard
- Catalog search learns user synonyms (backlog)
- Same-as-current password rejection on blur (backlog)

## Disagreements

### Body-map site rotation visualization
- **Codex** (INNOV-008): Mini-map with last 7 sites highlighted, route-incompatible sites dimmed
- **Gemini** (INNOV-005): Anatomical heatmap with fade-over-time gradient
- **Resolution:** PRD §5.2.3 explicitly lists body-map visualization as **Could Have, not Must Have**. Both suggestions are in scope but should remain backlog for v1. The text-list of last 7 sites (existing AC2 of US-TRK-04) stays as Must Have. Visual heatmap deferred.

### Auto-fill vs opt-in chip for BAC water pre-fill
- **Claude / Gemini:** auto-fill the BAC water field with the last value; show a dismissible badge
- **Codex:** non-auto-applied chip (`"Use last: 2mL"`) that the user must tap to fill — keeps the user "consciously in control of safety-critical math"
- **Resolution:** Adopt Codex's safer pattern. The cost difference is zero; the safety benefit is real. Reconstitution is the highest-risk flow; an inert chip with a single tap to populate is the right default for a safety-critical input. **All approved enhancements that pre-fill values in REC stories use the chip pattern, not silent auto-fill.**

### Gemini's AI plain-language compound summary
- **Gemini** marks this in-scope; **Claude/Codex** treat profile content as human-curated only (PRD §5.1).
- **Resolution:** Reject for v1. Adding an LLM generation pipeline to compound profiles is a new feature requiring ADR-010 review, prompt engineering, and editorial oversight. Out of scope for `innovate-user-stories` (which is UX-level only). Re-evaluate in `innovate-prd` if revisited.

## Reconciliation Notes

- **Safety-critical bias.** Where models disagreed on convenience-vs-safety tradeoffs (e.g., the BAC water pre-fill), we adopted the safer pattern in line with the dispatch-prompt guidance: "For safety-critical stories, prefer suggestions that REDUCE error risk, not add convenience that could mask errors."
- **Scope drift was minimal.** All three models respected the explicit out-of-scope list. The one borderline case (Gemini's AI summary) was identified by the cross-model check.
- **Codex and Claude converged on robustness themes** (offline duplicate protection, Telegram failure recovery, accessibility text equivalents). Gemini concentrated on user-facing polish (visual syringe, heatmap, badge API).
- **Coverage gap:** none of the three models proposed enhancements specific to US-AUT-02 (account deletion / export), US-ADM-04 (delete managed user), or US-TRK-08 (cycles). These flows are well-specified already; absence of innovation suggestions reflects spec completeness, not a model blind spot.

## Quality Gate

| Channel | Status |
|---|---|
| Codex | Complete |
| Gemini | Complete (after 1 retry) |
| Claude self-review | Complete |
| Reconciliation | Complete |

**Verdict: PASS** — full-strength multi-model review achieved. No degraded-pass compensating dispatch required.
