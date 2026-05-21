# Validation: Implementability Dry-Run

**Date:** 2026-05-20 (re-review, auto-fix batch)
**Methodology:** deep | Depth: 5/5
**Status:** REVIEWED — dry-ran 3 representative tasks against the full spec set; 2 implementability gaps found and fixed inline; Full Pass

---

## 1. Method

Pick 3 representative tasks from `docs/implementation-plan.md` and dry-run them: pretend to be the implementing agent and verify that EVERY decision needed to write the code is documented somewhere in the spec set. Track any decision that would force the implementer to either (a) stop and ask the user, or (b) invent something not in the specs.

Tasks chosen for the dry-run:
- **Task 1.4** Password Lifecycle (touches: auth, audit, email, security, testing) — multi-layer
- **Task 3.5** Payment Safety Gate (touches: UX hard gate, API contract, security, ordering domain, idempotency) — highest-stakes
- **Task 5.2** Reminder Dispatch Cron (touches: cron, push, email, timezone, fallback policy, multi-channel failure modes)

---

## 2. Dry-Run: Task 1.4 — Password Lifecycle (Reset + Change-Own)

**Agent question 1**: Where is the password-reset token stored?
→ Answered by `prisma/schema.prisma` PasswordResetToken model (tokenHash, expiresAt, used boolean).

**Agent question 2**: What's the token expiry?
→ Answered by `docs/domain-models/auth.md` invariant `passwordResetToken.expiresAt == passwordResetToken.createdAt + 1h`.

**Agent question 3**: Is the token returned to the user in the response, or only emailed?
→ Answered by `docs/api-contracts.md` §2.2: reset-request always returns 204 (no enumeration); token is in the email link only.

**Agent question 4**: What bcrypt cost should I use?
→ Answered: ADR-004 + tech-stack §5.1 + PRD §8.2 all say ≥ 12.

**Agent question 5**: For change-own-password, which sessions get revoked?
→ Answered by domain/auth.md events + plan §2 Task 1.4 + security §3.2: all sessions EXCEPT the current one (`OTHER_SESSIONS_INVALIDATED` event); detected via `Session.id == currentSession.id` comparison.

**Agent question 6**: What error message should I show when the current-password check fails?
→ Answered by api-contracts.md §8 + security §3.2: code `current_password_invalid` returned for BOTH wrong-current AND any new-password-invalid case where current is wrong (field-leak prevention). UI maps to "Current password is incorrect" under the Current Password field.

**Agent question 7**: How should I test this?
→ Answered by `docs/tdd-standards.md` §9.3 (Session Invalidation on Password Change) + §8 invariant matrix entries.

**Agent question 8**: Which audit events?
→ Answered by `docs/domain-models/audit.md` canonical action vocabulary: `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_CHANGED`, `OTHER_SESSIONS_INVALIDATED`.

**Verdict**: PASS — implementer can write the code without stopping to ask. Every decision is sourced.

---

## 3. Dry-Run: Task 3.5 — Payment Safety Gate + Receiving

**Agent question 1**: What exactly counts as "the user acknowledged the payment"?
→ Answered by api-contracts.md §5.3 mark-paid endpoint: `acknowledged: true` MUST be in the request body; UI must have displayed wallet + amount before the user could submit; server records `paymentConfirmation.acknowledgedAt` + `acknowledgedByUserId`.

**Agent question 2**: What if the user double-clicks the send button or the network retries?
→ Answered by api-contracts.md §5.3: 60s duplicate-send protection returns `possible_duplicate_send` 409 + requires `force: true` to retry. Domain `Order.idempotencyKey @unique` enforces persistence-level dedupe.

**Agent question 3**: Where does the "stale wallet" comparison come from?
→ Answered by US-ORD-04 AC 4 + UX §2.2 step 1: query the user's most recent prior Order to the same Vendor; display its `paymentConfirmation.walletAddress` as a "compare with prior" reference; UI must NOT auto-populate the input from this value.

**Agent question 4**: What's the state machine?
→ Answered by domain/ordering.md Order aggregate + schema enum + api §5.3: Draft → Sent → Confirmed → PaymentSent → Received | Cancelled | Stale. Forward-only except Cancel.

**Agent question 5**: Can a user cancel after Mark-Paid?
→ Answered by US-ORD-07 AC 3 + domain invariant: Cancel from ANY non-terminal status, including PaymentSent if the vendor didn't deliver. The Order moves to Cancelled (terminal) with `cancelledAt` + `cancelledByUserId`.

**Agent question 6**: How does receiving create vials?
→ Answered by api §5.3 mark-received + domain Vial.orderItemId + plan task 3.5 AC: one Vial per OrderItem, linked via `orderItemId` FK; user can optionally provide `bacWaterMl` + `reconstitutedAt` at receive time, or defer to first reconstitution.

**Agent question 7**: What if the vendor changed the price after sending?
→ Answered by PRD §5.4.4 error scenarios: "Vendor changes quoted price after order sent → user enters the new total at payment confirmation time; no lock on the amount at 'order sent' time."

