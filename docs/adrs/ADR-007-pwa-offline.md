# ADR-007: Implement PWA with Serwist for Offline Dose Logging

## Status
Accepted

## Context
The "7:00 AM routine" often takes place when users have poor or no internet connectivity (e.g., in a basement gym or traveling). Dose logging must work offline to ensure accuracy and user retention.

## Decision
We will implement the application as a Progressive Web App (PWA) using Serwist to manage the service worker and offline queuing.

## Alternatives Considered
- **next-pwa**: Unmaintained since 2022; Serwist is its active successor.
- **Pure Web App (Online Only)**: Violates the core "7am routine" requirement and MoSCoW "Must Have" status for offline logging.
- **Native Mobile App**: Higher development cost; rejected by App Store policies for grey-market ordering features.

## Consequences
- **Benefits**: Home screen installation; offline dose logging with Background Sync; fast app shell loading via service worker cache.
- **Costs**: Service worker complexity; IndexedDB management for the offline queue; potential sync conflicts (mitigated by idempotency keys).
