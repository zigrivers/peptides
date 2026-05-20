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

## Value Objects

### PasswordHash
Securely hashed password.
- **Attributes**:
  - `hash`: string
  - `algorithm`: string (bcrypt)
  - `cost`: number (default 12)

## Aggregate: Account Identity
- **Consistency Boundary**: A User and their auth-related state (tokens, sessions).
- **Root**: User
- **Invariants**:
  - Password hash must use bcrypt with cost >= 12.
  - Deleting a Power User requires all linked Managed Users to be deactivated first.

## Domain Events
- `UserRegistered`: A new Power User signs up.
- `UserInvited`: A Power User sends an invite.
- `InviteAccepted`: A Managed User completes registration.
- `AccountDeletionScheduled`: A user requests data wipe.

## Invariants
- `invite.expiresAt == invite.createdAt + 72h`
- `passwordResetToken.expiresAt == passwordResetToken.createdAt + 1h`
