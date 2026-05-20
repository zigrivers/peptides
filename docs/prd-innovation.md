# PRD Innovation Pass

**Date:** 2026-05-20  
**PRD:** `docs/plan.md` (post-review-prd)  
**Methodology:** deep | Depth: 5/5  
**Models:** Claude (Sonnet 4.6) — Codex CLI failed (exit 2); Gemini CLI timed out  
**Status:** COMPLETE — all 11 innovations approved and integrated into `docs/plan.md`

---

## Scope Boundary

This pass covers **feature-level opportunities** — new capabilities, missing expected features, competitive gaps, and defensive product thinking. UX polish of existing features is explicitly out of scope here (that belongs in user story innovation).

---

## Innovation Candidates

### Group A — Tracking Completeness (Trivial Cost)

---

#### I-01 — Protocol Clone / Restart
| | |
|--|--|
| **Category** | Missing expected feature |
| **Problem** | Cycling protocols is a core biohacker pattern (e.g., BPC-157 8-week cycle → 4-week break → restart). The PRD has no "clone protocol" or "restart cycle" capability. Users must recreate protocols from scratch each run. |
| **Target users** | Power User |
| **Behavior** | "Clone this protocol" creates a copy with all same fields (compound, dose, frequency, route, notes). User sets a new start date and adjusts if needed. "Restart cycle" reopens a completed cycle with a new start date, linking the original protocols. |
| **Cost** | Trivial — UI action that duplicates a protocol record with a new start date. No new data entities. |
| **Impact** | Noticeable improvement — cycling protocols is a first-class use case, and recreation from scratch wastes time and introduces transcription errors |
| **Recommendation** | **Must-have v1** |
| **Disposition** | AWAITING USER |

---

#### I-02 — Vial Expiry + Low Inventory Warning
| | |
|--|--|
| **Category** | Safety / defensive product |
| **Problem** | Reconstituted peptides expire in ~14 days refrigerated. The PRD records the expiry date on the vial record but never defines what the app does when a vial expires or approaches expiry. Users could dose from an expired vial without knowing. |
| **Target users** | Power User + Delegated Participants |
| **Behavior** | Dashboard shows an "Expiring in N days" indicator on vials within 7 days of their estimated expiry. Expired vials show as "[Name] — EXPIRED (reconstituted X days ago)" with a link to the reconstitution calculator. Dose logging shows a warning if the active vial is expired. When a vial's estimated doses-remaining drops below 5, show a "Running low" indicator. |
| **Cost** | Trivial — query vial records on dashboard render; no new data entities |
| **Impact** | Noticeable improvement — a safety and trust feature. Dosing from an expired vial is a real harm scenario. |
| **Recommendation** | **Must-have v1** |
| **Disposition** | AWAITING USER |

---

#### I-03 — Protocol Pause / Resume (Individual Protocol)
| | |
|--|--|
| **Category** | Missing expected feature |
| **Problem** | Cycle management supports pausing an entire cycle, but there's no way to pause a single protocol mid-cycle (e.g., one compound is out of stock; user is traveling and skipping one peptide). Users must deactivate the protocol (which implies permanent discontinuation) or live with it appearing in "today's doses." |
| **Target users** | Power User + Delegated Participants |
| **Behavior** | Protocol gains a "Pause" action (status: paused). Paused protocols are excluded from "today's doses" dashboard. User can "Resume" at any time. Paused protocols remain visible in protocol list with paused status. Dose history is unaffected. |
| **Cost** | Trivial — add `paused` status to protocol entity; filter paused protocols from today's dose list |
| **Impact** | Noticeable improvement — real-world adherence requires temporary pauses without deleting protocols |
| **Recommendation** | **Should have** |
| **Disposition** | AWAITING USER |

---

