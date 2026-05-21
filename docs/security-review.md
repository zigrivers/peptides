# Security Review

**Status:** Draft
**Date:** 2026-05-20
**System Architecture source:** `docs/system-architecture.md`
**API Contracts source:** `docs/api-contracts.md`
**Domain Model source:** `docs/domain-models/`
**Methodology:** deep | Depth: 5/5

---

## 1. Data Classification Matrix

| Class | Data Type | Storage | Handling |
|-------|-----------|---------|----------|
| **Secret** | MTProto session strings, AI API keys, VAPID private key, NEXTAUTH_SECRET, CRON_SECRET, TELEGRAM_SESSION_KEY (master encryption) | Postgres (encrypted) + env vars | Never returned to UI; never logged; AES-256-GCM at rest; environment variables only for crypto keys. |
| **Health-adjacent (Sensitive)** | Dose logs, outcome ratings, peptide names in protocols, reconstitution records | Postgres + IndexedDB (offline queue) | Scoped by `userId` enforced at the query layer; IndexedDB encrypted with a per-user passphrase-derived key (PBKDF2-SHA256 + 600k iterations); never logged at any log level. |
| **PII (Sensitive)** | Email, name, IP address, user-agent | Postgres + Sentry breadcrumbs | Emails hashed (first 3 chars + domain) in application logs; IP recorded in Session for fingerprint-mismatch detection (§4.3); never sold/exported for analytics. |
| **Internal** | User roles, onboarding state, reminder preferences | Postgres | System use only; user can view but not query others'. |
| **Public** | Peptide catalog, citations, mechanism-of-action text | Postgres / CDN | Publicly readable; cacheable; admin-curated (no user-generated). |

---

## 2. Threat Model (STRIDE)

| # | Trust Boundary | Threat (S/T/R/I/D/E) | Mitigation |
|---|----------------|----------------------|------------|
| 1 | Browser ↔ PWA Service Worker | **Spoofing**: malicious extension injecting sync events | Same-origin policy on service worker registration; CSP `script-src 'self'`; integrity hashes on critical assets |
| 2 | PWA ↔ IndexedDB | **Information Disclosure**: device theft exposing offline doses | Per-user passphrase-derived encryption (PBKDF2-SHA256 600k iter); encryption key never persisted (re-derived on session resume); auto-purge IndexedDB on logout |
| 3 | PWA → Server (HTTPS) | **Spoofing (sync replay)**: attacker replays captured sync events | HTTPS-only; Idempotency-Key on every mutation (UUID v4, 24h retention); session cookie httpOnly + SameSite=Strict |
| 4 | Server → Telegram (MTProto) | **Spoofing / Information Disclosure** of session | AES-256-GCM encryption of session string at rest with `TELEGRAM_SESSION_KEY`; session NEVER returned in any API response (§4.3); IP-mismatch heartbeat warning (§4.3) |
| 5 | Power → Managed User (RBAC) | **Elevation of Privilege**: managed user reaching admin endpoints | Server-side role check on every action; managed users get 403 on `/admin/*` and `/ordering/*`; tested in E2E suite |
| 6 | API ↔ external services (Resend, R2, Anthropic, Gemini) | **Information Disclosure**: leaking user data to vendor | Resend/R2: only metadata + signed URLs; AI: only redacted prompts (see §7 AI Security); Sentry: PII scrubbed via beforeSend hook |
| 7 | Cron endpoints | **Spoofing**: attacker invoking purge job | `CRON_SECRET` Bearer token; rotation 6 months (per operations §6) |
| 8 | AI provider ← prompt | **Tampering (prompt injection)**: user-supplied input changing prompt behavior | All user input flows through allowlist-character validation before AI calls; AI outputs treated as untrusted (validated server-side before any side-effect) |
| 9 | Server → Email channel (Resend) | **Repudiation**: user denies receiving a critical email | Every transactional email writes an audit event with the message ID; Resend delivery webhook confirms; export emails record signed-URL fingerprint |
| 10 | Power User → Audit log | **Tampering**: attempt to modify or delete past audit events | `AuditEvent` table has no UPDATE or DELETE grants for the app role; only the cron `audit-purge` job (separate role with limited DELETE WHERE timestamp < now() - 90d) can prune |
| 11 | Power User → Account deletion | **Repudiation**: family member denies their data was deleted | US-ADM-04 mandates export-to-admin before deletion + audit event preserved with subjectUserId |
| 12 | API ↔ user | **Denial of Service (auth brute-force)**: credential stuffing | Per-IP rate limit 5 attempts / 15 min on `/api/auth/*`; CAPTCHA fallback after 3 failures from same IP |
| 13 | Vendor (Telegram bot) → Server | **Information Disclosure (vendor compromise)** | Vendor messages are treated as untrusted; payment amount + wallet address MUST be re-entered manually by the user (cannot be auto-parsed in v1) |
| 14 | Power User → Payment confirmation | **Tampering (UI replay attack)**: malicious browser ext autosubmits the safety gate | Server-side `acknowledged: true` check + recent-vendor-wallet display + 60s duplicate-send protection at server |

