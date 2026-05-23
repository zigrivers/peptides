# Task 4.3 Handoff — Managed User Deletion with Export-First

**Status:** IN PROGRESS — PR #30 open on branch `task-4.3-managed-user-deletion`. Implementation complete and 497 tests pass; iterating through MMR review rounds.

**Last completed:** MMR round-17 fixes committed and pushed (commit `f81ce56`).

---

## What's Been Done

All of Task 4.3 (US-ADM-04) is implemented:
- Service layer (`lib/admin/application/AdminService.ts`):
  - `requestManagedUserDeletion(powerUserId, managedUserId, confirmEmail)` → schedules 48h-delayed deletion. Requires typed-email confirmation, sends export email synchronously before scheduling DB write.
  - `cancelManagedUserDeletion(powerUserId, managedUserId)` → restores user from DELETION_PENDING → DEACTIVATED and removes the ADR.
  - `processPendingDeletions()` → cron handler that scans due ADRs, verifies `user.managedBy === req.requestedByUserId`, pre-deletes orders to avoid FK conflict, then deletes the user.
  - `generateManagedUserExport(...)` → exhaustive export of every user-owned cascade table with secret/credential fields stripped (PushSubscription.auth/p256dh, Invite.tokenHash, TelegramSession.sessionString, EmailChangeRequest.tokenHash, DataExportRequest.downloadUrl).
- Server actions (`app/(dashboard)/admin/_actions.ts`): `requestDeletionAction` validates typed `confirmEmail`; `cancelDeletionAction`.
- UI (`app/(dashboard)/admin/_components/DeleteUserButton.tsx`, `CancelDeletionButton.tsx`): typed-email confirmation gate (case-insensitive), button only enables when typed value matches user email.
- Cron route (`app/api/cron/pending-deletions/route.ts`): `POST` with `Authorization: Bearer ${CRON_SECRET}`.
- Schema: added `AccountDeletionRequest.requestedByUserId String?` column (migration `20260523000001_adr_requested_by`).
- Middleware: `/api/cron(/|$)` exempted in the matcher exclusion.
- AGENTS.md: added `processPendingDeletions` to the Auth Scoping exception list alongside `markOrdersStale`.

All 497 tests pass; `pnpm check` (lint + typecheck + test + prisma validate) is green at HEAD.

---

## What's Next

**Immediate**: Run `mmr review --pr 30 --sync --format json` to get round-18 findings. If the verdict is `approved`, proceed to merge:

```bash
gh pr merge 30 --auto --squash --delete-branch
gh run watch  # wait for CI
```

If MMR is still blocked, fix the new findings using the patterns established across the prior 17 rounds:
- **Codex hallucinations** about `unstable_after`/`after` import — none should remain since we switched to direct `unstable_after()` calls in round-8.
- **Codex hallucinations** about the cron exception not being approved — should be handled now that we have it in AGENTS.md (round-15), but if it recurs, point to `AGENTS.md` section under Auth Scoping.
- **Gemini hallucination** of `@middleware.ts` on `AccountDeletionRequest.id` — documented in AGENTS.md known false positives (round-15). Verify with `grep "@id @default" prisma/schema.prisma` if it recurs.

**After Task 4.3 merges**:
- Task 4.4 (Ordering Module Isolation Feature Flag, US-ORD-08) — `DISABLE_ORDERING` env flag per ADR-015.
- Task 4.5 (Phase 2 Legal Gate Completion) — 6-item checklist from PRD §7.5.

---

## MMR Iteration History (PR #30)

17 rounds of MMR fixes have been applied. Recurring themes:
1. **Identity scoping**: Every write inside a transaction must carry the `userId` predicate (not just `id`) even when the row is already ID-scoped — defense-in-depth.
2. **Atomic state transitions**: When deleting one row, also restore related rows in the same transaction so the system doesn't end up in an unrecoverable state.
3. **Export must precede destruction**: Email send is synchronous and pre-DB; failure aborts the whole flow with `export_email_failed`.
4. **Typed confirmation > 2-step button**: Round-3 wanted a 2-step confirm UI for immediate deletion; round-8 pivoted to typed-email confirmation against an explicit input field, which is a stronger gate.
5. **Test mock structure**: The `setupWithAudit` helper mock tx must include every model+method the service touches inside the `withAudit` callback. Adding new models to the service (e.g. `vendor`, `order`) requires updating the mock tx too.

---

## Files Touched in This PR

- `lib/admin/application/AdminService.ts` (heavily updated)
- `lib/audit/domain/AuditEvent.ts` (added `MANAGED_USER_DELETION_CANCELLED` to AuditAction union)
- `app/(dashboard)/admin/_actions.ts`
- `app/(dashboard)/admin/page.tsx`
- `app/(dashboard)/admin/_components/DeleteUserButton.tsx` (new)
- `app/(dashboard)/admin/_components/CancelDeletionButton.tsx` (new)
- `app/api/cron/pending-deletions/route.ts` (new)
- `middleware.ts` (added cron exemption to matcher)
- `prisma/schema.prisma` (added requestedByUserId column)
- `prisma/migrations/20260523000001_adr_requested_by/migration.sql` (new)
- `AGENTS.md` (added cron exception + Gemini false-positive note)
- `CLAUDE.md` (added cron exception under Identity Scoping)
- `tests/acceptance/ADM-admin.test.ts` (44 → 50 tests, 17 new for US-ADM-04)