#### I-04 — Stacking Notes on Compound Profiles
| | |
|--|--|
| **Category** | Competitive / reference depth |
| **Problem** | Compound profiles describe individual compounds well, but give no context for multi-compound stacks. A user setting up a new protocol doesn't know that "BPC-157 is commonly stacked with TB-500 for enhanced healing" without researching externally. |
| **Target users** | Power User |
| **Behavior** | Each compound profile gains a "Common stacks" field (admin-curated, 1-3 sentences, no AI generation). E.g., BPC-157 profile: "Commonly stacked with TB-500 (5mg/week split dose) for synergistic soft tissue repair. Some users add GHK-Cu for an additional skin/collagen effect." |
| **Cost** | Trivial — one optional text field per compound profile; no new entities |
| **Impact** | Noticeable improvement — meaningful addition to reference value; aligns with "honest, practical" positioning |
| **Recommendation** | **Should have** |
| **Disposition** | AWAITING USER |

---

### Group B — 7am Routine Critical Path (Trivial to Moderate Cost)

---

#### I-05 — Batch "Log All Scheduled" Action
| | |
|--|--|
| **Category** | UX / missing expected feature |
| **Problem** | The 7am goal is "log doses in < 60 seconds." With 3-7 active protocols, the user must tap each dose entry individually, confirm each one, then close. That's 6-14 taps minimum. The "quick-log action" in the PRD is per-dose, not batch. |
| **Target users** | Power User + Delegated Participants |
| **Behavior** | Dashboard gains a "Log all as scheduled" button at the top of the today's doses list. Tapping it marks all pending doses as logged at their protocol-scheduled amounts with the current timestamp and the suggested injection sites. A review screen shows the full batch before confirming. Any dose with a vial expiry warning is flagged in the review screen but not blocked. |
| **Cost** | Trivial — bulk insert of dose log records from today's protocol schedule; review UI is a list with a single confirm button |
| **Impact** | **Significant differentiator** — directly enables the 60-second morning routine that is the Power User's primary success metric |
| **Recommendation** | **Must-have v1** |
| **Disposition** | AWAITING USER |

---

#### I-06 — PWA / Home Screen Install
| | |
|--|--|
| **Category** | UX / competitive gap |
| **Problem** | The 7am use case on mobile requires opening a browser tab, finding the URL, authenticating, and then logging doses. A Progressive Web App (PWA) installed on the phone home screen makes this as fast as opening a native app — without App Store distribution. The PRD mentions "Web/PWA" as the distribution channel in §7.1 but doesn't specify PWA as a feature requirement anywhere. |
| **Target users** | Power User + Delegated Participants |
| **Behavior** | App ships with a complete PWA manifest (icons, splash screen, display: standalone) and a service worker for offline support of the dose-logging flow (queued writes synced when back online). Browser prompts "Add to home screen" on mobile. Installed PWA opens full-screen without browser chrome. |
| **Cost** | Moderate — PWA manifest is trivial; service worker for offline dose-log queuing requires moderate effort (IndexedDB + sync on reconnect) |
| **Impact** | **Significant differentiator** — the "7am 60-second routine" is only achievable with home-screen access; browser tab navigation creates too many steps for a groggy 7am user |
| **Recommendation** | **Must-have v1** (at minimum: PWA manifest + home screen install; offline queuing = Should Have) |
| **Disposition** | AWAITING USER |

---

#### I-07 — Dose Reminders (Push / Email)
| | |
|--|--|
| **Category** | Missing expected feature / defensive |
| **Problem** | The app's dose-logging adherence tracking is meaningless if users forget to open the app. There is no reminder mechanism in the PRD. "1-star review" scenario: "I set up my protocol and then forgot to open the app. There are no reminders and I missed doses for 2 weeks." |
| **Target users** | Power User + Delegated Participants |
| **Behavior** | User sets a reminder time per protocol (or a single daily reminder time). Reminders delivered via: (1) browser push notification (if PWA is installed) or (2) email digest ("Today's stack: 3 doses due at 7am"). User can configure reminder preferences per account. Delegated Participants benefit especially — they need a nudge to open the app. |
| **Cost** | Moderate — requires push notification infrastructure (Web Push API) or transactional email scheduling. Transactional email is already in the tech stack (§7.1). Browser push requires a service worker (already in I-06 if accepted). |
| **Impact** | **Significant differentiator** — Delegated Participant retention metric (≥70% logging ≥5 days/week) is directly dependent on reminders; no reminder system means hoping users remember |
| **Recommendation** | **Should have** (email reminder = trivial if transactional email is set up; push notification = moderate if PWA is set up) |
| **Disposition** | AWAITING USER |