---

## 3. Auth & AuthZ Strategy

### 3.1 Password Reset (unauth flow)
- Reset tokens: single-use, high-entropy (32 bytes), hashed at rest (`tokenHash`).
- 1-hour expiry; clock-skew tolerance ±5 min.
- After successful reset: all sessions for that user are revoked (set `revokedAt`).
- Email enumeration prevented: reset-request endpoint always returns 204 (per API §2.2).
- Rate limited to 5 requests / hour / email (silent — never reveals attempts).

### 3.2 Change Own Password (authenticated, US-AUT-06)
- Current-password gate via bcrypt compare (constant-time).
- New-password rules: ≥12 chars; cannot equal current (server-side check).
- **Session invalidation**: on success, all of the user's other Sessions are revoked (`revokedAt` set); current session retained. Middleware treats `revokedAt != null` as invalid.
- Field-leak prevention: `current_password_invalid` error code intentionally returned for both the wrong-current case AND any new-password-invalid case where the current is wrong; UI maps it to the Current Password field.
- Audit: `PASSWORD_CHANGED` + `OTHER_SESSIONS_INVALIDATED` events.

### 3.3 Change Own Email (authenticated, US-AUT-07)
- Current-password gate required.
- Verification flow: token sent to NEW address; expires in 24h; token hashed at rest.
- **Old-address notice with revert link**: sent immediately after `applied_at`; revert link valid for 48h. Critical anti-takeover control — even if an attacker compromises the user's session and tries to swap email, the legitimate owner receives notice at their previous address and can revert.
- Token reuse: 410 `email_change_token_invalid` once consumed.
- Email enumeration prevented: conflict check returns `email_in_use` without indicating whether the owner is "you" or "someone else".
- Audit: `EMAIL_CHANGE_REQUESTED` → `EMAIL_CHANGE_VERIFIED` → optional `EMAIL_CHANGE_REVERTED`.

### 3.4 Admin Stewardship
- Managed user deactivation: requires Power User password re-confirmation in the modal.
- Managed user deletion (US-ADM-04): requires password re-confirmation + type-the-user's-email confirmation + mandatory export-first to admin.
- Audit chain on admin actions: every action records `actor_user_id = Power User`, `subject_user_id = managed user`.
- **No "log on behalf of"**: admins cannot submit dose logs as a managed user (DoseLog.loggedByUserId always = the user who confirmed in their own browser; PRD §5.5).

### 3.5 Session Management
- Auth.js v5 + Prisma adapter (ADR-004).
- 30-day rolling expiry; refreshed on activity.
- `lastSeenAt`, `revokedAt`, `ipAddress` (hashed), `userAgent` extension columns.
- **IP-mismatch heartbeat warning**: if the session is used from an IP whose hash differs from the last 5 activity records, surface a soft banner "Looks like you signed in from a new location. If this wasn't you, change your password." NOT a hard logout — that would be hostile to mobile users on cellular networks. Audit event recorded.
- Logout revokes the current session (`revokedAt = now()`).
- Password change revokes all other sessions (per §3.2).

---

## 4. Security Controls

### 4.1 Encryption at Rest
- **Database**: Railway-managed encryption for Postgres volumes (at-rest AES-256).
- **MTProto sessions**: AES-256-GCM application-layer encryption of `TelegramSession.sessionString` using `TELEGRAM_SESSION_KEY` master key (env var). The key is NEVER stored in DB; rotation script in operations §6.
- **IndexedDB (PWA offline queue)**: encryption key derived from a user-entered passphrase (separate from login password) via PBKDF2-SHA256 + 600,000 iterations + per-user random salt stored in IndexedDB metadata. The derived key is held in JS memory only (cleared on tab close + on logout). Without the passphrase, encrypted dose logs in IndexedDB are unrecoverable — by design, even with device access an attacker cannot read the queue.
  - **Alternative for users who skip the passphrase**: the queue stores opaque "encrypted with weak key" markers; on first online sync the unencrypted plaintext is sent. Users who decline the passphrase accept that local-device-only data leakage is possible. This is surfaced in onboarding.
