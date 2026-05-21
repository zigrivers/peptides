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

## Web Push for Dose Reminders

Per US-TRK-09 and PRD §5.2.7, dose reminders are delivered preferentially via Web Push, with email fallback. This is in scope of the PWA decision because the service worker is the host of the push subscription.

- **Subscription**: Once the PWA is installed and the user grants notification permission, the service worker registers a Web Push subscription via the Push API. The endpoint, `auth`, and `p256dh` keys are stored against the `ReminderPreference` entity (per `docs/domain-models/tracker.md`).
- **Dispatch**: The scheduled reminder job (per ADR-012) calls the Web Push protocol with VAPID keys. Delivery failures fall back to the email channel (per ADR-011) automatically.
- **Permission state tracking**: We persist `pushPermissionState` (Granted / Denied / NotPrompted) so the reminder settings UI can render the right CTA without re-prompting on every page load.
- **iOS Safari constraint**: iOS Safari only supports Web Push when the app is installed to the home screen (not in browser tabs). The reminder settings UI surfaces the "install to home screen" prompt as a prerequisite for push on iOS, with email as the universal fallback.

VAPID key pair lives as `WEB_PUSH_PUBLIC_KEY` + `WEB_PUSH_PRIVATE_KEY` env vars, not in the database.

## Consequences
- **Benefits**: Home screen installation; offline dose logging with Background Sync; fast app shell loading via service worker cache. Web Push is "free" once PWA install is done — no separate native push infrastructure.
- **Costs**: Service worker complexity; IndexedDB management for the offline queue; potential sync conflicts (mitigated by idempotency keys). Web Push has uneven cross-browser support (especially iOS Safari pre-install) — the email fallback is mandatory, not optional.

## Traces
- PRD §5.2.7 (Dose Reminders), §8.6 (PWA requirements)
- Stories: US-AUT-05 (PWA + Offline), US-TRK-09 (Dose Reminders)
- Domain model: `ReminderPreference` in `docs/domain-models/tracker.md`
- ADR-011 (Resend — email fallback), ADR-012 (Railway Cron — runs the reminder job)