---

### Group C — Intelligence Features (Moderate Cost)

---

#### I-08 — Inventory-Aware Order Builder
| | |
|--|--|
| **Category** | Competitive differentiator |
| **Problem** | The order builder requires the user to manually figure out what to order. There's no connection between vial inventory status and the order flow. "1-star review" scenario: "I spent 10 minutes building an order and forgot to include BPC-157 because I didn't realize my last vial was almost empty." |
| **Target users** | Power User |
| **Behavior** | When the user opens the order builder, a "Suggested order" section appears at the top showing compounds whose vial inventory will run out within 14 days at the current protocol dose rate. Each item shows: compound name, estimated doses remaining, days until depletion, and a pre-filled quantity based on typical order size (default: 2 vials). User can add/remove/adjust suggested items before adding to cart. Non-suggested compounds are still browsable normally. |
| **Cost** | Moderate — requires a "days-to-depletion" calculation from vial records + protocol schedule; new "suggested order" UI section in order builder |
| **Impact** | **Significant differentiator** — closes the inventory → order intelligence loop that no competitor has; makes ordering dramatically more convenient |
| **Recommendation** | **Must-have v1** |
| **Disposition** | AWAITING USER |

---

#### I-09 — Outcome-Dose Correlation Timeline
| | |
|--|--|
| **Category** | AI-native (stats-light) / competitive differentiator |
| **Problem** | The PRD collects dose events AND daily outcome ratings but never shows them together. A user can't easily see "my sleep scores improved in week 3 of the BPC-157 cycle." This data sits siloed in two different features with no combined view. |
| **Target users** | Power User |
| **Behavior** | A "Timeline" view per compound (or per cycle) shows a 30/90-day dual-axis chart: x-axis = date, y1 (bar or dots) = dose logged (yes/no or actual dose), y2 (line) = daily outcome rating. Simple statistical note: "Average outcome rating during active doses: 3.8 vs. 3.1 during off days" — no AI, just descriptive stats. |
| **Cost** | Moderate — requires a combined query across dose_logs + outcome_logs + protocols; a charting library (e.g., Recharts, Chart.js); no AI/ML required |
| **Impact** | **Significant differentiator** — no peptide tracker currently does this; it's the data-motivated reason to use the tracker beyond just logistics |
| **Recommendation** | **Should have** |
| **Disposition** | AWAITING USER |

---

#### I-10 — CSV Export for Dose Logs and Orders
| | |
|--|--|
| **Category** | Missing expected feature |
| **Problem** | The PRD exports data only as JSON. Non-technical users (Delegated Participants, Power User doing analysis in Excel/Sheets) expect CSV. JSON feels like a developer format. |
| **Target users** | Power User |
| **Behavior** | Add CSV export as an alternative format for dose logs and order history. JSON full export remains for complete data portability. CSV export: one file per data type (dose_logs.csv, orders.csv). Columns match the data model fields. Available from the same "Export data" action. |
| **Cost** | Trivial — CSV serialization of existing table data; no new queries or data model changes |
| **Impact** | Noticeable improvement — expected by most users; absence would feel like an oversight |
| **Recommendation** | **Should have** |
| **Disposition** | AWAITING USER |

---

