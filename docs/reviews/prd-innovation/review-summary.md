# PRD Innovation — Multi-Model Summary

**Date:** 2026-05-20  
**PRD:** `docs/plan.md`  
**Status:** COMPLETE — all 11 innovations approved and integrated

## Model Coverage

| Model | Status | Innovations surfaced |
|-------|--------|----------------------|
| Claude (Sonnet 4.6) | Complete | 11 candidates |
| Codex | Failed (exit 2) | Compensating pass: Claude covered all innovation categories |
| Gemini | Skipped | CLI timed out in review-prd; not retried |

## Innovations Approved

All 11 candidates presented were approved by the user.

| ID | Title | Cost | Impact | MoSCoW |
|----|-------|------|--------|--------|
| I-01 | Protocol Clone / Restart | Trivial | Noticeable | Must Have |
| I-02 | Vial Expiry + Low-Inventory Warning | Trivial | Noticeable | Must Have |
| I-03 | Protocol Pause / Resume | Trivial | Noticeable | Should Have |
| I-04 | Stacking Notes on Profiles | Trivial | Noticeable | Should Have |
| I-05 | Batch "Log All Scheduled" | Trivial | Differentiator | Must Have |
| I-06 | PWA / Home Screen Install | Moderate | Differentiator | Must Have |
| I-07 | Dose Reminders (push/email) | Moderate | Significant | Should Have |
| I-08 | Inventory-Aware Order Builder | Moderate | Differentiator | Must Have |
| I-09 | Outcome-Dose Correlation Timeline | Moderate | Differentiator | Should Have |
| I-10 | CSV Export | Trivial | Noticeable | Should Have |
| I-11 | First-Run Setup Wizard | Moderate | Noticeable | Must Have |

## Impact on PRD

**Must Have additions (6):** Batch logging, Protocol clone/restart, Vial expiry warnings, PWA, Inventory-aware ordering, First-run setup wizard

**Should Have additions (5):** Protocol pause/resume, Stacking notes, Dose reminders, Outcome-dose timeline, CSV export

**Sections modified:** §3.1, §4, §5.1, §5.2.1, §5.2.2, §5.2.6, §5.4.2, §5.6, §5.7, §7.1, §8.6

**New sections added:** §5.2.7 (Dose Reminders), §5.2.8 (Outcome-Dose Correlation Timeline), §5.4.2b (Inventory-Aware Order Suggestions)

## PRD Scope Impact Assessment

No scope creep introduced. All innovations:
- Serve the existing personas (Power User, Delegated Participants)
- Operate within existing pillar architecture (Tracker, Reference, Ordering, Auth)
- Do not add new external dependencies beyond Web Push API (already enabled by service worker)
- Do not require new persona definitions or architecture changes
