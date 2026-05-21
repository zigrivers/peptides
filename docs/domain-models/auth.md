# Auth Domain

The Auth Domain manages user accounts, sessions, and managed user invitations.

## Ubiquitous Language
- **User**: An authenticated person (Power User or Delegated Participant).
- **Power User**: The system administrator who manages other users and the ordering module.
- **Delegated Participant**: A user invited by a Power User (Managed User role).
- **Invite**: A token-based invitation to join the app.

## Entities

### User (Aggregate Root)
An account entity.
- **Attributes**:
  - `id`: UUID
  - `email`: string (Unique)
  - `passwordHash`: PasswordHash (Value Object)
  - `role`: enum (PowerUser, ManagedUser)
  - `managedBy`: UUID (FK, optional)
  - `status`: enum (Active, Deactivated, Pending)
  - `createdAt`: timestamp

### PasswordResetToken (Entity)
A single-use token for password recovery.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `tokenHash`: string
  - `expiresAt`: timestamp
  - `used`: boolean

### AccountDeletionRequest (Entity)
A request to wipe all user data.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `requestedAt`: timestamp
  - `scheduledFor`: timestamp (48h delay)
  - `status`: enum (Pending, Executed, Cancelled)

### DataExportRequest (Entity)
A request for data portability.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `format`: enum (JSON, CSV)
  - `status`: enum (Pending, Processing, Completed, Failed)
  - `downloadUrl`: string (optional)
  - `expiresAt`: timestamp (optional)

### OnboardingState (Value Object)
Tracks the user's progress through the setup wizard.
- **Attributes**:
  - `step`: enum (Catalog, Protocol, Telegram, Done)
  - `completedAt`: timestamp (optional)
  - `dismissed`: boolean

### Session (Entity)
An authenticated session for a user.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `tokenHash`: string
  - `createdAt`: timestamp
  - `lastSeenAt`: timestamp
  - `expiresAt`: timestamp (rolling: extended on activity; capped at 30 days from creation)
  - `ipAddress`: string (optional, hashed for privacy)
  - `userAgent`: string (optional)
  - `revokedAt`: timestamp (optional — set on logout, password change, or admin deactivation)

### Invite (Entity)
A pending invitation issued by a Power User to a future Managed User.
- **Attributes**:
  - `id`: UUID
  - `invitedByUserId`: UUID (FK — the Power User)
  - `email`: string
  - `tokenHash`: string
  - `createdAt`: timestamp
  - `expiresAt`: timestamp (72h after `createdAt`)
  - `acceptedAt`: timestamp (optional)
  - `acceptedByUserId`: UUID (FK, optional — the User created from this invite)
  - `status`: enum (Invited, Expired, Accepted, Revoked)
- **Lifecycle rules**:
  - Resending an invite revokes the prior `Invite` (status = Revoked) and creates a new one with a fresh `expiresAt`.
  - `Expired` is a derived status when `now > expiresAt` AND `acceptedAt is null` AND `status != Revoked`.

### EmailChangeRequest (Entity)
A pending email-address change requiring verification at the new address (US-AUT-07).
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `newEmail`: string
  - `tokenHash`: string
  - `createdAt`: timestamp
  - `expiresAt`: timestamp (24h after `createdAt`)
  - `verifiedAt`: timestamp (optional — when the user clicks the verification link in the new-address email)
  - `appliedAt`: timestamp (optional — when the User.email is actually swapped)
  - `revertibleUntil`: timestamp (optional — 48h after `appliedAt`; allows the *previous* email address to revert the change)
  - `status`: enum (Pending, Verified, Applied, Reverted, Expired, Cancelled)

## Value Objects

### PasswordHash
Securely hashed password.
- **Attributes**:
  - `hash`: string
  - `algorithm`: string (bcrypt)
  - `cost`: number (default 12)

## Aggregate: Account Identity
- **Consistency Boundary**: A User and their auth-related state (tokens, sessions, invites, requests).
- **Root**: User
- **Invariants**:
  - Password hash must use bcrypt with cost >= 12.
  - Deleting a Power User requires all linked Managed Users to be deactivated or deleted first.
  - On password change: all of the user's Sessions other than the current one are revoked (revokedAt set).

## Domain Events
- `UserRegistered`: A new Power User signs up.
- `UserLoggedIn`: A user authenticates and a Session is created.
- `UserInvited`: A Power User sends an invite.
- `InviteResent`: A Power User resends a pending or expired invite (prior Invite is Revoked, new one Created).
- `InviteAccepted`: A Managed User completes registration.
- `PasswordResetRequested`: A user requests a password-reset link.
- `PasswordResetCompleted`: A user successfully resets their password using the link.
- `PasswordChanged`: A logged-in user changes their own password (US-AUT-06).
- `OtherSessionsInvalidated`: Triggered by `PasswordChanged` — all sessions other than the originating one are revoked.
- `EmailChangeRequested`: A logged-in user requests an email change (US-AUT-07).
- `EmailChangeVerified`: User clicks the verification link at the new address; email swap is applied.
- `EmailChangeReverted`: The previous address holder reverts the change within 48 hours.
- `AccountDeletionScheduled`: A user requests data wipe with the default 48h delay.
- `AccountDeletionCancelled`: A user logs in during the 48h window and cancels.
- `AccountDeleted`: The deletion executes — user record and tracker/order data removed (audit-log identity references preserved).

## Invariants
- `invite.expiresAt == invite.createdAt + 72h`
- `passwordResetToken.expiresAt == passwordResetToken.createdAt + 1h`
- `emailChangeRequest.expiresAt == emailChangeRequest.createdAt + 24h`
- `session.expiresAt <= session.createdAt + 30d`
