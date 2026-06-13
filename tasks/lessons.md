# Project Lessons

This file tracks architectural and process learnings for future agents. Append a dated section after every PR that surfaced a non-obvious lesson worth carrying forward. Keep entries terse — one or two sentences each; link to the related ADR, PR, or incident.

## 2026-05-23 (Task 4.3 — MERGED #30 + follow-up #31)

- **`unstable_after` alias confuses Gemini**: Importing as `import { unstable_after as after }` causes Gemini to repeatedly flag `after` as undefined across multiple rounds. Switching to `import { unstable_after }` and calling `unstable_after(...)` directly eliminates the false positive. Next.js 15.0.0-rc.0 does not export `after` directly — only `unstable_after`.
- **Contradicting MMR feedback across rounds is a signal to simplify**: Task 4.3 had immediate-deletion functionality that round-1 wanted hidden, round-3 wanted UI for, round-6 wanted removed entirely. When two reviewers disagree, the right move is usually to delete the contested code path, not to add more code defending it.
- **Cron `findMany` over user-owned tables needs an explicit AGENTS.md exception**: System-level cron operations that scan all users' rows must be documented in AGENTS.md under "Auth Scoping" alongside `markOrdersStale`. Codex reads AGENTS.md as the authoritative reviewer brief; CLAUDE.md alone is not enough.
- **Cron deletion needs `requestedByUserId` on AccountDeletionRequest**: For traceability and defense-in-depth, store the original power user who initiated the deletion on the ADR row. The cron then verifies `user.managedBy === req.requestedByUserId` before deleting and uses that requestor as the write predicate.
- **Order/Vendor cascade conflict**: Deleting a User cascades to Vendor, but `Order.vendorId` has the default RESTRICT action — a Vendor with orders cannot be deleted. The deletion cron must pre-delete orders (scoped with `userId` for safety) before the user delete.
- **Codex base64 size math**: When attaching JSON exports to Resend emails, the raw payload threshold must be ~17MB (not the 25MB attachment limit) to account for ~33% base64 inflation plus email header overhead.
- **Stale ADR cleanup must restore user state atomically**: When the cron rejects a deletion (mismatched requestor), deleting the ADR alone leaves the user stuck in DELETION_PENDING with no cancellation handle. Use `$transaction` to delete the ADR AND restore `status: 'DEACTIVATED'` in one atomic op.
- **Module-level API client instantiation breaks Next.js builds**: `export const resend = new Resend(process.env.RESEND_API_KEY)` at module top-level runs during Next.js build-time page data collection, even for routes that are never called. If the env var is missing in CI, the constructor throws and the whole build fails. Wrap third-party clients in a lazy `Proxy` (see `lib/shared/email.ts`) so import is side-effect-free.

## 2026-05-23 (Task 4.4 — DISABLE_ORDERING flag — MERGED #33)

- **Feature flag enforcement needs four layers**: middleware (404), server-action guards (`assertOrderingEnabled()` as line 1), cron route (200 no-op), and UI hiding (RSC checks `isOrderingDisabled()` before rendering ordering surfaces). Missing any one of these leaves the surface reachable; MMR caught the order-lifecycle actions in `app/(dashboard)/ordering/orders/_actions.ts` that I'd missed in round 1.
- **Onboarding state is sticky**: hardcoded onboarding steps like `telegram_setup` remain in the DB after a flag flip. Don't backfill — handle in the UI layer (`if (!orderingEnabled && step === 'telegram_setup') return null`) so flipping the flag back on restores the prior behavior.
- **Exact-string match for destructive flags**: `process.env.X === 'true'` is the right idiom. `Boolean(process.env.X)` would treat `"false"` as truthy. Document the strictness in the runbook (`.env.example` and `docs/operations-runbook.md` §1.3).
- **Codex correctly distinguishes "this UI is now broken" from "this is a pre-existing UX bug"**: in round 1, F-002 flagged that `admin/page.tsx` linked to `/settings/telegram` which now 404s. The link target itself was always wrong (Settings has no invite UI) — Codex didn't ask me to fix that pre-existing bug; just to gate it. Scope discipline.
- **Local delegation via the multi-agent stack failed**: 3 iterations, every patch malformed (`error: corrupt patch at <stdin>:6`). The local developer agent can produce plans and review-quality findings, but its patch-generation pipeline can't reliably emit `git apply`-clean diffs. For now, frontier implements directly after planning; the local stack is useful for review-only signal.
- **macOS `UF_HIDDEN` flag on `.venv` breaks Python `.pth` files**: if `~/Documents/dev-projects/*/.venv` (or any tree containing site-packages) is marked hidden via `chflags`, Python's `site.py` skips ALL `.pth` files in the tree with no warning beyond `python -v`'s `Skipping hidden .pth file:` trace. Fix: `chflags -R nohidden .venv`. Editable installs (`pip install -e .` / hatch) write underscore-prefixed `.pth` files (`_editable_impl_*.pth`) that are silently disabled by this flag.

