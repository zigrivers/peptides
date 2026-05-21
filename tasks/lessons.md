# Project Lessons

This file tracks architectural and process learnings for future agents. Append a dated section after every PR that surfaced a non-obvious lesson worth carrying forward. Keep entries terse — one or two sentences each; link to the related ADR, PR, or incident.

## 2026-05-20

- **Precision**: Math must use `Decimal` (per `.claude/rules/safety-math.md`); floating point leads to rounding errors in dose calculations. Vitest config enforces 100% branch coverage on `lib/reconstitution` and `lib/audit`.
- **Session Persistence**: Always-on containers (Railway) are required for stable MTProto sessions — serverless does not work for this app (ADR-006). Cron jobs run on Railway Cron (ADR-012).
- **Audit immutability**: Hard gate for immutable audit logs on all protocol mutations, order events, and admin actions. `actor_user_id` and `subject_user_id` are intentionally non-FK historical references that survive user deletion (ADR-009).
- **Resolution-log discipline**: A repeated finding during the 2026-05-20 review batch was prior reviews marking findings as RESOLVED when the actual artifact had not been updated. Future review work must verify the artifact state matches the resolution-log entry before closing.

## 2026-05-21 (Task 1.6b)

- **Next.js App Router cache invalidation**: After a Server Action mutates state that affects an RSC page, call `revalidatePath('/target-path')` in the action — otherwise users can see stale RSC-rendered content until a hard refresh.
- **UX spec is the authoritative source for dismiss behavior**: If the spec says a component "persists until X", don't add a dismiss button without re-reading the spec. A dismiss button on the GettingStartedChecklist contradicted "persists until 100% complete" — three MMR channels flagged the resulting dead loop.
- **`next/cache` must be mocked in vitest tests**: Importing `revalidatePath` from `next/cache` in a Server Action will cause tests to throw `system_error` unless `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` is added.

## 2026-05-21 (Task 2.1)

- **Global reference data needs an explicit userId-scoping exception in AGENTS.md**: MMR will P0-flag any Prisma query without `userId` scoping unless the exception is documented in AGENTS.md (not just CLAUDE.md — Codex reads AGENTS.md as review context). Add the exception before the first MMR run to avoid repeated P0 findings.
- **Prisma migration safety for new non-nullable columns**: Add the column nullable → backfill existing rows → set NOT NULL → add unique index. Adding NOT NULL with a default empty string on a table with existing rows will fail when adding a unique index (all rows share the same default). The correct SQL uses multiple steps including a REGEXP_REPLACE backfill.
- **`Prisma.CompoundGetPayload<{include: ...}>` prevents type drift**: Use the generated payload type instead of a manually duplicated interface — it stays in sync with schema changes automatically and the mapper functions only need to handle `JsonValue` → domain type coercions.
- **MMR channels cache PR diffs**: After pushing fixes, if a reviewer still flags an already-fixed issue, it is reading a stale diff. Verify the file is correct locally, don't re-fix it; add a known-false-positive entry in AGENTS.md if the finding will recur.

## 2026-05-21 (Task 2.2a)

- **`subjectUserId` authorization must be server-side in Server Actions**: Any action that accepts a `subjectUserId` (for managed-user assignment) must verify the actor is allowed to use that subject — either self-assignment or membership in `managedUsers`. The check belongs in the Server Action (before calling the service), not the domain layer.
- **`findFirst` for power-user + managed-user ownership**: Use `userId: { in: [actorId, ...managedIds] }` instead of `userId: actorId` when a power user needs to read/edit protocols owned by their managed users. The separate `getManagedUserIds` call is acceptable overhead vs. the correctness risk of silently returning "not found" for valid managed-user edits.
- **Single-read `$transaction` is an anti-pattern**: Wrapping a single `findFirst` read in `$transaction` adds round-trip overhead with no benefit. Only use `$transaction` when multiple writes (or read + write) must be atomic.
- **Test the F-002 path explicitly**: When fixing a "power user can edit managed user's data" bug, add a regression test that sets the mock to return a managed user ID and verifies the operation succeeds — otherwise the fix is unverified by the test suite.

## 2026-05-21 (Task 2.2b)

