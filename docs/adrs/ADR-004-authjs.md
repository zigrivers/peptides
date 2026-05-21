# ADR-004: Use Auth.js v5 for Authentication

## Status
Accepted

## Context
The application needs secure authentication (Email/Password), session management (30-day rolling), and role-based access control (Power User vs Managed User).

## Decision
We will use Auth.js v5 (NextAuth) with the Credentials provider and Prisma adapter.

## Alternatives Considered
- **Better Auth**: Newer and well-designed, but less AI training data available than Auth.js.
- **Lucia Auth**: Deprecated by author in 2024.
- **Custom JWT session**: More work to implement secure rolling refresh, CSRF protection, and edge middleware integration.

## Mapping to Domain Model Entities

The Auth domain (per `docs/domain-models/auth.md`) defines auth-adjacent entities that are not all native Auth.js concepts. The mapping:

- **`Session`** (domain) ↔ Auth.js Session table (via Prisma adapter). The 30-day rolling expiry is implemented via Auth.js session callback + `updateAge`. `lastSeenAt` is added as an extension column. `revokedAt` is also added (Auth.js doesn't model session revocation natively) — on password change (US-AUT-06 AC 4) we set `revokedAt` on every session except the current one, and our middleware treats revoked sessions as invalid.
- **`Invite`** — Custom table (`invites`). Acceptance creates a `User` via Auth.js's credentials signup flow; the 4-state lifecycle (Invited / Expired / Accepted / Revoked) is managed by our code, not Auth.js.
- **`EmailChangeRequest`** — Custom table. 24h verify expiry + 48h revert window per US-AUT-07. Change is applied directly to `auth_users.email` after verification.
- **`PasswordResetToken`** — Custom table. Auth.js v5 + Credentials provider does not ship a built-in reset flow.

The "Account Identity" aggregate boundary spans both Auth.js's tables and ours; all live in the same PostgreSQL DB (ADR-002).

## Consequences
- **Benefits**: Native integration with Next.js App Router; large ecosystem; easy database persistence via Prisma adapter; handles complex auth flows out-of-the-box. Auth.js owns the User + Session storage we need without us re-implementing it.
- **Costs**: Learning curve for v5 beta patterns; some friction with custom "password reset" flows which must be implemented manually. Three of the auth-domain entities (Invite, EmailChangeRequest, PasswordResetToken) require custom tables — Auth.js's coverage stops at User + Session + Account. Session revocation requires a custom middleware check that consults `revokedAt`.

## Traces
- PRD §5.6 (Auth & Account Management), §8.2 (Password storage requirements)
- Domain model: `docs/domain-models/auth.md` (User, Session, Invite, EmailChangeRequest, PasswordResetToken)
- Stories: US-AUT-03, US-AUT-04, US-AUT-06, US-AUT-07, US-ADM-01
