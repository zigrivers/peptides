<!-- scaffold:innovate-user-stories v1 2026-05-20 -->
# User Stories Innovation Findings

**Status:** Draft (auto-accept + pending decisions)
**Date:** 2026-05-20
**Source stories:** `docs/user-stories.md`
**Scope guard:** `docs/plan.md` (v1 PRD)
**Method:** Multi-model UX innovation pass (Claude + Codex + Gemini at depth 5/5). Synthesis in `docs/reviews/user-stories-innovation/review-summary.md`.

---

## Decision Policy

This document records UX-level enhancements proposed during `innovate-user-stories`. Each finding has one of three dispositions:

- **Accepted (auto)** — `cost: trivial` AND `recommendation: must-have` AND `impact ≥ noticeable`. Integrated into `docs/user-stories.md` as new or modified acceptance criteria with no further user prompt.
- **Pending decision** — `cost: moderate` OR contested across models. Surfaced to the user for explicit Yes / Backlog / Reject.
- **Backlog / Reject** — `recommendation: backlog` (deferred to post-v1) or out-of-scope per PRD §3.2.

All decisions are recorded with timestamp and rationale below.

---

## Accepted Enhancements (auto-accept policy applied)

### A1 — Pre-fill BAC water via "Use last" chip *(consensus: 3/3 models)*

**Applies to:** US-REC-01, US-REC-02
**Category:** A — Smart Defaults
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**Current behavior:** User enters BAC water volume manually each reconstitution.

**Enhancement:** When opening the calculator for a compound that has prior reconstitution history, display an inert chip labeled `"Use last: 2.0mL — Apr 18"` adjacent to the BAC water field. Tapping the chip populates the field. The chip does **not** auto-fill — the user must tap. This adopts Codex's safer "consciously in control" pattern over silent auto-fill, per the safety-critical reconciliation in `review-summary.md`.

**AC addition (US-REC-01):**
> **AC 5 (Smart default chip):** Given I have previously reconstituted this compound, when I open the calculator with the compound pre-selected, then a chip labeled `"Use last: <volume> — <date>"` is shown next to the BAC water field; tapping the chip fills the field but does not submit the calculation.

---

### A2 — Vial expiry default from compound profile shelf-life *(Claude)*

**Applies to:** US-REC-02
**Category:** A — Smart Defaults
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**Current behavior:** US-REC-02 AC1 sets a fixed 14-day default expiry.

**Enhancement:** Read the `reconstituted shelf life` field from the compound profile (PRD §5.1) and use that as the default; fall back to 14 days only if the profile field is empty.

**AC modification (US-REC-02 AC1):**
> Saving a calculation creates a `Vial` record with an estimated expiry date computed from the compound profile's reconstituted-shelf-life field (or 14 days if the profile field is empty).

---

### A3 — Read-back summary line before Record Reconstitution *(Claude)*

**Applies to:** US-REC-01, US-REC-02
**Category:** A — Inline Validation
**Cost:** trivial · **Impact:** differentiator · **Disposition:** Accepted — 2026-05-20

**Enhancement:** Render a one-sentence English summary above the Record button: `"5mg vial + 2.0mL BAC = 2.5mg/mL — 10 units gives 250mcg."` Forces a mental cross-check at the moment of highest cost.

**AC addition (US-REC-01):**
> **AC 6 (Read-back):** Given the calculator inputs are valid, when the user is about to record the reconstitution, then a single-sentence plain-English summary line is rendered above the Record button restating vial size, BAC volume, resulting concentration, and units-per-target-dose.

---

### A4 — 5-second Undo toast on dose log *(consensus: Claude + Gemini)*

**Applies to:** US-TRK-03, US-TRK-05
**Category:** C — Error Recovery
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-03):**
> **AC 5 (Undo):** Given the user has just confirmed a dose, when the confirmation completes, then a toast with an `Undo` action appears for 5 seconds. Tapping `Undo` before dismissal removes the dose log entry and records an audit event with reason `"reverted within grace window"`.

---

### A5 — Inline editable dose amount in batch review *(Claude)*

**Applies to:** US-TRK-05
**Category:** A — Smart Defaults
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-05):**
> **AC 4 (Inline edit):** Given the batch review list is shown with N pending doses, when the user taps a dose amount, then an inline numeric input opens defaulted to the protocol amount and accepts any positive Decimal value, recorded as `actual dose` on confirm.