- **Include `fromStatus` in the UPDATE predicate for state transitions**: Under READ COMMITTED isolation, a service guard that reads status then updates separately has a TOCTOU race. The fix: pass the validated `fromStatus` into `transitionProtocolStatus` and use `updateMany(where: { id, userId, status: fromStatus })` — if another concurrent write already changed the status, `count === 0` and an error is thrown before the write lands.
- **Pass `tx` into all helpers called inside `$transaction`**: If a helper called inside a transaction uses the global `prisma` client instead of `tx`, it reads outside the transaction's snapshot. Update helpers like `getManagedUserIds` to accept an optional `client: AnyClient = prisma` and pass `tx` when called from within a transaction.
- **`toLocaleDateString()` is unsafe for UTC date-only values in server components**: `new Date('2026-06-01T00:00:00Z').toLocaleDateString()` renders as May 31 on a US server. Always use `toLocaleDateString(undefined, { timeZone: 'UTC' })` for calendar-date fields stored as UTC midnight.
- **Replace `window.confirm` with an inline confirmation panel**: `window.confirm` is a UX antipattern and blocks MMR reviews on UI code. An inline "Are you sure? / Cancel" panel using a boolean state flag (`showDeactivateConfirm`) is a one-time two-state replacement that passes all review channels.
- **`revalidatePath` for the detail page must be explicit**: Server Actions automatically revalidate `/tracker` and `/dashboard`, but the detail page `/tracker/protocols/${id}` is a distinct cache key — add it to every lifecycle action to ensure other sessions see fresh data.

## 2026-05-21 (Task 2.3a)

- **Resolve the protocol owner before any DB writes**: In a multi-actor system (power user logging for managed user), the `protocol.userId` (subjectUserId) is the correct scope for all dose log reads and writes. Building idempotency keys or querying existing logs with `actorUserId` will silently miss existing records for managed-user protocols.
- **vialId must be ownership-validated before persisting**: An optional vialId from the client is user-controlled input. Always do a userId+compoundId scoped `findFirst` before associating a vial — otherwise a forged request can link a log to another user's vial.
- **P2002 race recovery: use `findDoseLogForDate`, not `findDoseLogByIdempotencyKey`**: If two concurrent writes race on the unique constraint, the losing transaction may have built its idempotency key from a different actor. `findDoseLogForDate(subjectUserId, protocolId, date)` finds the winner regardless of which actor created it.
- **`vi.setSystemTime` must freeze time in tests with date-relative branches**: Tests with a hardcoded "today" date (e.g., for `isFutureCalendarDay`) will silently stop exercising the intended branch once that date passes. Always `vi.setSystemTime(FROZEN_NOW)` in `beforeEach` and `vi.useRealTimers()` in `afterAll`.
- **`getManagedUserIds` must be exported when reused across services**: Making a helper private limits its reuse and forces duplication. Export it from `ProtocolService` so `DoseLogService` and future services can call it without duplicating the user lookup.

## 2026-05-21 (Task 2.3b)

- **Batch SKIPPED→LOGGED: update isBatchLog + loggedByUserId**: When converting a SKIPPED dose log to LOGGED via the batch path, the `updateDoseLog` call must also set `isBatchLog: true` and `loggedByUserId: actorUserId` — a dose re-logged through the batch flow must be tagged as such for audit integrity, not just its status.
- **P2002 race in batch can produce a SKIPPED winner**: If two concurrent requests race to create the same dose log, the loser hits P2002 and reads the winner. In the batch context, the winner could be SKIPPED (created by a concurrent individual-log call). The catch block must upgrade the winner to LOGGED rather than returning it as-is — returning SKIPPED as "ok" would leave the DB inconsistent with the UI feedback.
- **Compound-level vial cache prevents repeated count queries**: When `batchLogDoses` logs N protocols sequentially, each calling `countActiveVialsForCompound`, protocols that share a compound trigger redundant queries. A simple `Record<compoundId, count>` in-scope cache populated on first access reduces M*K queries to M queries (M = unique compounds across the batch).
- **SKIPPED items must be opt-in, not pre-selected, in batch review**: Pre-selecting previously-skipped items risks silently converting an intentional skip into a LOGGED dose. Show SKIPPED items as unchecked checkboxes with a "Previously skipped" label so the user explicitly opts in. The completion banner condition must also account for remaining SKIPPED items to avoid prematurely hiding the review panel.
- **Bulk dose log lookup + per-compound vial counts in getDueTodayForBatch**: Replace N individual `findDoseLogForDate` calls with a single `findMany` keyed by protocolId, and replace N vial count calls with one call per unique compound (using Promise.all). This pattern (fetch-for-display path) is different from the write path — the write path uses an idempotency key lookup.