- **R2 (object storage)**: provider-side encryption (AES-256); signed URLs with 7-day expiry; no client-side encryption needed (export contents are already user-scoped + ephemeral).

### 4.2 Encryption in Transit
- TLS 1.3 enforced (HTTPS-only); HSTS header `max-age=31536000; includeSubDomains; preload`.
- Telegram MTProto: protocol-native end-to-end encryption.
- Resend, R2, Anthropic, Gemini: all over HTTPS with provider TLS certificates pinned to root CA bundle.

### 4.3 Edge Security (CORS, Rate Limiting, CSP)

**CORS:**
- Allowed origins: production URL + staging URL only. No wildcards. No `Access-Control-Allow-Credentials: *`.
- Preflight cached 24h.

**Rate Limiting** (mirrored from `docs/api-contracts.md` §9):

| Scope | Limit |
|-------|-------|
| Per-IP / minute (anonymous) | 60 req/min |
| Per-user / minute (authenticated) | 600 req/min |
| `/api/auth/*` (login, register, reset) | 5 attempts / 15 min / IP (brute-force protection) |
| `/api/sync` | 10 req/min (sync storm protection) |
| `/actions/ordering/send-order` | 10 / hour / user |
| `/actions/auth/reset-password-request` | 5 / hour / email (silent — always returns 204) |
| `/actions/auth/change-email-request` | 3 / day / user |

**Content Security Policy** (binding):
```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://*.sentry.io https://api.resend.com https://*.r2.cloudflarestorage.com https://api.anthropic.com https://generativelanguage.googleapis.com wss://*.telegram.org;
frame-ancestors 'none';
form-action 'self';
upgrade-insecure-requests;
```
`'unsafe-inline'` on `style-src` is needed for Tailwind's runtime; we accept that trade-off. `'unsafe-eval'` and `'unsafe-inline'` on `script-src` are NOT permitted — any third-party script needing eval is rejected.

**Other headers:**
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` (no permissions needed)

### 4.4 MTProto Session Protection
- **Session scoping**: each `TelegramSession` row is FK'd to a single `userId`; no cross-user lookup possible.
- **Session storage**: AES-256-GCM ciphertext only; key in env (`TELEGRAM_SESSION_KEY`).
- **IP-mismatch heartbeat**: MTProto reconnect attempts log the source IP; if the active server IP changes mid-flight (e.g., Railway container migration), the session is paused for 60s to detect potential session theft, then resumes if no concurrent activity from a different fingerprint.
- **Automatic invalidation**: session row deleted on (a) account deletion, (b) user-initiated "disconnect Telegram" action, (c) `TELEGRAM_SESSION_REVOKED` audit event detected from external monitoring.
- **Rotation procedure**: documented in operations §6 (`pnpm tsx scripts/rotate-sessions.ts` re-encrypts every session with the new master key).

---

## 5. Dependency Audit Strategy

- **Automated CI scan**: `pnpm audit` runs on every PR; high-severity vulnerabilities BLOCK merge.
- **Snyk**: weekly scan of the `main` branch for deep dependency vulnerabilities (transitive deps).
- **Update Cadence**:
  - **Security patches**: applied within 24 hours of CVE publication if severity is critical or high.
  - **Minor updates**: monthly batch updates with full test-suite run.
- **SBOM**: produced via `pnpm sbom > sbom.spdx.json` on every release; archived in `releases/{version}/`.
- **Supply-chain attack defenses**: Renovate bot opens PRs for updates; PRs require manual review before merge (no auto-merge); npm package signatures verified via `pnpm config set verify-store-integrity true`.

---

## 6. Audit Trail Compliance

We maintain a 100% immutable audit log for **Sensitive Mutations** (every action that changes user-visible state in a security-relevant way).

**Auth events**: `USER_REGISTERED`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`, `OTHER_SESSIONS_INVALIDATED`, `EMAIL_CHANGE_REQUESTED`, `EMAIL_CHANGE_VERIFIED`, `EMAIL_CHANGE_REVERTED`, `ACCOUNT_DELETION_SCHEDULED`, `ACCOUNT_DELETION_CANCELLED`, `ACCOUNT_DELETED`, `IP_MISMATCH_DETECTED`.

