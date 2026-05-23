# Task 4.3 Handoff — Managed User Deletion with Export-First

**Status:** ✅ COMPLETE — PR #30 merged into `main` on 2026-05-23 (commit `3e927bd`). Follow-up PR #31 (Resend lazy-init) merged into `main` (commit `93af904`). CI is green.

---

## Outcome

Task 4.3 (US-ADM-04) shipped end-to-end after **18 MMR rounds**. All 497 acceptance tests pass, `pnpm check` is green, and CI on `main` is green at HEAD.

### What's in production

- **Service layer** (`lib/admin/application/AdminService.ts`):
  - `requestManagedUserDeletion(powerUserId, managedUserId, confirmEmail)` — requires typed-email confirmation (case-insensitive trim), generates exhaustive export, sends export email synchronously (aborts on Resend failure with `export_email_failed`), then schedules 48h delayed deletion. Status flow: DEACTIVATED → DELETION_PENDING. Records `requestedByUserId` on the ADR row.
  - `cancelManagedUserDeletion(powerUserId, managedUserId)` — restores DELETION_PENDING → DEACTIVATED atomically (updateMany scoped with `managedBy + status` predicate, then deleteMany on ADR scoped with `id + userId + status`).
  - `processPendingDeletions()` — cron handler. Scans due ADRs, verifies `user.managedBy === req.requestedByUserId`, atomically deletes ADR + restores user to DEACTIVATED for stale/mismatched rows (no infinite retry), or pre-deletes user-scoped orders (defense against `Order.vendorId` FK restrict) then deletes the user. Audit `actorUserId: 'SYSTEM'` with `originalRequestor` in metadata.
  - `generateManagedUserExport(...)` — covers all user-owned cascade tables (Protocol, Cycle, DoseLog, OutcomeLog + protocolRatings, Vial, Vendor + products + nested orders + items, Order (top-level backstop), ReminderPreference, PushSubscription, TelegramSession, EmailChangeRequest, DataExportRequest, sent Invites, original Invite + full AuditEvent history). Secret fields stripped via explicit `select` allowlists (PushSubscription.auth/p256dh, Invite.tokenHash, TelegramSession.sessionString, EmailChangeRequest.tokenHash, DataExportRequest.downloadUrl).
- **Server actions** (`app/(dashboard)/admin/_actions.ts`): `requestDeletionAction` validates typed `confirmEmail`; `cancelDeletionAction`.
- **UI components**:
  - `DeleteUserButton.tsx` — typed-email confirmation gate; submit button disabled until typed value matches user email (case-insensitive trim).
  - `CancelDeletionButton.tsx` — visible while user is DELETION_PENDING.
- **Cron route** (`app/api/cron/pending-deletions/route.ts`): `POST` with `Authorization: Bearer ${CRON_SECRET}`. Middleware exempts `/api/cron(/|$)` so the in-route bearer check is the sole gate.
- **Schema**: `AccountDeletionRequest.requestedByUserId String?` (migration `20260523000001_adr_requested_by`).
- **Documentation**:
  - `CLAUDE.md` and `AGENTS.md` both list `processPendingDeletions` as an approved Identity Scoping / Auth Scoping exception.
  - `AGENTS.md` known-false-positives section updated for the recurring `@middleware.ts` Gemini hallucination on `AccountDeletionRequest.id`.

### Follow-up build fix (PR #31)

`Resend` was instantiated at module load time, which threw `Missing API key` during Next.js build-time page data collection when `RESEND_API_KEY` wasn't in the build env. Task 4.2 silently broke CI in the same way; Task 4.3 inherited the broken state. Resolved by wrapping `Resend` in a lazy `Proxy` (`lib/shared/email.ts`).

---

## What's Next

