# Security Review

**Status:** Draft  
**Date:** 2026-05-20  
**System Architecture source:** `docs/system-architecture.md`  
**API Contracts source:** `docs/api-contracts.md`  
**Methodology:** deep | Depth: 5/5

---

## 1. Data Classification Matrix

| Class | Data Type | Storage | Handling |
|-------|-----------|---------|----------|
| **Secret** | MTProto Sessions, API Keys | Postgres (Encrypted) | Never returned to UI; AES-256-GCM. |
| **Sensitive** | Dose Logs, Outcomes, Email | Postgres / IndexedDB | Scoped by `userId`; Encrypted at rest. |
| **Internal** | User Roles, Onboarding State | Postgres | System use only. |
| **Public** | Peptide Catalog, Citations | Postgres / CDN | Publicly readable (cached). |

---

## 2. Threat Model (STRIDE)

| Boundary | Threat | Mitigation |
|----------|--------|------------|
| **PWA -> Server** | Spoofing (Sync Replay) | Idempotency Keys + Auth.js Session Validation. |
| **Server -> Telegram** | Information Disclosure | AES-256 encryption of sessions at rest. |
| **Power -> Managed** | Elevation of Privilege | Strict RBAC; ordering module blocked for managed users. |
| **API** | Tampering (Dose Log) | Server-side Zod validation; Audit Trail. |
| **API** | Denial of Service | Rate Limiting (60 rpm/IP). |

---

## 3. Auth & AuthZ Strategy

### 3.1 Hardened Password Reset
- Tokens are single-use, high-entropy, and stored as hashes.
- 1-hour expiry.
- Mandatory re-authentication for email/password changes post-reset.

### 3.2 Admin Stewardship
- Managed user deactivation requires Power User password confirmation.
- Direct DB access to managed user data is restricted to Power User context.

---

## 4. Security Controls

### 4.1 Encryption at Rest
- **Database**: Railway-managed encryption for Postgres volumes.
- **Application**: AES-256-GCM for `TelegramSession` strings in Postgres.
- **PWA**: IndexedDB sensitive fields (note, dose) encrypted using a user-derived key (Pbkdf2) before local storage.

### 4.2 Edge Security (CORS & Rate Limiting)
- **CORS**: Strict allowed origins (Production URL + Staging). No wildcards.
- **Rate Limiting**:
  - `/api/auth/*`: 5 attempts per 15 mins (Brute-force protection).
  - `/api/sync`: 10 requests per minute (Sync storm protection).
  - Overall: 60 requests per minute per IP.

### 4.3 MTProto Session Protection
- **Session Scoping**: Sessions are strictly tied to a specific `userId`.
- **Invalidation**: Automatic session wipe on account deletion or security breach detected in `AuditLog`.

---

## 5. Dependency Audit Strategy

- **Automated Scanning**: `pnpm audit` integrated into CI Quality Gate.
- **Snyk**: Weekly scan of the `main` branch for deep dependency vulnerabilities.
- **Update Cadence**:
  - Security patches: Applied within 24 hours.
  - Minor updates: Monthly batch updates.

---

## 6. Audit Trail Compliance

We maintain a 100% immutable audit log for:
- All `Protocol` mutations (Create/Pause/Edit).
- All `Order` state transitions.
- All `Auth` events (Login/Failed Login/Reset).
- All `Admin` actions on managed users.