## 2026-05-23 (Task 4.5 — Phase 2 Legal Gate — CONDITIONAL/BLOCKED)

- **Self-review docs need clear PASS criteria per item**: PRD §7.5's six-item list is binary (all six must pass), but the criteria within each item are mixed (code evidence + Power User attestation + operational gate). Capture each item's evidence type explicitly in `docs/decisions/phase-2-legal-gate.md` so future re-reviews don't lose context.
- **MMR catches over-claimed PASS**: my first draft of the gate marked all six items PASS by citing existing code paths. Codex correctly flagged that two items relied on code that doesn't exist (the `/accept-invite` route — deferred per AGENTS.md — and a standalone export endpoint — deferred to Task 6.2). Lesson: when documenting "PASS" for an item that depends on code, grep for the implementation before claiming it works. If the code is referenced but not present, mark the item BLOCKED and name the remediating task.
- **A blocking item should name its remediating task and add that task to the plan**: marking item 1 as BLOCKED without proposing the fix would leave the gate stuck. Added Task 1.6c (`/accept-invite` flow) to `docs/implementation-plan.md` and linked it from the gate document.
- **Source-of-truth coupling**: when two docs describe the same status (here, the gate doc and the handoff), MMR will flag any drift between them as P0. Update both in the same commit, or pick one as canonical and have the other link to it.
- **Annual review cadence belongs in the document, not external calendars**: every decision doc that requires re-review should self-document its next-review date at the top so the cadence survives organizational changes. The Power User adds the date to their personal calendar as defense-in-depth.

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

## 2026-05-21 (Task 2.7)

- **Serialize Decimal/Date before crossing the Server/Client boundary**: Next.js will throw at runtime if a Server Component passes `Decimal` instances or `Date` objects as props to a Client Component. Always map to plain strings with `.toFixed()` and `.toISOString()` in the server layer before passing down.
- **Route all CompoundProfile reference-data queries through CompoundRepo**: The userId-scoping exemption in AGENTS.md only covers `lib/reference/infrastructure/CompoundRepo.ts`. Services that query `compoundProfile` directly (even for shelf-life data) trigger a P0 finding. Add a scoped helper to CompoundRepo and call it from the consuming service.
- **`orderItemId` in SaveVialInput must be ownership-validated inside the transaction**: An optional FK that comes from the client is user-controlled input. Validate it with a user-scoped `orderItem.findFirst({ where: { id, order: { userId } } })` inside the same `withAudit` transaction before writing the vial — not before.
- **Use `new Decimal(stringValue)` directly — never `parseFloat` before Decimal**: `parseFloat('5abc')` silently returns `5`, bypassing the validation boundary. Pass the raw string to `new Decimal()` which throws on non-numeric input. Apply the same rule in Zod refine predicates.
- **Expiry auto-compute should be UTC-midnight normalized**: Computing `now.getTime() + N * 86400_000` produces a sliding timestamp that drifts with the time of day. Normalize to `new Date(Date.UTC(y, m, d + N))` so auto-computed and user-supplied dates share the same midnight-UTC convention.
- **`vi.useFakeTimers()` and `vi.useRealTimers()` must be paired in beforeEach/afterEach**: Calling only `vi.useFakeTimers()` in `beforeEach` without `vi.useRealTimers()` in `afterEach` leaks fake timers into subsequent describe blocks. The `replace_all` edit strategy can accidentally remove the `afterEach` body — always verify after mass replacements.
- **Reconstitution inventory badge: prefer percentage threshold over absolute dose count**: `remainingMg / totalMg < 0.20` is compound-agnostic and doesn't require knowing the per-dose volume. The old `doseVolumeEstimate.times(10)` heuristic assumed 0.1 mL/dose for all compounds, which is wrong for high-concentration or large-volume peptides.