Wave 4 status:
- **Task 4.4** (Ordering Module Isolation Feature Flag — US-ORD-08) — merged via PR #33 (commit `235992e`). Plan: `plans/2026-05-23-task-4.4-ordering-feature-flag.md`.
- **Task 4.5** (Phase 2 Legal Gate Completion) — self-review documented in `docs/decisions/phase-2-legal-gate.md`. Outcome: **CONDITIONAL — BLOCKED**. Items 2/4/5/6 pass, but items 1 and 3 cannot honestly pass yet:
  - Item 1 (managed-user click-through acknowledgment): the `/accept-invite` route + `acceptInvite` server action don't exist. Per AGENTS.md known-design-decisions, the acceptance page was intentionally deferred. Remediation: **Task 1.6c** (added to `docs/implementation-plan.md`).
  - Item 3 (data export on demand): the deletion-time export is comprehensive, but standalone on-demand export requires **Task 6.2** (Async Data Export Pipeline, already on plan).

**Phase 2 ship is gated on Task 1.6c and Task 6.2 merging.** Wave 5 implementation can proceed in parallel (it doesn't depend on Phase 2 entry), but no managed user beyond the Power User's own household should be invited until both blockers clear and the legal gate is re-reviewed.

Next deliverables (in dependency order):

### Task 1.6c — Accept Invite Flow (NEW — gating Phase 2 entry)
- **File:** `docs/implementation-plan.md` (added under Wave 1 as Task 1.6c)
- **Description:** ship `/accept-invite` page + `acceptInvite` server action so invitees can click through the consent copy, create their managed-user account, and have the `INVITE_ACCEPTED` audit written. Resolves Phase 2 Legal Gate item 1.

### Task 5.1 — Reminder Preferences + Web Push Subscription
- **File:** `docs/implementation-plan.md` line 227

### Task 5.2 — Reminder Dispatch Cron (15-minute tick)
### Task 5.3 — Subjective Outcomes + Correlation Timeline
### Task 5.4 — AI Layer (Vercel AI SDK + Anthropic + Gemini fallback)

### Task 6.2 — Async Data Export Pipeline (also gating Phase 2 entry)

---

## MMR Iteration Summary

PR #30 went through 18 rounds. Recurring patterns worth carrying forward:

1. **Defense-in-depth scoping**: Every write inside a transaction carries `userId` even when the row is already ID-scoped.
2. **Atomic state transitions**: When cleaning up a stale row, restore related state in the same `$transaction` (don't leave an account "stuck").
3. **Export-before-destruction**: Email send is synchronous and pre-DB; failure aborts the whole flow.
4. **Typed-confirmation > 2-step buttons**: Round-3 wanted a 2-step UI for immediate deletion; round-8 pivoted to typed-email confirmation, which is a stronger gate and simpler code.
5. **Test mock structure**: `setupWithAudit` helper mock tx must include every model+method the service touches inside `withAudit` — adding new tables (e.g. `vendor`, `order`) requires updating the mock tx.
6. **`unstable_after` directly, not aliased**: `import { unstable_after as after }` confuses Gemini repeatedly. Call `unstable_after()` directly.
7. **Cron exceptions go in BOTH CLAUDE.md and AGENTS.md**: Codex reads AGENTS.md as the reviewer brief; CLAUDE.md alone doesn't suppress findings.
8. **Contradicting reviewer feedback is a signal to simplify**: When two reviewers disagree on whether a feature should exist (immediate vs scheduled deletion), the right move is usually to remove the contested path.
9. **`Resend` (and similar API clients) must be lazy-instantiated** — module-level construction with env-var arguments breaks Next.js page data collection in CI.

See `tasks/lessons.md` for the full lessons log.

---

## Verification

```bash
# Verify the merge:
gh pr view 30 --json state,mergedAt  # → {"state":"MERGED","mergedAt":"2026-05-23T12:26:17Z"}
gh pr view 31 --json state,mergedAt  # → {"state":"MERGED","mergedAt":"2026-05-23T12:32:..."}

# Verify CI is green:
gh run list --branch main --limit 2

# Verify local checks pass:
pnpm check
```
