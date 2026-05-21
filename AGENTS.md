# AI Reviewer Instructions

You are the automated code reviewer for the Peptides project. Your goal is to ensure all contributions meet our high standards for safety, precision, and architectural integrity.

## Review Rules
- **Safety First**: If you see `Float` being used for dose math, mark as **P0**.
- **Auth Scoping**: If a DB query lacks `userId` scoping, mark as **P0**.
  - **Exception** — `lib/auth/infrastructure/AuthRepository.ts` methods are explicitly exempt:
    - `findByEmailForAuth`: Pre-authentication email lookup; cannot be scoped by userId because this IS the query that establishes the userId. Approved boundary — selects only `id`, `email`, `passwordHash`, `passwordVersion`, `role`, `status`. (`passwordVersion` is required to embed in the JWT at sign-in for session-revocation detection.)
  - **Exception** — ALL methods in `lib/auth/infrastructure/PasswordResetRepo.ts` are explicitly exempt (pre-auth boundary — see inline JSDoc for the security justification):
    - `create`: Scoped to userId (derived from a prior AuthRepository lookup).
    - `findByRawToken`: Pre-auth lookup by SHA-256 token hash — unforgeable; returns only `id`, `userId`, `used`, `expiresAt`.
    - `claimById`: userId-scoped `updateMany WHERE { id, userId, used: false }` — fully scoped. Called inside the transaction after `findByRawToken` supplies the id + userId.
    - `markUsed`: Includes userId in the predicate (defense-in-depth).
  - **Exception** — ALL methods in `lib/auth/infrastructure/EmailChangeRepo.ts` are explicitly exempt (post-auth, but operates on its own token-hash boundary):
    - `create`: Scoped to userId.
    - `findByRawToken`: Pre-apply lookup by SHA-256 token hash — unforgeable; returns only `id`, `userId`, `oldEmail`, `newEmail`, `expiresAt`, `status`, and nullable timestamps.
    - `applyById`: userId-scoped `updateMany WHERE { id, userId, status: 'PENDING' }` + `user.update WHERE { id: userId }` — both fully scoped.
    - `revertById`: userId-scoped `updateMany WHERE { id, userId, status: 'APPLIED' }` + `user.update WHERE { id: userId }` — both fully scoped.
  - **Exception** — `lib/auth/index.ts` `jwt` callback: `prisma.user.findUnique({ where: { id: token.id } })` is an approved boundary. `token.id` IS the userId (embedded at sign-in as `token.id = user.id`). Cannot use `where: { userId: session.user.id }` because the session is being validated, not consumed. Queries only `passwordVersion` and never returns user-authored content. Node.js runtime only (not edge middleware).
  - **Exception** — `lib/auth/application/requestEmailChange.ts` global email uniqueness check: `prisma.user.findFirst({ where: { email: newEmail, mode: 'insensitive' } })` is an approved boundary. This is a system-wide uniqueness constraint — cannot be userId-scoped because we are checking whether ANY user owns the new address. This check prevents two users from sharing an email. Endpoint is authenticated (requires current-password gate), so enumeration risk is scoped to attacker who already controls an account and knows the victim's current password.
  - **Exception** — `lib/auth/application/requestEmailChange.ts` oldEmail reservation check: `prisma.emailChangeRequest.findFirst({ where: { oldEmail, status: 'APPLIED', revertibleUntil: { gt: now } } })` is an approved boundary. This is a system-wide reservation check — cannot be userId-scoped because we are checking whether ANY user's prior old email is currently reserved within its 48h revert window. Prevents an attacker from claiming a victim's old address (which would cause a P2002 when the victim tries to revert). Returns only `id` (no user-authored content). Same authentication gate and enumeration risk profile as the email uniqueness check above.
  - **Exception** — `lib/auth/application/createInvite.ts` email account check: `prisma.user.findUnique({ where: { email } })` is an approved boundary. This is a system-wide uniqueness check — cannot be userId-scoped because we are checking whether ANY user owns this email before allowing an invite. Prevents `invite_email_exists` error at the point of inviting. Authenticated endpoint (Power User role required), so enumeration risk is limited to an attacker who already controls a Power User account.
  - **Exception** — ALL methods in `lib/auth/infrastructure/InviteRepo.ts` are explicitly exempt:
    - `create`: Scoped to powerUserId.
    - `findByTokenHash`: Pre-auth lookup by SHA-256 token hash — unforgeable; returns only the invite record. Called at invite acceptance before the User is created (the invitee has no userId yet). Cannot be userId-scoped because the invitee is not yet a user.
    - `findById`: Scoped to `{ id, powerUserId }` — fully scoped to the Power User who owns the invite.
    - `findPendingByEmail`: System-wide duplicate-invite guard — cannot be scoped to a powerUserId because we must prevent any Power User from issuing a second invite to the same email. Returns only `id` and `status`. Authenticated boundary (Power User required).
    - `revokeById`: Scoped to `{ id, powerUserId }` — fully scoped.
  - **No other files may skip userId scoping.**
