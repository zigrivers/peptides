# Tracker Domain

The Tracker Domain manages user protocols, daily dosing logs, cycles, and subjective outcomes.

## Ubiquitous Language
- **Protocol**: A scheduled plan for a specific compound (e.g., "BPC-157 250mcg daily").
- **Dose Log**: A record of a completed or skipped dose event.
- **Cycle**: A logical grouping of protocols over a defined period.
- **Outcome Log**: A subjective rating of wellbeing and notes for a given day.
- **Injection Site**: The physiological location of an administration (e.g., "Left Abdomen").

## Entities

### Protocol (Aggregate Root)
A scheduled dosing plan.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `compoundId`: UUID (FK)
  - `cycleId`: UUID (FK, optional)
  - `dose`: DoseAmount (Value Object)
  - `schedule`: Schedule (Value Object)
  - `administrationRoute`: enum (SC, IM, Oral, Nasal)
  - `startDate`: date
  - `endDate`: date (optional)
  - `status`: enum (Active, Paused, Completed, Deactivated)
  - `notes`: text

### Cycle (Aggregate Root)
A logical container for one or more protocols.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `name`: string
  - `startDate`: date
  - `endDate`: date (optional)
  - `scheduledBreaks`: DateRange[] (optional)
  - `status`: enum (Active, Paused, Completed) — aligned with PRD §5.2.4

### Dose Log (Entity)
A record of a dose event.
- **Attributes**:
  - `id`: UUID
  - `protocolId`: UUID (FK)
  - `idempotencyKey`: string (UUID, unique per user-scheduledDate-protocolId)
  - `loggedAt`: timestamp
  - `scheduledDate`: date
  - `amount`: DoseAmount (Value Object)
  - `status`: enum (Logged, Skipped)
  - `injectionSite`: InjectionSite (Value Object)
  - `isBatchLog`: boolean
  - `loggedByUserId`: UUID (FK)

### OutcomeLog (Entity)
A subjective daily wellbeing rating with optional per-protocol detail.
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `scheduledDate`: date (one OutcomeLog per user per calendar day — uniqueness invariant)
  - `loggedAt`: timestamp
  - `overallRating`: number (1–5 integer)
  - `protocolRatings`: ProtocolRating[] (Value Object collection — optional per-protocol 1–5)
  - `tags`: enum[] (Energy, Sleep, Mood, Pain, Recovery, Libido, Cognition, …extensible)
  - `note`: text (max 1000 chars)

### ReminderPreference (Entity)
A per-user reminder configuration (PRD §5.2.7, US-TRK-09).
- **Attributes**:
  - `id`: UUID
  - `userId`: UUID (FK)
  - `dailyReminderTime`: time (user-local time-of-day; rendered against the browser timezone at delivery)
  - `pushSubscriptionEndpoint`: string (optional — Web Push API endpoint)
  - `pushSubscriptionAuth`: string (optional)
  - `pushSubscriptionP256dh`: string (optional)
  - `pushPermissionState`: enum (Granted, Denied, NotPrompted)
  - `emailFallbackEnabled`: boolean (default true)
  - `updatedAt`: timestamp

## Value Objects

### DoseAmount
- **Attributes**:
  - `value`: number (must use `Decimal` type for precision — never `Float`)
  - `unit`: enum (mcg, mg, IU, mL)

### Schedule
- **Attributes**:
  - `frequency`: enum (Daily, EOD, SpecificDaysOfWeek, CustomInterval)
  - `daysOfWeek`: enum[] (Mon, Tue, Wed, Thu, Fri, Sat, Sun) — required when frequency is SpecificDaysOfWeek
  - `intervalDays`: number — required when frequency is CustomInterval

### InjectionSite
- **Attributes**:
  - `location`: string (one of the 8 PRD-listed sites)
  - `group`: enum (Abdomen, Thigh, Deltoid, Glute)

### ProtocolRating
A subjective rating attached to a specific Protocol within an OutcomeLog.
- **Attributes**:
  - `protocolId`: UUID (FK)
  - `rating`: number (1–5 integer)

### DateRange
- **Attributes**:
  - `start`: date
  - `end`: date

## Domain Services

### SiteRotationPolicy
Calculates the next suggested injection site based on a user's `DoseLog` history for a specific route.
- **Rule**: Round-robin through available sites in the preferred group, filtered by the active route (subcutaneous/intramuscular).

## Aggregate: Dose Adherence
- **Consistency Boundary**: Protocol and its Dose Logs.
- **Root**: Protocol
- **Invariants**:
  - Cannot log a future dose.
  - Cannot edit a dose log past the same calendar day.
  - Deactivated protocols cannot accept new dose logs after the deactivation timestamp (in-flight log at deactivation time is the last-writer-wins exception).

## Aggregate: Daily Outcome
- **Consistency Boundary**: A single OutcomeLog and its ProtocolRatings.
- **Root**: OutcomeLog
- **Invariants**:
  - At most one OutcomeLog per `(userId, scheduledDate)`.

## Domain Events
- `ProtocolCreated`, `ProtocolUpdated`, `ProtocolPaused`, `ProtocolResumed`, `ProtocolCloned`, `ProtocolDeactivated`.
- `CycleCreated`, `CycleUpdated`, `CycleRestarted`.
- `DoseLogged`: A user confirms a dose.
- `DoseSkipped`: A user explicitly skips a dose.
- `DoseBatchLogged`: Multiple doses logged via the "Log All Scheduled" batch action.
- `InjectionSiteSuggested`: The rotation policy produces a new suggestion.
- `OutcomeLogged`: A user records a daily wellbeing rating.
- `ReminderSent`: A reminder was successfully dispatched (push or email).
- `ReminderDeliveryFailed`: A reminder delivery failed (logged; not retried).

## Invariants
- `dose.value > 0`
- `cycle.startDate <= cycle.endDate` (if exists)
- `outcomeLog.overallRating` in [1, 5]
