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
  - `status`: enum (Active, Completed, Archived)

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

## Value Objects

### DoseAmount
- **Attributes**:
  - `value`: number
  - `unit`: enum (mcg, mg, IU, mL)

### Schedule
- **Attributes**:
  - `frequency`: enum (Daily, EOD, MWF, CustomInterval)
  - `intervalDays`: number (optional)

### InjectionSite
- **Attributes**:
  - `location`: string (e.g., "Left Abdomen")
  - `group`: enum (Abdomen, Thigh, Deltoid, Glute)

## Domain Services

### SiteRotationPolicy
Calculates the next suggested injection site based on a user's `DoseLog` history for a specific route.
- **Rule**: Round-robin through available sites in the preferred group.

## Aggregate: Dose Adherence
- **Consistency Boundary**: Protocol and its Dose Logs.
- **Root**: Protocol
- **Invariants**:
  - Cannot log a future dose.
  - Cannot edit a dose log past the same calendar day.

## Domain Events
- `DoseLogged`: A user confirms a dose.
- `DoseSkipped`: A user explicitly skips a dose.
- `InjectionSiteSuggested`: The rotation policy produces a new suggestion.

## Invariants
- `dose.value > 0`
- `cycle.startDate <= cycle.endDate` (if exists)