## 2026-05-21 (Task 3.2)

- **GramJS requires the same auth_key for both auth steps**: `SendCode` initialises an `auth_key` that GramJS embeds in the session. The session string from that call must be passed to `SignIn` — a fresh client will be rejected by Telegram. Save `client.session.save()` after `SendCode` and pass it back to `completePhoneAuth` as `tempSession`.
- **Keep the updated session after `SESSION_PASSWORD_NEEDED`**: After a failed `SignIn` throws `SESSION_PASSWORD_NEEDED`, GramJS has updated the session with new auth state. Save `client.session.save()` again at that point; using the original `tempSession` for `CheckPassword` will fail.
- **Never hold `tempSession` on the client**: Use a server-side TTL store (`TelegramFlowStore`) keyed by an opaque `flowId` UUID bound to `userId`. The client only ever holds the `flowId`; the raw GramJS session string never leaves the server.
- **`.unref()` TTL timers to prevent test hangs**: `setTimeout(() => store.delete(id), FLOW_TTL_MS).unref()` is required so the timer doesn't pin the Node.js event loop after all other work is done — without it, vitest hangs in teardown.
- **`deleteFlow` after `withAudit`, not before**: Deleting the flow before the DB write commits means a failed write leaves no retry path. Delete only after `withAudit` returns successfully; this also allows password retries within the TTL.
- **Static imports beat dynamic imports for `telegram`**: `await import('telegram')` with `as any` bypasses TypeScript and triggers MMR P1 findings. Use static `import { TelegramClient, Api } from 'telegram'` — the package ships complete type definitions.
- **Audit `TELEGRAM_SESSION_LINK_INITIATED` on the initiate step**: Security-sensitive flows (phone auth, 2FA, link, revoke) must each emit an audit event. The initiate step was previously unaudited; add `TELEGRAM_SESSION_LINK_INITIATED` to `AuditAction` and call `withAudit` with an empty mutation callback.
- **MMR stale-diff false positives accumulate**: After 12 rounds, MMR channels repeatedly re-flagged already-fixed issues due to caching. Document each confirmed false positive in `AGENTS.md > Known False Positives` with the round number — it signals to human reviewers that the finding is known and prevents re-analysis.

## 2026-05-21 (Task 2.8)

- **Deferred ACs must be documented in both AGENTS.md and code**: When a dashboard acceptance criterion (e.g., AC-8 managed-user Confirm/Skip card) is explicitly deferred, add an entry to `## Known Design Decisions` in AGENTS.md and a short comment above the interim implementation. Without both, MMR reviewers will flag it as a P1 missing feature every round.
- **Use `Math.floor`, not `Math.round`, for full-star display**: `Math.round(4.5)` renders 5 full stars for an average that hasn't quite reached 5, misleading users. Floor ensures only a complete star is filled; the numeric label provides precision.
- **Extract date-boundary helpers to `lib/shared/date.ts`**: Computing `nowUtcMidnight` inline in multiple page files leads to duplication flagged by multi-channel reviewers. A single `utcMidnightToday()` export is the canonical source of truth and can be tested in isolation.
- **Capture a single `now = new Date()` at the top of each service function**: Multiple `new Date()` calls within one async function risk inconsistent boundaries if a millisecond boundary is crossed mid-execution. One `const now = new Date()` passed through all helpers eliminates the race and is idiomatic.

## 2026-05-22 (Task 3.4)

