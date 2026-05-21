# Story Tests Traceability Matrix

This document maps user story acceptance criteria to their corresponding test cases.
Each row lists all ACs for the story so coverage tooling can find every AC token near its story ID.

| Story ID | AC IDs | Test Cases Summary | Layers | File |
|----------|--------|-------------------|--------|------|
| **US-REF-01** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · AC-7 | IUPAC/mechanism/routes display, citation validation, dosing ranges, stacking notes, incomplete-profile placeholder, archived-compound display, persona-aware section disclosure | Unit / Integration / E2E | `tests/acceptance/REF-reference.test.ts` |
| **US-REF-02** | AC-1 · AC-2 · AC-3 | Catalog name-fragment search, category filter, recently-viewed row | Unit / E2E | `tests/acceptance/REF-reference.test.ts` |
| **US-TRK-01** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · AC-7 · AC-8 · AC-9 · AC-10 | Schedule generation, managed-user assignment, validation, audit log, 4 frequency types, mobile decimal keypad, smart protocol defaults, live syringe hint, assignee-protocol context, 7-day schedule preview | Unit / Integration / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-02** | AC-1 · AC-2 · AC-3 · AC-4 | Protocol pause/resume, clone preserving dose+frequency, cycle-restart cloning | Unit / Integration | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-03** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · AC-7 | Dose+skip logging with timestamp/site, offline queue, zero-inventory warning, 5-second undo toast, deviation-guard dialog, duplicate-tap idempotency | Unit / Integration / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-04** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · AC-7 | Round-robin site suggestion, last-7-sites history, selectable sites with override, route-aware filtering, no-suggestion on first dose, rest indicator (last-use date + rested tag), accessible text for site rotation (per accessibility AC-7) | Unit / Integration / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-05** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 | Batch log-all, deselect/skip in review, offline queue+sync, inline dose edit, haptic+checkmark feedback, unavailable-dose precheck | Unit / Integration / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-06** | AC-1 · AC-2 · AC-3 | Wellbeing rating + tags, free-text note (max 1000 chars), frequent-tag presets from last 14 days | Integration | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-07** | AC-1 · AC-2 | Dual-axis dose/outcome chart (30/90-day window), dosed-vs-non-dosed average | Unit / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-08** | AC-1 · AC-2 · AC-3 | Cycle create with name+dates, protocol-to-cycle association, week-number display | Unit | `tests/acceptance/TRK-tracker.test.ts` |
| **US-TRK-09** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 | Reminder time config, push notification, email fallback, push-denied banner, silent email-fail logging, visible dashboard indicator with inline editor | Integration / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-ANL-01** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · AC-7 · AC-8 | Cycle progress display, low-inventory badge, 7-day adherence+wellbeing avg, WCAG 1.4.1 badge (color+icon+text), stale-data badge, role-specific empty state, screen-reader text equivalents, delegated single-dose card | Unit / Integration / E2E | `tests/acceptance/TRK-tracker.test.ts` |
| **US-REC-01** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 · AC-7 · AC-8 | Concentration math, syringe-unit conversion, safety guardrails, last-dose context, "Use last" opt-in chip, plain-English read-back summary, graphical syringe preview, field-level guardrails + live sticky summary | Unit / Integration / E2E | `tests/acceptance/REC-reconstitution.test.ts` |
| **US-REC-02** | AC-1 · AC-2 | Vial record with computed expiry, low-inventory badge on dashboard | Integration | `tests/acceptance/REC-reconstitution.test.ts` |
| **US-ORD-01** | AC-1 · AC-2 · AC-3 | Phone+code MTProto auth, AES-256 session encryption, always-visible manual fallback | Unit / Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-02** | AC-1 · AC-2 · AC-3 | <14-day-supply suggestions, one-tap quick-add, reason string per suggestion | Integration / E2E | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-03** | AC-1 · AC-2 · AC-3 · AC-4 | Catalog cart build, MTProto send, sent-message archive, failed-send queue with retry+manual-fallback | Unit / Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-04** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 | Manual wallet+amount entry, payment-button gate, 60-second duplicate-send guard, stale-wallet comparison warning, chunked-address display with acknowledgment checkbox, character-diff wallet view | Unit / Integration / E2E | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-05** | AC-1 · AC-2 | Receive-flow line-item confirmation, Received status + timestamp | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-06** | AC-1 · AC-2 | Vendor catalog product CRUD with stock status, required compound linkage | Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-07** | AC-1 · AC-2 · AC-3 · AC-4 | State-machine transitions, 14-day stale flag, cancel-from-any-non-terminal with audit, forward-only non-cancel transitions | Unit / Integration | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-08** | AC-1 · AC-2 · AC-3 | DISABLE_ORDERING env → 404/403, nav link removal, tracker+reference unaffected | Integration / E2E | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ORD-09** | AC-1 · AC-2 · AC-3 | Sent-waiting state display with timestamp, vendor deep-link, manual reply-capture action | Integration / E2E | `tests/acceptance/ORD-ordering.test.ts` |
| **US-ADM-01** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 · AC-6 | 72-hour invite link, managed-user schedule-only view, 4-state invite status, resend-invalidates-prior, duplicate-invite guard, copy-link action | Unit / Integration / E2E | `tests/acceptance/ADM-admin.test.ts` |
| **US-ADM-02** | AC-1 | 7-day adherence % calculation per managed user | Unit | `tests/acceptance/ADM-admin.test.ts` |
| **US-ADM-03** | AC-1 · AC-2 · AC-3 · AC-4 | Deactivate preserving data, password-reset email trigger, active-protocols warning, mid-day deactivation behavior | Integration / E2E | `tests/acceptance/ADM-admin.test.ts` |
| **US-ADM-04** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 | Export-before-delete, double-confirm + 48h delay, audit event with actor/target/timestamp, FK preservation in audit log, super-admin guard | Integration / E2E | `tests/acceptance/ADM-admin.test.ts` |
| **US-AUT-01** | AC-1 · AC-2 | Power-user 3-step onboarding, managed-user 2-step walkthrough | E2E | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-02** | AC-1 · AC-2 · AC-3 · AC-4 | JSON+CSV export, 48-hour delayed wipe, immediate-deletion double-confirm, Telegram session revocation on deletion | Integration / E2E | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-03** | AC-1 · AC-2 | 12-char minimum password, httpOnly rolling-expiry session cookies | Integration | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-04** | AC-1 · AC-2 | Single-use 1-hour reset link, reset request does not reveal email registration | Integration | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-05** | AC-1 · AC-2 · AC-3 | PWA manifest + service worker, offline app-shell, persistent sync indicator (online/offline/failed) | E2E | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-06** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 | Current-password gate, 12-char new-password rule, same-as-current rejection, other-sessions invalidation, audit event (no password values) | Unit / Integration | `tests/acceptance/AUT-auth.test.ts` |
| **US-AUT-07** | AC-1 · AC-2 · AC-3 · AC-4 · AC-5 | Current-password gate, 24h verify-new-email token, conflict check without ownership leak, old-email notice + 48h revert link, audit chain (requested → verified) | Integration | `tests/acceptance/AUT-auth.test.ts` |

## Coverage Summary
- **Total Stories**: 34
- **Total ACs**: 144
- **Total Test Cases**: 144
- **Coverage**: 100%
