# Review: Security Review

**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5  
**Status:** RE-REVIEWED 2026-05-20 — 5th resolution-log regression repaired + 12 new findings fixed; Full Pass  
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
| F-001   | P1       | RESOLVED | Will add STRIDE Threat Model. |
| F-002   | P1       | RESOLVED | Will add MTProto mitigation strategy. |
| F-003   | P1       | RESOLVED | Will add Data Classification Matrix. |
| F-004   | P1       | RESOLVED | Will specify Local Storage encryption. |
| F-005   | P1       | RESOLVED | Will harden Password Reset flow. |
| F-006   | P2       | RESOLVED | Will add Admin stewardship controls. |
| F-007   | P1       | RESOLVED | Will define CORS and Rate Limiting. |
| F-008   | P1       | RESOLVED | Will formalize Dependency Audit. |

> Note: the original Resolution Log marked all 8 of F-001..F-008 as "PENDING" with "Will…" prose, but the doc had been substantively updated since. This re-review verifies the state and repairs the resolution-log regression — the 5th of this batch.

---

## Re-Review Pass — 2026-05-20 (auto-fix batch)

**Reviewer**: Claude (Opus 4.7). Depth 5/strict. Document substantially expanded to cover security implications of all the changes from steps 2-11.

### Resolution-log regression repaired (5th in this batch)

| Prior Finding | Pre-rewrite state | Now |
|---------------|-------------------|-----|
| F-001 STRIDE | Had a 5-row table | **Expanded to 14 rows** with explicit threat type per row |
| F-002 MTProto session monitoring | Mentioned but no IP-mismatch logic | **§3.5 + §4.4 add IP-mismatch heartbeat warning** (soft banner, not hard logout to avoid mobile-network hostility) |
| F-003 Data Classification | Had 4-row matrix | **Now 5-tier matrix** with handling rules per tier including PII (email) explicitly broken out |
| F-004 IndexedDB encryption | Mentioned PBKDF2 with ambiguous key source | **§4.1 now specifies**: per-user passphrase + 600k iterations + salt; passphrase NEVER persisted; explicit "skip passphrase" fallback documented |
| F-005 Password reset | Had 3 bullets | **§3.1 expanded** with clock-skew tolerance, all-sessions-revoke-on-reset, email enumeration prevention via always-204 |
| F-006 Admin stewardship | Had 2 bullets | **§3.4 expanded** with password re-confirm + type-the-email + no-log-on-behalf-of rule |
| F-007 CORS + Rate limits | Had 3 bullets | **§4.3 expanded** with full CSP header definition (binding), other security headers, mirrored rate-limit table from api-contracts.md §9 |
| F-008 Dependency audit | Mentioned `pnpm audit` + Snyk | **§5 expanded** with 24h SLA for critical CVEs, monthly minor cadence, SBOM generation, supply-chain attack defenses (Renovate + manual review + signature verification) |

### New findings (re-review)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 (regression) | All 8 prior findings marked PENDING but most were partial-or-resolved in the doc. | Verified each; promoted to RESOLVED; F-002 completed. |
| N2 | P1 | §2 STRIDE missing key trust boundaries from steps 2-7 additions. | Expanded from 5 → 14 boundaries covering PWA↔IndexedDB, Cron, AI providers, Email, Audit-log tampering, Vendor (Telegram bot), Account deletion, UI replay attacks on payment confirmation. |
| N3 | P1 | §3 Auth missing change-password (US-AUT-06) + change-email (US-AUT-07) security analysis. | Added §3.2 Change Password (session invalidation, field-leak prevention, constant-time bcrypt compare) and §3.3 Change Email (verify+revert + old-address notice as the anti-takeover control). |
| N4 | P1 | §4.1 IndexedDB encryption key-derivation source ambiguous. | Specified per-user passphrase (separate from login) + PBKDF2-SHA256 + 600k iterations + per-user salt; key in JS memory only; explicit fallback for users who skip the passphrase. |
| N5 | P1 | §4.3 MTProto missing IP-mismatch logout (F-002 partial). | Added IP-mismatch heartbeat to §3.5 (session) and §4.4 (MTProto) — soft banner, not hard logout, to avoid hostility to mobile users on cellular. |
| N6 | P1 | §6 Audit Trail Compliance listed only 4 categories. | Expanded to 6 categories (Auth, Admin, Protocol, Order, Reconstitution, Security) with full event lists matching `docs/domain-models/audit.md`. |
| N7 | P1 | No OWASP Top 10 review section. | Added §8 with all 10 (2021) risks mapped to specific mitigations in this app + residual risk assessment per row. |
| N8 | P2 | No CSP headers section. | Added explicit CSP policy in §4.3 with documented `'unsafe-inline'` on style-src trade-off + other security headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy). |
| N9 | P2 | No AI security section. | Added §7 covering prompt-injection defenses (delimited untrusted input + Zod validation + no-direct-mutation), data-leakage prevention (provider boundary rules, opt-out from training), hallucination safety (AI never used for safety-critical math). |
| N10 | P2 | Missing Phase 2 legal-gate security implications. | Added §9 covering consent capture, data subject rights, audit access for managed users, breach notification template. |
| N11 | P3 | Vague incident response procedure. | Added §10 with severity classification (P0/P1/P2/P3), 6-step procedure (Detect → Post-mortem), incident docs location. |
| N12 | P3 | No security review cadence. | Added §11: annual review + re-triggers (new context, external service, AI use case, Phase 2 launch, incident); Snyk weekly; DR quarterly; pen test out-of-scope v1. |

### Regressions detected (re-review)

None introduced.

### Gate result (re-review)

- **Gate**: **Full Pass** (upgraded from INITIAL Conditional Pass)
- **5th resolution-log regression repaired**
- **All 12 new findings fixed**
- **Document now 4× longer with comprehensive security posture**
- **Re-trigger conditions**: as documented in §11.