---

### A6 — Persona-aware progressive disclosure on compound profile *(Claude + Codex)*

**Applies to:** US-REF-01
**Category:** A — Progressive Disclosure
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-REF-01):**
> **AC 7 (Persona disclosure):** Given a Delegated Participant views a compound profile, when the page renders, then dosing range and administration route sections are expanded by default while mechanism, IUPAC name, and citations are collapsed behind a `Show more` control. Power Users see all sections expanded.

---

### A7 — Days-since-last-use on each rotation site candidate *(Claude)*

**Applies to:** US-TRK-04
**Category:** A — Leveraging Existing Data
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-04):**
> **AC 6 (Rest indicator):** Given a dose is being logged with site rotation available, when the site picker is shown, then each candidate site displays `last used N days ago` (or `never` if unused), and sites unused ≥ 7 days are tagged `rested`.

---

### A8 — `inputmode='decimal'` on all dose / volume fields *(Claude)*

**Applies to:** US-TRK-01, US-TRK-03, US-REC-01
**Category:** C — Accessibility
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (cross-cutting, attached to US-TRK-01 as canonical):**
> **AC 6 (Numeric input UX):** Given a dose-amount or BAC-volume input is rendered, when the user focuses it on a mobile device, then the decimal numeric keypad is presented (`inputmode='decimal'`) and the field has an accessible label describing the unit (mcg / mg / IU / mL).

---

### A9 — Warning badges = color + icon + text *(Claude + Codex)*

**Applies to:** US-REC-01, US-ANL-01, US-ORD-02, US-TRK-03
**Category:** C — Accessibility (WCAG 1.4.1)
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-ANL-01 as canonical):**
> **AC 4 (Badge accessibility):** Given any warning or status badge is rendered (low inventory, expiring vial, dose-above-range, large-volume warning, stale-data badge), when it is displayed, then the badge combines a color, an icon, and a text label — no warning is conveyed by color alone.

---

### A10 — Recently-viewed compounds row in catalog *(Claude)*

**Applies to:** US-REF-02
**Category:** B — Personalization Without Configuration
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-REF-02):**
> **AC 3 (Recently viewed):** Given a user has viewed at least one compound profile, when they enter the catalog screen, then a `Recently viewed` row showing their last 5 distinct compounds is rendered above the search and filter controls.

---

### A11 — Outcome-log tag presets from recent usage *(Claude)*

**Applies to:** US-TRK-06
**Category:** A — Leveraging Existing Data
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-06):**
> **AC 3 (Tag presets):** Given a user has logged outcome entries with tags in the past 14 days, when they open the outcome-logging UI, then their 3 most-frequent tags from that period are shown as one-tap presets above the full tag selector.

---

### A12 — Copy-invite-link action alongside email send *(Claude)*

**Applies to:** US-ADM-01
**Category:** A — Smart Defaults
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-ADM-01):**
> **AC 6 (Copy link):** Given an invite has been generated for a managed user, when the admin views the invite-status row, then the invite link is shown alongside a copy-to-clipboard action; the email is still sent in parallel.

---

### A13 — Stale-data badge when cache > 30 min old *(Claude)*

**Applies to:** US-ANL-01, US-ADM-02, US-AUT-05
**Category:** C — Offline / Degraded Mode
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-ANL-01):**
> **AC 5 (Stale-data badge):** Given the user is offline or the displayed data was fetched more than 30 minutes ago, when inventory, adherence, or dashboard tiles are rendered, then each tile shows a `Last refreshed HH:MM` indicator.

---

### A14 — Haptic + checkmark animation on batch confirm *(Claude + Gemini)*

**Applies to:** US-TRK-05
**Category:** B — Wow Moments
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-05):**
> **AC 5 (Confirmation feedback):** Given a batch dose confirmation succeeds, when the operation completes, then a short haptic pulse fires (where the Vibration API is supported) and each logged dose row plays a checkmark animation before collapsing into a `Today: N/N complete` summary card.

---

### A15 — Visible "next reminder" time on dashboard *(Claude)*

**Applies to:** US-TRK-09, US-ANL-01
**Category:** C — Empty States / Trust
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-09):**
> **AC 6 (Visible reminder):** Given a user has a daily reminder time configured, when they view the dashboard, then `Next reminder: HH:MM` is displayed and tapping it opens the reminder time editor inline.

