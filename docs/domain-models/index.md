# Domain Models Overview

This directory contains the domain models for the Peptides application, organized by pillar and bounded context.

## Bounded Contexts

| Context | Description | Key Aggregates |
|---------|-------------|----------------|
| **Reference** | Static compound knowledge and research data. | `Compound` |
| **Tracker** | Dosing schedules, logs, and subjective outcomes. | `Cycle`, `Protocol` |
| **Reconstitution** | Vial inventory and math calculations. | `Vial` |
| **Ordering** | Vendor products and Telegram order transactions. | `Order`, `Vendor` |
| **Auth** | User accounts, sessions, and multi-user logic. | `User` |
| **Audit** | Immutable system-wide record of sensitive mutations. | `AuditEvent` |

## Context Map (High Level)

- **Auth** provides the identity foundation for all other contexts (via `userId`).
- **Audit** listens to events from all other domains to persist the audit trail.
- **Tracker** references **Reference** (via `compoundId`) for dosing ranges and safety data.
- **Tracker** references **Reconstitution** (via `vialId`) for inventory decrementing.
- **Reconstitution** references **Reference** (via `compoundId`) for concentration calculations.
- **Reconstitution** references **Ordering** (via `orderId`) for inventory updates on receipt.
- **Ordering** references **Reference** (via `compoundId`) for catalog product linking.

## Domain Model Files
- [Reference Domain](reference.md)
- [Tracker Domain](tracker.md)
- [Reconstitution Domain](reconstitution.md)
- [Ordering Domain](ordering.md)
- [Auth Domain](auth.md)
