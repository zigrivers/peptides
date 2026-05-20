# Review: Platform Parity

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 12 synthesized (P1: 8, P2: 4)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/ux-spec.md`, `docs/tech-stack.md`, `docs/system-architecture.md`, `docs/plan.md`

---

## Findings by Pass

### Pass 1 — Feature Parity

#### Finding F-001 (P1)
- **Category:** coverage
- **Location:** Feature Parity Matrix
- **Issue:** Missing explicit matrix showing feature availability across Web (PWA), iOS (Standalone), and Android (Standalone).
- **Impact:** Implementing agents may miss platform-specific constraints (e.g., Push notifications on iOS PWA vs Android).
- **Recommendation:** Add Section 2: Feature Parity Matrix in the output document.
- **Trace:** PRD §8.6

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** Push Notifications
- **Issue:** Gap in Push Notification requirements for iOS PWA. Web Push on iOS requires home-screen installation and specific user interaction.
- **Impact:** Reminders may fail silently on iOS devices.
- **Recommendation:** Add "iOS PWA Push Requirements" to the parity matrix.
- **Trace:** PRD §5.2.7

### Pass 2 — Input & Interaction

#### Finding F-003 (P1)
- **Category:** interaction
- **Location:** Section 5: Responsive Behavior
- **Issue:** Missing "Touch vs Mouse" input patterns. Dose logging cards need different hover/active states for touch-first mobile vs desktop.
- **Impact:** Poor UX on mobile devices (e.g., unintended clicks, lack of tactile feedback).
- **Recommendation:** Define "Active/Pressed" states for touch-first components.
- **Trace:** Meta-Prompt: Quality Criteria (deep)

#### Finding F-004 (P1)
- **Category:** interaction
- **Location:** Telegram Auth
- **Issue:** Telegram deep-linking (`tg://resolve`) behavior differs between mobile (opens app) and desktop (opens web/desktop app).
- **Impact:** Fragmented "Manual Fallback" experience.
- **Recommendation:** Test and document cross-platform deep-link behavior.
- **Trace:** ADR-005

### Pass 3 — Consistency & Readiness

#### Finding F-005 (P1)
- **Category:** readiness
- **Location:** Platform-specific testing
- **Issue:** TDD standards focus heavily on Playwright (Web). Missing Maestro or similar for mobile-specific gesture testing if native wrappers are used.
- **Impact:** Gesture-based interactions (swipes, long-press) may go untested.
- **Recommendation:** Add Maestro skeletons if native wrappers are planned, or focus Playwright on mobile-emulation.
- **Trace:** Meta-Prompt: Quality Criteria

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | PENDING | Will add Feature Parity Matrix. |
| F-002   | P1       | PENDING | Will specify iOS PWA Push constraints. |
| F-003   | P1       | PENDING | Will define Touch vs Mouse interactions. |
| F-004   | P1       | PENDING | Will refine Telegram deep-linking. |
| F-005   | P1       | PENDING | Will refine mobile-first testing patterns. |