---

### A16 — Contextual protocol defaults from prior protocol *(Gemini)*

**Applies to:** US-TRK-01
**Category:** A — Smart Defaults
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-01):**
> **AC 6 (Smart protocol defaults):** Given the user has a prior protocol for the selected compound, when they create a new protocol with that compound, then the dose amount, unit, frequency, and administration route are pre-filled from the user's most recent protocol for the same compound; fields remain editable before save.

---

### A17 — Reason text on inventory order suggestions *(Gemini)*

**Applies to:** US-ORD-02
**Category:** A — Progressive Disclosure
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-ORD-02):**
> **AC 3 (Suggestion reason):** Given a compound is in the Suggested section of the order builder, when it is rendered, then a reason string is shown next to it (`~8 doses remaining`, `vial expires in 3 days`, or `no active vial recorded`).

---

### A18 — Large dose deviation confirmation (>50% from protocol) *(Gemini)*

**Applies to:** US-TRK-03
**Category:** C — Error Recovery (safety net)
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-03):**
> **AC 6 (Deviation guard):** Given the user is logging a dose with a manually edited amount that deviates more than 50% from the scheduled protocol amount, when they attempt to confirm, then a confirmation dialog asks them to verify the amount before the log is written (the dialog cannot be auto-dismissed).

---

### A19 — Real-time syringe unit conversion in protocol editor *(Gemini)*

**Applies to:** US-TRK-01
**Category:** A — Inline Validation
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-01):**
> **AC 7 (Live syringe hint):** Given the user has at least one active reconstituted vial for the selected compound, when they enter a dose amount in the protocol form, then the equivalent value in 100-unit insulin syringe units is shown as helper text below the input.

---

### A20 — Active protocols visible when assigning to managed user *(Gemini)*

**Applies to:** US-TRK-01, US-ADM-01
**Category:** A — Progressive Disclosure
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-TRK-01):**
> **AC 8 (Assignee context):** Given the user opens the assign-to control on a protocol form, when a managed user is selected, then a small list of that user's currently active protocols is rendered inline under the selection (e.g., `Also on: BPC-157, TB-500`).

---

### A21 — First-login dashboard empty state with role-aware CTA *(consensus: 3/3 models)*

**Applies to:** US-ANL-01, US-AUT-01
**Category:** C — Empty States
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-ANL-01):**
> **AC 6 (Empty state):** Given a user has no active protocols and no dose logs, when they land on the dashboard, then a `Get started` card is shown. Power Users see `Browse Catalog → Create Protocol → Log First Dose` actions; Delegated Participants see `No dose scheduled today — your administrator will configure your protocol`. The card hides once the user has at least one active protocol.

---

### A22 — Thumb-safe chunked wallet address display on payment gate *(Codex)*

**Applies to:** US-ORD-04
**Category:** C — Mobile Responsiveness (safety)
**Cost:** trivial · **Impact:** noticeable · **Disposition:** Accepted — 2026-05-20

**AC addition (US-ORD-04):**
> **AC 5 (Chunked address display):** Given the user is on the payment summary screen, when the wallet address is rendered, then it is displayed in monospace, broken into 4-character chunks separated by spaces, with the amount and currency shown directly above. The `Mark Payment Sent` button is placed below a required acknowledgment checkbox, separated visually from copy-address / open-wallet actions to avoid fat-finger errors.

---

## Approved Moderate-Cost Enhancements (P1–P10) — user-approved 2026-05-20

The user approved all 10 moderate-cost `must-have` items across 4 question groups. Each is now integrated into `docs/user-stories.md` as a new acceptance criterion on the relevant story.

### Group 1 — Safety / Reconstitution — Accepted 2026-05-20
- **P1 Visual syringe preview graphic** (Gemini, differentiator). Integrated as new AC on US-REC-01.
- **P2 Field-level reconstitution guardrails + sticky summary** (Codex, differentiator). Integrated as new AC on US-REC-01.

### Group 2 — Safety / Payment — Accepted 2026-05-20
- **P3 Wallet address character diff** (Claude + Gemini, differentiator). Integrated as new AC on US-ORD-04. `Mark Payment Sent` stays disabled until user taps `I have compared the addresses`.
- **P4 Failed-send order queue** (Claude + Codex, differentiator). Integrated as new AC on US-ORD-03. Order persists in `Send failed` state across app restarts with composed message + retry + manual fallback intact.

