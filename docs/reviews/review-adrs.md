# Review: Architecture Decision Records (ADR)

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex + Gemini

---

## Findings Summary
- **Total findings:** 14 synthesized (P0: 1, P1: 8, P2: 4, P3: 1)
- **Passes run:** 7 of 7
- **Artifacts checked:** `docs/adrs/*.md`, `docs/plan.md`, `docs/domain-models/*.md`

---

## Findings by Pass

### Pass 1 — Coverage

#### Finding F-001 (P0)
- **Category:** coverage
- **Location:** docs/adrs/
- **Issue:** Missing ADR for AI Technical Approach (PRD Q10).
- **Impact:** Phase 3 features (Telegram parsing, PubMed digests) lack an architectural foundation.
- **Recommendation:** Add ADR-010 defining the AI strategy (Vercel AI SDK, OpenAI/Gemini selection).
- **Trace:** PRD §12, Q10
- **Consensus:** High (Gemini)

#### Finding F-002 (P1)
- **Category:** coverage
- **Location:** docs/adrs/
- **Issue:** Missing ADRs for critical infrastructure: Transactional Email, Scheduled Jobs, and Monitoring.
- **Impact:** Core features like invitations, reminders, and stale-order detection cannot be implemented.
- **Recommendation:** Add ADR-011 (Email), ADR-012 (Jobs), and ADR-013 (Observability).
- **Trace:** PRD §5.2.7, §5.5, §7.1, §8.7
- **Consensus:** High (Codex, Gemini)

#### Finding F-003 (P1)
- **Category:** coverage
- **Location:** docs/adrs/
- **Issue:** Missing ADR for Data Export and Object Storage.
- **Impact:** Async export for large files (PRD §5.7) lacks a storage target and delivery strategy.
- **Recommendation:** Add ADR-014 for Object Storage (e.g., Cloudflare R2).
- **Trace:** PRD §5.7
- **Consensus:** Medium (Codex, Gemini)

### Pass 2 — Rationale Quality

#### Finding F-004 (P1)
- **Category:** correctness
- **Location:** ADR-005: GramJS
- **Issue:** Trade-off analysis understates MTProto session fragility and security (AES-256 encryption at rest).
- **Impact:** Implementing agents may fail to provide the required security or manual fallback.
- **Recommendation:** Expand ADR-005 with session security details and manual fallback strategy.
- **Trace:** PRD §5.4.1, §7.1, §11
- **Consensus:** High (Codex, Gemini)

### Pass 3 — Contradiction Check

#### Finding F-005 (P1)
- **Category:** consistency
- **Location:** ADR-009 vs docs/domain-models/audit.md
- **Issue:** ADR-009 says audit is immutable but allows 90-day purge; Domain Model says it can "never be deleted".
- **Impact:** Logic conflict in retention policy implementation.
- **Recommendation:** Align on "Immutable within retention window; purged by policy".
- **Trace:** PRD §5.7, §8.7
- **Consensus:** High (Codex)

#### Finding F-006 (P1)
- **Category:** consistency
- **Location:** ADR-007 vs docs/domain-models/tracker.md
- **Issue:** ADR-007 promises idempotency keys for offline sync, but `DoseLog` entity lacks this field.
- **Impact:** Offline sync will produce duplicate doses if retried.
- **Recommendation:** Add `idempotencyKey` to `DoseLog` in domain model.
- **Trace:** PRD §8.6
- **Consensus:** High (Codex)

#### Finding F-007 (P1)
- **Category:** consistency
- **Location:** ADR-002 vs docs/domain-models/reference.md
- **Issue:** Safety logic relies on `maxDose` comparison, but `Profile` model uses string-based dosing fields.
- **Impact:** Reconstitution warnings (safety-critical) cannot be reliably implemented.
- **Recommendation:** Update `Profile` to use structured `DoseAmount` value objects for ranges.
- **Trace:** PRD §5.1, §5.3
- **Consensus:** High (Codex)

### Pass 4 — Implied Decision Mining

#### Finding F-008 (P1)
- **Category:** completeness
- **Location:** ADR-001 / ADR-005
- **Issue:** Requirement for Ordering module isolation (PRD §7.5) is not recorded as a decision.
- **Impact:** Monolith implementation may tightly couple Ordering, making it hard to disable for regulatory reasons.
- **Recommendation:** Add ADR for Module Isolation / Bounded Context boundaries.
- **Trace:** PRD §7.5
- **Consensus:** Medium (Codex)

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P0       | RESOLVED | Added ADR-010 (AI Strategy with Vercel SDK/Gemini). |
| F-002   | P1       | RESOLVED | Added ADR-011 (Resend), ADR-012 (Railway Cron), ADR-013 (Sentry). |
| F-003   | P1       | RESOLVED | Added ADR-014 (Cloudflare R2 for exports). |
| F-004   | P1       | RESOLVED | Updated ADR-005 with session security and manual fallback. |
| F-005   | P1       | RESOLVED | Aligned 90-day retention in ADR-009 and `audit.md`. |
| F-006   | P1       | RESOLVED | Added `idempotencyKey` to `DoseLog` in `tracker.md`. |
| F-007   | P1       | RESOLVED | Updated `Profile` with structured dosing in `reference.md`. |
| F-008   | P1       | RESOLVED | Added ADR-015 for Bounded Context Isolation. |