- **TOCTOU in bulk status transitions requires per-row `count === 1` guard**: A `findMany` followed by a bulk `updateMany({ id: { in: ids } })` has a race window — orders whose status changed between the read and the write still appear in the batch. Fix: loop per-order inside a single `$transaction`, use `updateMany({ where: { id, userId, status: 'SENT' } })`, and only audit/count rows where `count === 1`.
- **Cron actorUserId must be `'SYSTEM'`, not the user's id**: Audit events for automated status changes (stale flagging) must attribute the actor to `'SYSTEM'` and carry `subjectUserId` for the affected user. Using the user's id as actor corrupts audit attribution and flags as P1 in every review channel.
- **`vi.doMock` bleeds into later describe blocks — always pair with `vi.doUnmock` in afterEach**: `vi.doMock` (unlike the hoisted `vi.mock`) persists until explicitly unmocked. If a describe block mocks a module with `vi.doMock`, add `vi.doUnmock(modulePath)` in `afterEach` to prevent the mock from polluting subsequent describes that import the same module for real.
- **STALE is non-terminal — show recovery actions, not just a warning**: If STALE is in `NON_TERMINAL_STATUSES`, the UI must still offer the Telegram deep-link and "Capture vendor reply" button (adjusted label). A warning-only panel for STALE orders traps users in a cancel-only dead end despite the domain allowing recovery.
- **Internal navigation must use Next.js `<Link>`, not `<a>`**: Using `<a href="...">` for same-app routes bypasses the client-side router and forces a full page reload. MMR channels consistently flag this as P2. Always import and use `<Link>` from `next/link` for internal navigation.

## 2026-05-22 (Task 3.3)

- **Split catch scope after Telegram send**: Only catch Telegram send failures; persist `telegramMessageId` outside the try-catch so a DB failure after confirmed delivery throws rather than silently offering MANUAL_FALLBACK. This prevents data loss when Telegram succeeds but the follow-up write fails.
- **Advisory lock for duplicate-send race**: `pg_try_advisory_xact_lock(key1::int4, key2::int4)` inside a Prisma `$transaction` with `(tx as any).$queryRaw` fully closes the READ COMMITTED window for concurrent duplicate sends. Hash `userId:vendorId:messageText` with SHA-256 and use the first two 32-bit words as lock keys.
- **Type assertion on `$queryRaw` result, not generic arg**: Casting via `(tx as any).$queryRaw<T>(...)` fails TypeScript (`error TS2347`). Instead use `(await (tx as any).$queryRaw(...)) as T` — the assertion moves to the result expression.
- **Trailing-zero stripping in composeMessage**: `new Decimal('5.000').toString()` gives `'5.000'`; wrap with `new Decimal(i.vialSizeMg.toString()).toString()` to strip normalized decimals for human-readable messages.
- **`send_state_indeterminate` guard**: Detect DRAFT orders where `messageText` is set but `telegramMessageId` and `sendMethod` are both null — indicates a crash after Telegram success but before the pre-write. Throw `send_state_indeterminate` to block re-send rather than silently duplicating the message.

## 2026-05-23 (Task 5.1 → 6.4, end-of-session batch)

Lessons that cut across multiple of the seven PRs shipped this session
(5.1 reminder prefs, 5.2 reminder cron, 5.3 outcomes, 5.4 AI layer,
6.1 self-deletion, 6.3 audit purge + backup verify, 6.4 vial expiry):

- **Atomic claim via optimistic-lock CAS beats elapsed-time predicates**
  for cron-loop dedupe (Task 5.2). An initial fix used a 23h elapsed-time
  cutoff in the SQL `updateMany` predicate, but Codex caught the edge
  case where a user crosses a local-day boundary < 23h after a prior
  dispatch (DST, reminder-time moved earlier). Switched to
  `WHERE lastDispatchedAt = <value just read>` — the prior-read value
  IS the CAS. Combined with an in-process `alreadyDispatchedToday`
  check, the SQL claim only needs to defeat the race.

- **Atomic upsert (vs find-then-create-or-update) for one-row-per-day
  invariants** (Task 5.3). Two concurrent submissions for the same
  `(userId, scheduledDate)` outcome both saw "no existing row" via
  findFirst and one then tripped P2002 — turning an idempotent save
  into a 500. `prisma.outcomeLog.upsert` keyed on the unique compound
  index collapses the race; a separate pre-read still drives the
  OUTCOME_LOGGED-vs-UPDATED audit branch (the worst case is one
  mislabelled audit row).

