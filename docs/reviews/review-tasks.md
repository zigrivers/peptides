# Review: Implementation Plan

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 22 synthesized (P0: 3, P1: 14, P2: 5)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/implementation-plan.md`, `docs/user-stories.md`, `docs/system-architecture.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Architecture & Story Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** Wave 2 / Wave 4 Tracker scope
- **Issue:** Large portions of the Tracker pillar have no implementation tasks: Protocol Lifecycle (Pause/Resume/Clone/Restart), Injection Site Rotation, Subjective Outcome Logging, Correlation Timeline, Cycle Management, and Dose Reminders.
- **Impact:** Core features from the PRD and User Stories will be completely missed during implementation.
- **Recommendation:** Add explicit tasks for all missing Tracker features.
- **Trace:** PRD §3.1, US-TRK-*

#### Finding F-002 (P0)
- **Category:** coverage
- **Location:** Wave 2 / Wave 3 Reconstitution & Ordering
- **Issue:** Missing tasks for Reconstitution Guardrails, Saving calculations to Vial inventory, Vendor Catalog management, Order Status state machine, and Order Receiving flow.
- **Impact:** System fails to close the loop between ordering, inventory, and dosing.
- **Recommendation:** Add tasks for Reconstitution UI/Persistence and the full Ordering lifecycle.
- **Trace:** PRD §5.3, §5.4

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** Wave 1 / Wave 4 Auth & Admin
- **Issue:** Missing tasks for Role-specific Onboarding, Session cookie hardening, Reset-token privacy, and Managed User deactivation.
- **Impact:** Foundation for security and multi-user stewardship is incomplete.
- **Recommendation:** Add tasks for the full Auth/Admin lifecycle.
- **Trace:** PRD §5.6, §5.7, US-AUT-01, US-ADM-03

### Pass 2 — Task Executability (Sizing)

#### Finding F-004 (P1)
- **Category:** executability
- **Location:** Task 2.1 (renumbered 2.2) and Task 3.2
- **Issue:** These tasks are significantly overloaded (> 300 lines estimated). Task 2.2 combines Protocol CRUD and Dose Logging; Task 3.2 combines Catalog, Builder, and Telegram Dispatch.
- **Impact:** Implementing agents will likely time out, produce low-quality code, or miss edge cases.
- **Recommendation:** Split 2.2 into 'Protocol Management' and 'Dose Logging'; split 3.2 into 'Vendor Catalog', 'Order Builder', and 'MTProto Dispatch'.
- **Trace:** Task Size Rules (150-line budget)

#### Finding F-005 (P1)
- **Category:** executability
- **Location:** Task 1.3 Audit & Math
- **Issue:** Combines unrelated domain concerns (Audit infrastructure vs Reconstitution math).
- **Impact:** Fragile task; audit logic needs to be a cross-cutting pattern, not a one-off foundation task.
- **Recommendation:** Split into 'Audit Infrastructure' and 'Reconstitution Calculator'; add audit requirements to every mutation task.
- **Trace:** Single-Concern Rule

### Pass 3 — Dependency & Critical Path

#### Finding F-006 (P0)
- **Category:** correctness
- **Location:** Critical Path Analysis
- **Issue:** Path references `Task 2.2`, but the list has two `Task 2.1` entries and no `Task 2.2`. Also, `Task 4.2` (PWA Sync) is placed after Ordering, but it is critical for the Tracker path.
- **Impact:** Execution sequence is ambiguous and technically invalid.
- **Recommendation:** Renumber tasks uniquely; move PWA Sync (4.2) into Wave 2 critical path.
- **Trace:** Critical Path Patterns

### Pass 4 — Correctness

#### Finding F-007 (P1)
- **Category:** correctness
- **Location:** All Mutation Tasks
- **Issue:** The architecture requires transactional Audit writes and signed order transitions, but individual tasks do not list these as AC.
- **Impact:** Inconsistent audit coverage.
- **Recommendation:** Add a cross-cutting requirement to every Server Action task for transactional Audit log writing.
- **Trace:** System Architecture §8.2

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | RESOLVED | Added Tracker Lifecycle, Outomes, and Reminder tasks in Waves 2 and 4. |
| F-002   | P0       | RESOLVED | Added Reconstitution and Order lifecycle tasks in Waves 2 and 3. |
| F-003   | P1       | RESOLVED | Added Auth onboarding and hardening tasks in Wave 1. |
| F-004   | P1       | RESOLVED | Split 2.2 and 3.2 into 5 and 4 granular tasks respectively. |
| F-005   | P1       | RESOLVED | Split 1.3/1.4 and added Cross-Cutting rules section. |
| F-006   | P0       | RESOLVED | Fixed task numbering and updated critical path sequence. |
| F-007   | P1       | RESOLVED | Added 'Transactional Audit' as a Cross-Cutting rule. |