## 2026-05-21 (Task 2.5)

- **`cycleId` ownership must be validated inside the `withAudit` transaction**: Validating `cycleId` before calling `withAudit` creates a TOCTOU gap — by the time the insert runs, the cycle may have changed owners. Always validate foreign-key ownership constraints inside the same atomic unit as the write.
- **Require `status: 'ACTIVE'` when validating a cycleId reference**: `createProtocol` only checked `{ id, userId }` but never that the cycle was still ACTIVE. A stale form (or crafted request) can attach a protocol to a COMPLETED cycle. Add `status: 'ACTIVE'` to the lookup.
- **`restartCycle` should allow COMPLETED cycles, not just ACTIVE ones**: The primary "restart" use case is rolling a finished cycle into a new one. Guarding against COMPLETED cycles (as a P2 finding suggested) broke the domain model. Allow both statuses; only call `updateMany` to complete protocols/cycle when restarting an ACTIVE one.
- **Clone non-DEACTIVATED protocols, not just ACTIVE+PAUSED**: Short-duration protocols that completed inside an active cycle (loading phases) should still be cloned on restart. Using `status: { not: 'DEACTIVATED' }` as the snapshot filter captures the full regimen intent regardless of mid-cycle completions.
- **Cycle selector for managed-user protocols must show the subject's cycles**: The protocol form was showing the actor's cycles even when assigning to a managed user. Load cycles per subject on the server (`cyclesByUserId` map) and clear `cycleId` on every subject change — not just actor→managed transitions — to prevent stale state.
- **UTC midnight normalization for date-range comparisons**: Comparing `endDate >= new Date()` uses the current timestamp and causes cycles to "disappear" mid-day if their endDate is stored as UTC midnight. Normalize the comparison to UTC midnight: `new Date(Date.UTC(y, m, d))` before the query.
- **Compaction artifact files**: Context compaction can create duplicate files with ` 2` suffixes (e.g., `CycleService 2.ts`). TypeScript picks them up and causes spurious type errors. Add a `find` step to detect and delete them before running `pnpm check`.

## 2026-05-21 (Task 2.6)

- **Never precache authenticated routes in a service worker**: Caching `/tracker` or any protected HTML in CacheStorage allows stale user-specific content to be served to a different logged-in (or logged-out) user on the same device. Cache only truly static assets (`/_next/static/**`) or an unauthenticated offline fallback page. Use network-first for all navigation requests.
- **Bump SW cache name on strategy change**: Changing what gets cached in the SW without bumping `CACHE_NAME` means old installs retain previous cache entries forever — activation only deletes caches with different names. Treat the cache name like a cache-busting version string.
- **Canonical idempotency key must not be caller-supplied**: Allowing the sync client to override the DB-level idempotency key (e.g., passing queue entry ID) lets two different devices create duplicate dose logs for the same protocol day. The canonical `subjectUserId:protocolId:scheduledDate` key must always be derived server-side inside `logDose`; queue-level deduplication belongs in the queue itself, not the service.
- **`lib/offline/` needs `domain/` and `application/` subdirs**: The structure eval enforces the feature-slice convention for all lib modules. When adding `lib/offline/`, create `domain/types.ts` and `application/OfflineQueue.ts` immediately, not flat files in the root.
- **Background Sync tag must be registered from the client**: Declaring a `sync` event listener in `sw.js` is dead code until the client calls `registration.sync.register('dose-sync')`. Register the tag inside `OfflineQueue.enqueue()` after the entry is persisted, with a silent catch for unsupported browsers (iOS Safari).
- **Use `z.string().date()` for calendar date validation**: `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` accepts invalid dates like `2026-13-45`. Zod 3.23+ provides `z.string().date()` which validates both format and calendar correctness.