- **Replace-set scoping**: when a service does delete-then-insert on
  a nested collection (Task 5.3 ProtocolRatings), pass the *active set*
  of allowed IDs into the repo and scope the delete to that set. The
  first attempt deleted "all ratings for this outcome", which silently
  destroyed historical ratings for protocols that had since been
  paused. The user can still clear an *active* rating by omitting it,
  but inactive history is preserved.

- **Provider fail-over orchestrator (Task 5.4) needs THREE distinct
  failure classes**:
  - **Transient** (timeout, provider 5xx): retry once on the same provider.
  - **Deterministic** (invalid_schema, aborted-by-our-timeout): no
    retry on the same provider; fall through immediately. Re-running
    the same prompt on the same model just burns latency + tokens.
  - **Init failure** (SDK import, bad shape, missing env var): treat
    as "this provider is unavailable today" — record + fall through.
  Codex caught the missing init-class on round 3 by reasoning about
  what happens when the SDK's shape is unexpected.

- **JWT-carried status enables edge-runtime route gating without DB
  hops** (Task 6.1). When the cron + middleware + service all need to
  agree on a user's state (e.g. DELETION_PENDING), embed the field in
  the JWT. The Node-runtime jwt callback refreshes it on every request
  (same DB hit as `passwordVersion`); the edge middleware reads the
  refreshed cookie purely from the JWT.