**Admin events**: `USER_INVITED`, `INVITE_RESENT`, `INVITE_ACCEPTED`, `MANAGED_USER_DEACTIVATED`, `MANAGED_USER_DELETION_REQUESTED`, `MANAGED_USER_DELETED`, `MANAGED_USER_PASSWORD_RESET_TRIGGERED`.

**Protocol events**: `PROTOCOL_CREATED`, `PROTOCOL_UPDATED`, `PROTOCOL_PAUSED`, `PROTOCOL_RESUMED`, `PROTOCOL_CLONED`, `PROTOCOL_DEACTIVATED`, `CYCLE_CREATED`, `CYCLE_UPDATED`, `CYCLE_RESTARTED`.

**Order events**: `ORDER_DRAFTED`, `ORDER_SENT`, `ORDER_CONFIRMED`, `PAYMENT_ACKNOWLEDGED`, `ORDER_PAYMENT_SENT`, `ORDER_RECEIVED`, `ORDER_CANCELLED`, `ORDER_MARKED_STALE`, `DUPLICATE_SEND_BLOCKED`.

**Reconstitution events**: `VIAL_RECONSTITUTED`, `SAFETY_WARNING_TRIGGERED`.

**Security events**: `TELEGRAM_SESSION_LINKED`, `TELEGRAM_SESSION_REVOKED`, `AUDIT_WRITE_FAILURE` (meta — alerts on audit-log integrity itself).

Full canonical action vocabulary in `docs/domain-models/audit.md`. ADR-009 specifies the no-FK historical-reference rule for `actor_user_id`/`subject_user_id`.

---

## 7. AI Security (per ADR-010)

### 7.1 Prompt injection defenses
- All user-supplied input to AI prompts is **wrapped in clearly-labeled delimiters** (e.g., `<<USER_INPUT>>...</USER_INPUT>>`) and the system prompt instructs the model to treat content within those delimiters as untrusted data, not instructions.
- AI outputs are treated as **untrusted**: structured outputs (e.g., PubMed citation extraction) are validated against a Zod schema before being persisted; free-text outputs are not rendered as HTML (escape only).
- AI outputs NEVER directly trigger a state mutation — there is always a human-in-the-loop step (Power User reviews drafted profiles; user confirms parsed Telegram values on the payment screen).

### 7.2 Data leakage prevention
- **Anthropic + Gemini provider boundaries**: prompts include only the data required for the specific task. User identifiers (UUIDs) are sent but emails, dose values per user, and wallet addresses are NEVER sent in prompts.
- Anthropic prompt-cache content is reviewed for any PII leaks at prompt-update time.
- **Opt-out from training**: both Anthropic API tier and Gemini API tier (Vertex / paid) are configured with "do not train on inputs" — this is the default for paid API tiers but is verified at provider-configuration time.

### 7.3 Hallucination safety
- AI outputs are NEVER used for safety-critical math (reconstitution, payment confirmation, dose calculation). These paths use deterministic code with 100% test coverage (per ADR-008).
- AI-drafted compound profiles carry a visible "Draft (AI-assisted)" badge until Power User reviews and approves. Citation links generated by AI are validated (URL reachable + returns 2xx) before publish.

---

## 8. OWASP Top 10 (2021) Posture

| ID | Risk | Mitigation in this app | Residual |
|----|------|------------------------|----------|
| A01 | Broken Access Control | Server-side role check on every endpoint; managed users 403 on admin/ordering; userId-scoped queries (CLAUDE.md rule) | Low — covered by E2E RBAC tests |
| A02 | Cryptographic Failures | bcrypt cost ≥ 12 for passwords; AES-256-GCM for MTProto sessions; HTTPS + HSTS; tokens hashed at rest | Low |
| A03 | Injection | Prisma parameterized queries only; no raw SQL string concatenation; Zod validation on every input; CSP `script-src 'self'` | Low |
| A04 | Insecure Design | Threat model in §2; safety gates at architectural layer (payment confirm, reconstitution warnings); audit log on every sensitive mutation | Low |
| A05 | Security Misconfiguration | Env vars never logged; secrets out of git (`.env` gitignored); CSP headers; no debug mode in prod | Medium — depends on operator discipline |
| A06 | Vulnerable & Outdated Components | `pnpm audit` in CI; Snyk weekly; 24h SLA on critical CVEs (see §5) | Low |
| A07 | Identification & Auth Failures | Auth.js v5; bcrypt; rate-limited auth endpoints; session-revocation on password change; IP-mismatch heartbeat | Low |
| A08 | Software & Data Integrity Failures | Idempotency keys on every mutation; audit log immutability; signed cron-secret; Prisma migrations are forward-only | Low |
| A09 | Security Logging & Monitoring Failures | Sentry + AuditEvent + Pino structured logs; backup-verify cron; cron monitors on every job; alert thresholds in operations §3 | Low |
| A10 | Server-Side Request Forgery (SSRF) | No user-controlled URL fetching except validated external services (Resend, R2, AI providers, Telegram); citation URLs from compound profiles are admin-curated, not user-supplied | Low |