### Group 3 — Logging Robustness — Accepted 2026-05-20
- **P5 Safe preselection in batch logging** (Codex, noticeable). Integrated as new AC on US-TRK-05.
- **P6 Local duplicate-tap protection (offline)** (Codex, noticeable). Integrated as new AC on US-TRK-03.
- **P7 Persistent offline sync indicator** (consensus 3/3, differentiator). Integrated as new AC on US-AUT-05.

### Group 4 — Persona & Visibility — Accepted 2026-05-20
- **P8 Delegated Participant single-dose card** (Codex, differentiator). Integrated as new AC on US-ANL-01.
- **P9 Protocol schedule preview** (Codex, noticeable). Integrated as new AC on US-TRK-01.
- **P10 Accessible text equivalents for visual content** (Codex, noticeable). Integrated as new AC on US-ANL-01 (canonical) and referenced from US-TRK-04, US-TRK-07.

---

## Backlog (deferred to post-v1)

The following enhancements are in scope but **not required for v1 launch**. Recorded here for future consideration.

| ID | Title | Model(s) | Reason for backlog |
|---|---|---|---|
| B1 | Body-map / heatmap site rotation viz | Codex + Gemini | PRD §5.2.3 explicitly lists body-map as Could Have |
| B2 | Anti-clipboard wallet typing on first vendor use | Claude | UX-friction tradeoff; P3 diff covers primary risk |
| B3 | Clipboard-assisted regex vendor reply capture | Claude | v2 AI parser (PRD §3.3) supersedes |
| B4 | Skeleton states + lazy-load citations | Claude | Performance polish; not launch-blocking |
| B5 | Catalog search learns user synonyms | Claude | Personalization polish |
| B6 | Same-as-current password rejection on blur | Claude | Nice-to-have form refinement |
| B7 | Bulk admin adherence nudges | Codex | Multi-select admin batch — refinement |
| B8 | Keyboard shortcuts (`/`, `L`, `Cmd+Enter`) | Codex + Gemini | Power-user polish; PWA mobile-first |
| B9 | Remembered dashboard density | Codex | Personalization |
| B10 | Correlation chart explain-on-hover/tap | Codex | Analytics polish |
| B11 | Privacy-preserving auth form patterns | Codex | Form polish |
| B12 | Ordering-disabled fallback page | Codex | Degraded-mode polish |
| B13 | Add-all-suggested batch action | Gemini | Nice-to-have |
| B14 | Clone protocol to new managed user (post-invite) | Gemini | Workflow shortcut |
| B15 | PWA home screen icon badge | Gemini | Requires service-worker badge coordination |

---

## Rejected (out of scope)

| ID | Title | Reason |
|---|---|---|
| R1 | AI-generated plain-language compound summary (Gemini INNOV-013) | Introduces a new AI generation pipeline; PRD §5.1 keeps compound content human-curated for v1. Re-evaluate in `innovate-prd` if revisited. |

---

## Audit Trail

| Q | A | Timestamp |
|---|---|---|
| Run multi-model dispatch (Codex + Gemini + Claude) at depth 5? | Yes — all 3 channels | 2026-05-20T07:11Z |
| Innovation focus | Full sweep across all stories | 2026-05-20T07:11Z |
| Approval mode | Auto-accept trivial + must-have; surface moderate/significant | 2026-05-20T07:11Z |
| Auto-accept enhancements A1–A22 | Accepted by policy | 2026-05-20T07:18Z |
| Reject AI plain-language compound summary (Gemini INNOV-013) | Rejected — out of scope per PRD §5.1 | 2026-05-20T07:18Z |
| Group 1 (P1 + P2) | Accepted — both | 2026-05-20T07:22Z |
| Group 2 (P3 + P4) | Accepted — both | 2026-05-20T07:22Z |
| Group 3 (P5 + P6 + P7) | Accepted — all three | 2026-05-20T07:22Z |
| Group 4 (P8 + P9 + P10) | Accepted — all three | 2026-05-20T07:22Z |

**Total enhancements integrated into user-stories.md: 32** (22 auto-accepted + 10 user-approved).