- **signOut after a privileged status transition** is the cleanest way
  to force a session refresh. The user submits "delete my account
  (delayed)"; the server action sets `User.status = 'DELETION_PENDING'`
  but the user's existing JWT still claims `ACTIVE`. Letting the
  signOut redirect propagate (don't `try/catch` it) clears the cookie
  and forces re-login, after which the JWT carries the new status.
  Codex flagged a `try/catch` around signOut as silently swallowing
  the navigation, leaving the user with a stale session cookie.

- **Refuse self-delete when the user has active managed accounts**
  (Task 6.1). Otherwise FK SetNull would orphan their managed users
  outside the admin-ownership model. The check is `_count.managedUsers
  > 0` via Prisma's `_count` select.

- **Chunked deleteMany with `findMany take: N` then `deleteMany WHERE
  id IN`** (Task 6.3). For potentially-large tables (AuditEvent at
  scale), a single deleteMany can hold row locks long enough to
  interfere with concurrent writes. Each batch is its own statement,
  with a MAX_BATCHES safety cap.

- **Re-verify the predicate that selected a row INSIDE the per-row
  transaction's updateMany** (Task 6.4). A vial whose `expiresAt`
  was extended by a concurrent user action between the initial
  findMany and the per-vial transaction would otherwise be incorrectly
  flipped to EXPIRED. The fix is to repeat
  `expiresAt: { not: null, lt: now }` in the updateMany WHERE clause.
  Same logical pattern as the TOCTOU `fromStatus` guard in protocol
  state transitions.

- **Backup-verify cron honesty**: a heartbeat-only route that always
  returns `ok: true` makes the cron's promise ("alert on missed
  backup") a lie. Even when full Railway backup-API integration isn't
  available, a `SELECT 1` round-trip + 500 on failure is a genuine
  liveness check — and Railway's existing non-2xx alerting picks up
  the failure. Earlier added a `User.updatedAt` freshness check too,
  but dropped it: low-traffic envs produce false-positive pages when
  a solo dev's profile not changing for 72h is normal.

- **Hydration-safe date rendering in client components** (Task 6.1).
  `new Date(iso).toLocaleString()` on server vs client produces
  different strings (server's locale/TZ vs user's). For SSR, render a
  stable UTC string (`YYYY-MM-DD HH:MM UTC`) on the server and the
  initial client paint, then `useEffect` to swap to the user's local
  format. No hydration mismatch and no raw-ISO flash.

- **Disallowed-phrase guards need compound-adjective variants**: an
  AI safety regex of `/approved\s+by\s+the\s+(fda|ema)/` does not
  catch the much more common LLM output `/(fda|ema)[\s-]*approved/`
  ("FDA-approved", "EMA approved"). Codex caught the gap on round 2
  of Task 5.4 — the test was passing for the verbose form but not
  the adjective form.

- **`vi.clearAllMocks()` does NOT drain `mockResolvedValueOnce`
  queues** — only `vi.resetAllMocks()` does. Tests that set up
  per-test `.mockResolvedValueOnce(...)` returns inside the test body
  must reset between tests or the leftover queue contaminates later
  tests. Found this on the first test run of Task 5.1.

- **`web-push` is CommonJS — normalise the dynamic-import shape**
  (Task 5.2). `await import('web-push')` may surface methods under
  `default` depending on the bundler's interop config. The wrapper:
  ```ts
  const imported = await import('web-push');
  const mod = imported.default ?? imported;
  ```
  Plus a shape-check guard so an unexpected version surfaces a clean
  `web_push_module_shape_unexpected` rather than `setVapidDetails is
  not a function` at first send.

- **`AbortSignal` propagation to provider SDKs makes timeouts real**
  (Task 5.4). `withTimeout(p, ms)` that only races a setTimeout
  rejection leaves the upstream HTTP request running in the
  background, burning tokens. Wire the AbortController through every
  provider call (`generateObject({ ..., abortSignal })`). For the
  retry path to engage on timeout, normalise the resulting
  AbortError to `ai_timeout` rather than `aborted` (which we treat
  as deterministic and no-retry).

- **Multi-PR sessions need compaction-artifact cleanup**: midway
  through Task 5.3, found two stale ` 2`-suffixed directories from a
  prior compaction (matches the 2026-05-21 lesson). They were
  untracked, but `find ... -name '* 2'` should be part of any
  new-session warmup if `git status` shows nothing relevant.

## 2026-06-13 — Compound Research (ADR-017)

- **Local reasoning models (Qwen3-style) are unusable until you disable
  "thinking"**: the bf16 35B orchestrator emitted huge `reasoning` blocks and
  returned EMPTY `content` under default token caps (generateObject →
  `NoObjectGeneratedError`, generateText → `""`). Two fixes: (1) pass a generous
  `maxOutputTokens` (8000) so content survives, and (2) inject
  `chat_template_kwargs: {enable_thinking: false}` — a 200s+ request dropped to
  ~7s. The `@ai-sdk/openai-compatible` provider has no first-class field for
  this, so we inject it via a custom `fetch` on the factory (env-gated by
  `LOCAL_LLM_DISABLE_THINKING`). Even with thinking off the model is ~2.5 tok/s,
  so synthesis needs a ~240s step timeout + truncated (1200-char) and capped
  (top-3) sources.
- **`AbortSignal.timeout(ms)` throws a `DOMException` with `name ==='TimeoutError'`**,
  NOT `AbortError`/`ai_timeout`. Fail-closed/abort guards and audit
  classification must check `TimeoutError` explicitly. Mocked unit tests that
  assert `new Error('ai_timeout')` pass while testing a path production never
  emits — only the live run caught this.
- **Local OpenAI-compatible endpoints often don't honor `responseFormat`** (the
  SDK warns "responseFormat is not supported"). `generateObject` then succeeds
  only if the model happens to emit clean JSON. Build a `generateText` +
  tolerant-JSON-parse fallback, fall back on ANY non-timeout failure (not just
  `NoObjectGeneratedError` — a wrong shape throws `ZodError`), and put the EXACT
  JSON object shape in the prompt (the model returned a bare `["q"]` array when
  the prompt only said "output queries").
- **Pre-existing dev-DB schema drift makes `prisma migrate dev` offer to RESET**
  (data-loss prompt). When the dev DB has out-of-band columns not in migration
  history, author the additive `migration.sql` by hand and apply with
  `prisma migrate deploy` (never `migrate dev`/`migrate reset`). Back up first.
- **Vitest renders with the classic JSX runtime**: client components must
  `import React` (default), not just named hooks, or `renderToString`/RTL tests
  throw "React is not defined". Also, embedding a server-action-importing client
  component (our panel → `@/lib/auth` → next-auth) into a parent breaks any test
  that renders the parent unless it mocks the new actions — next-auth's
  `next/server` ESM import crashes vitest collection. `TrackerCalendar.test.tsx`
  passed on main and only broke once our panel entered its module graph.
- **Two evals gate new modules**: a new `lib/<slice>/` must be added to
  `tests/evals/structure.test.ts` `allowedModules`, and every new Prisma model
  name must appear in `docs/database-schema.md` (`tests/evals/database.test.ts`).