---

## 9. Phase 2 Legal-Gate Security Implications

When Phase 2 ships (managed users), the security posture changes:

- **Consent capture**: each managed user MUST sign (or click-through) an acknowledgment that the Power User configures their protocols and views their adherence data. The signed artifact is stored in R2 under `legal/acks/{userId}.pdf` with 7-year retention (operations §4.1).
- **Data subject rights**: the managed user retains the right to request a data export and account deletion at any time. These flows do NOT require Power User approval (US-AUT-02 + US-ADM-04 hybrid path documented in §3.4 above).
- **Audit access**: managed users can request a copy of all audit events with their `subject_user_id` (separate read endpoint, future scope; not v1).
- **Breach notification**: in the event of a security breach affecting any managed user's data, the Power User notifies that managed user directly within 72 hours of discovery. The notification template is in `docs/decisions/breach-notification-template.md` (future scope).

---

## 10. Security Incident Response

### 10.1 Severity classification
- **P0 (active compromise)**: confirmed unauthorized access to user data; payment/ordering compromise; AI provider credential leak. Response: immediate page; consider taking ordering module offline (`DISABLE_ORDERING=true` per ADR-015); rotate all secrets per operations §6.
- **P1 (high risk, no confirmed compromise)**: vulnerability disclosed in critical dependency; suspicious authentication patterns; MTProto rate-limit anomalies. Response: triage within 4h; patch within 24h.
- **P2 (medium)**: lower-severity dependency CVE; isolated user-report of suspicious behavior. Response: triage within 24h; patch within 7d.
- **P3 (informational)**: hardening opportunities; minor policy violations. Response: tracked in `docs/decisions/security-followups.md`.

### 10.2 Procedure
1. **Detect**: Sentry alert, AuditEvent pattern, user report, or external CVE feed.
2. **Triage**: classify per §10.1; assign owner (solo dev = Power User).
3. **Contain**: take affected module offline via feature flag if possible (ordering module isolatable per ADR-015).
4. **Eradicate**: patch / rotate secrets / revoke tokens.
5. **Recover**: redeploy; verify via E2E smoke; restore feature flags.
6. **Post-mortem**: document in `docs/decisions/incidents/{date}-{slug}.md` within 7 days; include timeline, blast radius, root cause, prevention.

---

## 11. Security Review Cadence

- **This document**: review and re-issue annually OR upon any of: (a) new bounded context, (b) new external service, (c) new AI use case, (d) Phase 2 legal-gate launch, (e) confirmed security incident.
- **Dependency audit**: weekly (Snyk + `pnpm audit`).
- **DR test**: quarterly (operations §5).
- **Penetration test**: external — out of scope for v1 (solo build); revisit at paid-license launch.

---

## 12. Cross-References

- **ADRs**: ADR-002 (Postgres + Prisma — SQL injection defense), ADR-004 (Auth.js), ADR-005 (GramJS session security), ADR-008 (Testing — 100% coverage on safety modules), ADR-009 (Audit log immutability + retention), ADR-010 (AI strategy — provider data-leakage policy), ADR-014 (R2 — signed URLs + 7-day lifecycle), ADR-015 (Ordering isolation — feature-flag).
- **PRD**: §8.2 (Security NFRs), §7.5 (Legal — Phase 2 gate).
- **Domain model**: `docs/domain-models/audit.md`, `docs/domain-models/auth.md`.
- **Operations**: §3 (monitoring), §4 (incident playbooks), §6 (secret rotation), §7 (logging policy).