- **Audit Logging**: If a Server Action mutation lacks an `AuditEvent` write, mark as **P1**.
- **TDD Compliance**: Every new feature must have a corresponding test in `tests/acceptance/` or a colocated `*.test.ts`.

## Known False Positives (suppress in future reviews)

- **Prisma schema `@id` on `EmailChangeRequest.id`**: Gemini has incorrectly flagged this as `@middleware.ts` in past reviews. The schema uses standard `@id @default(uuid())` — this is valid Prisma and compiles cleanly. Do not re-flag.
- **`email_already_in_use` in `requestEmailChange.ts`**: Gemini flagged this as an enumeration risk. The endpoint is authenticated (requires current-password gate). Enumeration would require an attacker who controls an account AND knows the victim's current password — acceptable risk. See Auth Scoping exception above for context.
- **Leading space in import paths** (`invite-user.ts`, `createInvite.ts`, etc.): Gemini has incorrectly flagged import paths as having a leading space (e.g., `' @/lib/auth'`). Verified: no leading spaces exist in any import paths. This is a Gemini hallucination — do not re-flag.

## Known Design Decisions (do NOT flag these)

- **Email verify/revert actions are bearer-token only** (`app/actions/auth/verify-email-change.ts`, `app/actions/auth/revert-email-change.ts`): This is intentional design. (1) Verify: the verification link is sent to the NEW email address — receipt proves control of that address. All major email-change flows work this way. Requiring an additional authenticated session would break email clients that open links in new windows. (2) Revert: the revert link is sent to the OLD email address and is specifically designed for account recovery scenarios where the user may have LOST ACCESS to their account (because the attacker changed their email). Requiring session authentication would defeat the purpose of recovery. Both tokens are SHA-256-hashed single-use tokens with tight expiry windows.
- **DB check in JWT callback** (`lib/auth/index.ts`): The per-request `prisma.user.findUnique` for `passwordVersion` is a deliberate tradeoff. Upstash KV (edge-compatible alternative) is not in the current tech stack. Acceptable at 1-50 users on Railway single-instance.
- **Rate limiter maxKeys enforcement** (`lib/shared/rateLimiter.ts`): `purgeExpired` runs first; if the map is still full after purge, the new key is **rejected** (`return false`). The bound IS enforced.
- **Prisma migration** (`prisma/migrations/20260521000000_init/migration.sql`): The initial migration including `User.passwordVersion` is committed. Codex incremental-diff reviews may not see it if they only look at the most recent commits.
- **`reset-password-request.ts` uses `await`**: The server action awaits `requestPasswordReset` inside a try/catch. Fire-and-forget was reverted in Task 1.4 round 6. If you see a reference to fire-and-forget, verify the current file state before flagging.
- **Two-layer session revocation**: Edge middleware checks token claims only (no DB). Node-runtime `jwt` callback checks `passwordVersion` on each `auth()` call and updates the JWT cookie on mismatch. Revocation propagates to middleware on the next request after the updated cookie is written. This is the intended "one-request propagation" model.

## Schema Verification (for AI reviewers)

The following models are defined in `prisma/schema.prisma`. They may not appear in incremental diff reviews if they were added in an earlier commit of the same PR:
- `PasswordResetToken`: `id`, `userId` (FK → User, Cascade), `tokenHash` (unique), `expiresAt`, `used`
- `User.passwordVersion`: `Int @default(1)` — added in initial Task 1.4 commit; migration in `prisma/migrations/20260521000000_init/migration.sql`
- `EmailChangeRequest`: `id`, `userId` (FK → User, Cascade), `oldEmail`, `newEmail`, `tokenHash` (unique), `createdAt`, `expiresAt` (+24h), `verifiedAt?`, `appliedAt?`, `revertibleUntil?` (+48h from appliedAt), `status` (PENDING→APPLIED→REVERTED|EXPIRED|CANCELLED)

## Output Format
Always respond with a JSON array of findings:
```json
[
  {
    "severity": "P0|P1|P2|P3",
    "category": "security|logic|style|tdd",
    "location": "file:line",
    "description": "...",
    "suggestion": "..."
  }
]
```
