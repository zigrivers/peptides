# Review Batch Findings Log — 2026-05-20

Batch: re-run 22 review/audit/validation steps at depth 5 strict with auto-fix.
Mode: reset → run with `--instructions "Apply fixes directly to the reviewed artifact instead of just listing issues. Summarize what you changed."`

## Status

| # | Step | Status | Findings | Fixed | Declined |
|---|------|--------|----------|-------|----------|
| 1 | review-vision | ✅ done | 6 (1×P1, 2×P2, 3×P3) | 6 | 1 retained (1.1) |
| 2 | review-prd | pending | | | |
| 3 | review-user-stories | pending | | | |
| 4 | review-domain-modeling | pending | | | |
| 5 | review-adrs | pending | | | |
| 6 | review-architecture | pending | | | |
| 7 | review-database | pending | | | |
| 8 | review-api | pending | | | |
| 9 | review-ux | pending | | | |
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

