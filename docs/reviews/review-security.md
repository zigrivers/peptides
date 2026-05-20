# Review: Security Review

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** INITIAL  
**Models:** Claude (local) + Codex

---

## Findings Summary
- **Total findings:** 18 synthesized (P1: 12, P2: 5, P3: 1)
- **Passes run:** 10 of 10
- **Artifacts checked:** `docs/security-review.md`, `docs/system-architecture.md`, `docs/api-contracts.md`, `docs/operations-runbook.md`

---

## Findings by Pass

### Pass 1 — Threat Modeling (STRIDE)

#### Finding F-001 (P1)
- **Category:** threat-model
- **Location:** Section 2: Trust Boundaries
- **Issue:** STRIDE threat model is missing for the PWA-to-Server and MTProto-to-Telegram trust boundaries.
- **Impact:** Unidentified spoofing or information disclosure risks in the critical ordering and sync paths.
- **Recommendation:** Add a STRIDE matrix in Section 2 mapping each boundary to potential threats and mitigations.
- **Trace:** Meta-Prompt: Quality Criteria (deep)

#### Finding F-002 (P1)
- **Category:** threat-model
- **Location:** MTProto Integration
- **Issue:** Missing threat analysis for MTProto session fixation or hijacking if the server-side singleton is compromised.
- **Impact:** Attacker could initiate orders on behalf of the Power User.
- **Recommendation:** Define "Active Session Monitoring" and automatic logout on IP mismatch.
- **Trace:** ADR-005

### Pass 2 — Data Protection

#### Finding F-003 (P1)
- **Category:** data-protection
- **Location:** Section 3: Data Classification
- **Issue:** Missing detailed classification for Health-adjacent data (Dose Logs, Outcomes) vs PII (Email) vs Secrets (MTProto Session).
- **Impact:** Unified handling of all data may lead to excessive exposure of sensitive health info in exports or logs.
- **Recommendation:** Add Section 3.1: Data Classification Matrix with specific handling rules per tier.
- **Trace:** PRD §8.2

#### Finding F-004 (P1)
- **Category:** data-protection
- **Location:** PWA Local Storage
- **Issue:** Security of dose logs in IndexedDB while offline is undefined.
- **Impact:** Data disclosure if the device is stolen and local storage is unencrypted.
- **Recommendation:** Specify "At-rest encryption" for sensitive local storage using a device-derived key.
- **Trace:** PRD §8.6

### Pass 3 — Auth & AuthZ

#### Finding F-005 (P1)
- **Category:** auth
- **Location:** Password Reset Flow
- **Issue:** Token leakage risk in URL; missing analysis of timing attacks on email verification.
- **Impact:** Account takeover via intercepted reset links.
- **Recommendation:** Use short-lived, single-use tokens; enforce re-authentication before sensitive changes.
- **Trace:** API Contracts §2.2

#### Finding F-006 (P2)
- **Category:** authz
- **Location:** Admin Panel
- **Issue:** Missing "Dual-Approval" or "Stewardship" controls for Power User actions on Managed User accounts (e.g., deactivation).
- **Impact:** Accidental or malicious lockout of family members.
- **Recommendation:** Require Power User password confirmation for account deactivation.
- **Trace:** Domain Models: Auth

### Pass 4 — Controls & Readiness

#### Finding F-007 (P1)
- **Category:** readiness
- **Location:** Section 4: Security Controls
- **Issue:** Missing explicit CORS policy and Rate Limiting thresholds for public-facing endpoints (`/api/auth/*`).
- **Impact:** Brute-force vulnerability and potential for cross-origin attacks.
- **Recommendation:** Define Section 4.3: Edge Security with specific RPS limits and strict CORS origin lists.
- **Trace:** Meta-Prompt: Quality Criteria

#### Finding F-008 (P1)
- **Category:** readiness
- **Location:** Section 5: Dependency Audit
- **Issue:** Dependency audit strategy is vague. Missing automated scanning integration in CI.
- **Impact:** Insecure libraries may be introduced and remain in production indefinitely.
- **Recommendation:** Integrate `pnpm audit` or `Snyk` into the CI quality gates.
- **Trace:** Meta-Prompt: Quality Criteria

---

## Resolution Log
| Finding | Severity | Status | Resolution |
|---------|----------|--------|------------|
| F-001   | P1       | PENDING | Will add STRIDE Threat Model. |
| F-002   | P1       | PENDING | Will add MTProto mitigation strategy. |
| F-003   | P1       | PENDING | Will add Data Classification Matrix. |
| F-004   | P1       | PENDING | Will specify Local Storage encryption. |
| F-005   | P1       | PENDING | Will harden Password Reset flow. |
| F-006   | P2       | PENDING | Will add Admin stewardship controls. |
| F-007   | P1       | PENDING | Will define CORS and Rate Limiting. |
| F-008   | P1       | PENDING | Will formalize Dependency Audit. |