**Agent question 8**: How do I test the hard gate?
→ Answered by tdd-standards.md §8 invariant matrix: "Payment confirmation safety gate (wallet + amount + acknowledged) — E2E `tests/e2e/ordering-payment.spec.ts`". Plus 60s duplicate-send Integration test.

**Verdict**: PASS — every implementer question has a clean answer in the spec set.

**One gap found**: the api `mark-paid` endpoint receives `acknowledged: true` from the client, but the implementer might wonder: "could a malicious client send `acknowledged: true` without actually showing the wallet+amount to the user?" The answer is "yes, but the server can't verify UI display; the client-side gate is best-effort. The server-side checks (idempotency, wallet-non-empty, amount-non-zero) are the enforcement layer." This isn't a spec gap, but it's not explicit in any one document.

**Fix N1**: Added a clarifying note to `docs/security-review.md` §2 STRIDE row 14 (UI replay attack on payment confirmation) — the server-side cannot verify UI display, but the application-level idempotency + the user-must-have-entered-wallet-address-themselves invariants make a UI-bypass attack a "user attacks themselves" scenario.

---

## 4. Dry-Run: Task 5.2 — Reminder Dispatch Cron (15-minute tick)

**Agent question 1**: What's the cron expression?
→ Answered by ADR-012 + architecture §6 + operations §3.3: every 15 minutes; Railway Cron schedule string `*/15 * * * *`.

**Agent question 2**: How do I find users due for a reminder in this 15-min window?
→ Answered by architecture §3.7 + tdd §9.8: query `ReminderPreference WHERE enabled = true` and compute `userLocalNow = nowUTC converted to user.timezone`; resolve users where `dailyReminderTime ∈ [userLocalNow - 15min, userLocalNow]`.

**Agent question 3**: Which user.timezone do I use? Stored where?
→ Answered by schema: `ReminderPreference.timezone` (IANA string).

**Agent question 4**: What if push permission is granted but the subscription expired?
→ Answered by ux §3.8 PushSubscriptionStatus + plan task 5.1 + security §3.5: send fails → fall back to email; subsequent reminder attempt sets `pushPermissionState = NotPrompted` and prompts re-subscribe on next app open.

**Agent question 5**: What if email also fails?
→ Answered by US-TRK-09 AC 5 + operations §4.1 Resend playbook: log `REMINDER_DELIVERY_FAILED` audit event; do NOT retry; do NOT surface a user-facing error (silent fail-soft).

**Agent question 6**: What about iOS Safari?
→ Answered by ADR-007 + platform-parity-review §2.1: Web Push only works if installed-to-home-screen on iOS 16.4+. If not installed: email-only.

**Agent question 7**: How do I authenticate the cron call?
→ Answered by api-contracts.md §7 + operations §3.3: `Authorization: Bearer ${CRON_SECRET}` header; non-matching → 401.

**Agent question 8**: How do I prevent back-fill of missed ticks?
→ Answered by operations §4.1 cron-missed playbook: "DO NOT back-fill the missed reminders; the next tick (within 15 min) will catch any user whose reminder is still pending."

**Agent question 9**: What happens at DST boundaries?
→ Answered by tdd §9.1 timezone-aware tracker tests + tdd §9.8 reminder dispatch tests: timezone resolution via IANA zone names handles DST correctly; explicit test for `America/Denver` spring-forward case.

**Verdict**: PASS with one gap.

**Gap found**: the implementer might ask "is the 15-min window inclusive or exclusive of the boundaries?" — and "what about a user whose reminderTime is exactly at minute 00, when we just transitioned past it?" Not explicitly specified.

**Fix N2**: Added a clarifying note to `docs/operations-runbook.md` §3.3 dose-reminder row: "Window is `[userLocalNow - 15min, userLocalNow)` — half-open interval, prevents duplicate dispatch on adjacent ticks."

---

## 5. Findings Summary

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P3 | Spec set didn't explicitly state that the server cannot verify UI display of the payment safety gate (only enforces server-side invariants). | Added clarifying note to security §2 STRIDE row 14 commentary. |
| N2 | P3 | Spec set didn't specify whether the 15-min reminder-dispatch window is inclusive/exclusive at the boundaries — risks duplicate dispatch on adjacent ticks. | Added "half-open `[userLocalNow - 15min, userLocalNow)`" note to operations §3.3 dose-reminder row. |

### Regressions detected

None.

### Gate result

- **Gate**: **Full Pass**
- **3 representative tasks dry-ran end-to-end**
- **Implementer would NOT need to stop and ask for any major decision**
- **Re-trigger conditions**: any new feature added to the implementation plan should be dry-run before being marked ready.

---

## 6. Cross-References

- Implementation plan: `docs/implementation-plan.md`.
- Critical-path walkthrough: `docs/validation/critical-path-walkthrough.md` (covers journey-level).
- This audit: `docs/validation/implementability-dry-run.md` (covers task-level).