#### I-11 — First-Run Setup Wizard
| | |
|--|--|
| **Category** | UX / defensive (time-to-value) |
| **Problem** | A new user lands on an empty dashboard with no guidance. There are no protocols, no compounds, no Telegram setup. The "getting started" experience is undefined in the PRD. Time-to-first-value is: "figure it out on your own." |
| **Target users** | Power User (initial setup), Delegated Participants (after invite accept) |
| **Behavior** | A 3-step setup wizard shown on first login: (1) "Browse your first compound" → opens reference catalog with "Add to my protocols" shortcut, (2) "Create your first protocol" → pre-filled with the compound from step 1, (3) "Set up ordering (optional)" → links to Telegram auth setup. Wizard is dismissible at any step. Dashboard shows a "Getting Started" checklist (3 checkboxes) until all steps are completed or dismissed. |
| **Cost** | Moderate — wizard UI component (3 steps) + progress state in user record; links to existing flows |
| **Impact** | Noticeable improvement — eliminates empty-state paralysis on first login; reduces time-to-first-logged-dose |
| **Recommendation** | **Should have** |
| **Disposition** | AWAITING USER |

---

## Cost / Impact Matrix

| ID | Title | Cost | Impact | Recommendation |
|----|-------|------|--------|----------------|
| I-01 | Protocol Clone / Restart | Trivial | Noticeable | Must-have v1 |
| I-02 | Vial Expiry + Low Inventory Warning | Trivial | Noticeable | Must-have v1 |
| I-03 | Protocol Pause / Resume | Trivial | Noticeable | Should have |
| I-04 | Stacking Notes on Profiles | Trivial | Noticeable | Should have |
| I-05 | Batch "Log All Scheduled" | Trivial | **Differentiator** | Must-have v1 |
| I-06 | PWA / Home Screen Install | Moderate | **Differentiator** | Must-have v1 |
| I-07 | Dose Reminders (push/email) | Moderate | Significant | Should have |
| I-08 | Inventory-Aware Order Builder | Moderate | **Differentiator** | Must-have v1 |
| I-09 | Outcome-Dose Correlation Timeline | Moderate | **Differentiator** | Should have |
| I-10 | CSV Export | Trivial | Noticeable | Should have |
| I-11 | First-Run Setup Wizard | Moderate | Noticeable | Should have |

---

## Multi-Model Status

| Model | Status | Notes |
|-------|--------|-------|
| Claude (Sonnet 4.6) | Complete | 11 innovation candidates above |
| Codex | Failed (exit 2) | Compensating pass: Claude covers all innovation categories |
| Gemini | Skipped | CLI timed out in review-prd; not retried |

---

## Disposition Log

| ID | Title | Decision | Timestamp | PRD Section Affected |
|----|-------|----------|-----------|---------------------|
| I-01 | Protocol Clone / Restart | **Approved** | 2026-05-20 | §4 MoSCoW Must Have; §5.2.1 |
| I-02 | Vial Expiry + Low-Inventory Warning | **Approved** | 2026-05-20 | §4 MoSCoW Must Have; §5.2.6 |
| I-03 | Protocol Pause / Resume | **Approved** | 2026-05-20 | §4 MoSCoW Should Have; §5.2.1 |
| I-04 | Stacking Notes on Compound Profiles | **Approved** | 2026-05-20 | §4 MoSCoW Should Have; §5.1 |
| I-05 | Batch "Log All Scheduled" | **Approved** | 2026-05-20 | §4 MoSCoW Must Have; §5.2.2; §5.2.6 |
| I-06 | PWA / Home Screen Install | **Approved** | 2026-05-20 | §4 MoSCoW Must Have; §3.1; §5.6; §7.1; §8.6 |
| I-07 | Dose Reminders (push/email) | **Approved** | 2026-05-20 | §4 MoSCoW Should Have; §5.2.7 (new) |
| I-08 | Inventory-Aware Order Builder | **Approved** | 2026-05-20 | §4 MoSCoW Must Have; §5.4.2b (new) |
| I-09 | Outcome-Dose Correlation Timeline | **Approved** | 2026-05-20 | §4 MoSCoW Should Have; §5.2.8 (new) |
| I-10 | CSV Export | **Approved** | 2026-05-20 | §4 MoSCoW Should Have; §5.7 |
| I-11 | First-Run Setup Wizard | **Approved** | 2026-05-20 | §4 MoSCoW Must Have; §5.6 |
