# TDD Standards

**Status:** Draft
**Date:** 2026-05-20
**Tech Stack source:** `docs/tech-stack.md`
**Rules sources:** `.claude/rules/safety-math.md`, `.claude/rules/testing.md`
**Methodology:** deep | Depth: 5/5

---

## 1. Test Pyramid & Coverage Targets

We follow a rigorous Test Pyramid with an explicit Eval layer for AI-bearing code paths. **Safety-critical modules require 100% branch coverage.**

| Layer | Tool | Overall Target | High-Priority Target |
|-------|------|-----------------|----------------------|
| **Unit** | Vitest | 90% | **100% branch**: `lib/reconstitution`, `lib/audit`, `lib/shared/math` |
| **Integration** | Vitest + real PostgreSQL | 70% | **100% branch**: `app/actions/ordering/payment-gate.ts`, `lib/auth/application/*` |
| **E2E** | Playwright | 100% critical paths | Hard Gates (payment confirm + reconstitution warnings), Offline Sync, Account Deletion 48h flow |
| **Evals** | Vitest in `tests/evals/` | 100% AI-bearing prompts | Profile-drafting prompt, PubMed citation-extraction prompt, v2 Telegram parser (when added) |

Coverage is enforced in CI via `pnpm test:coverage`. Configuration in `vitest.config.ts` sets the 100%-branch threshold for the `include` glob `lib/reconstitution/**/*` and `lib/audit/**/*`; falling below fails the build.

---

## 2. Testing Layer Selection

| Use Case | Recommended Layer | Reason |
|----------|-------------------|--------|
| Mathematical logic (reconstitution, dose math) | **Unit** | Needs 100% precision and zero side-effects. |
| Domain invariants (DoseAmount > 0, bcrypt cost >= 12, etc.) | **Unit** | Pure rules; cheapest place to enforce. |
| DB invariants (unique constraints, FK behavior) | **Integration** | Verifies schema constraints and transactional integrity. |
| Server Action mutations | **Integration** | Tests the action + repo + audit-event-write contract together. |
| Cross-module data flow | **Integration** | Tests the "seams" between bounded contexts. |
| Offline-to-Online sync | **E2E** | Requires Service Worker + IndexedDB interaction. |
| Visual layouts / responsive | **E2E** | Playwright screenshots catch CSS regressions. |
| Access Control (RBAC, managed user permissions) | **E2E** | Verifies route protection and middleware behavior. |
| Account lifecycle (deletion 48h, email change revert) | **E2E** | Time-window flows need full browser interaction. |
| AI prompt quality | **Evals** | Non-deterministic; eval framework compares against gold-standard outputs. |

---

## 3. Testing Patterns

### 3.1 Unit Testing
- **Location**: Colocated (`*.test.ts` next to the code under test).
- **Focus**: Pure logic and math.
- **Assertion**: Use `expect().toBe()` and `expect().toThrow()`. For Decimal comparisons, use `expect(dec.eq(other)).toBe(true)` — NEVER numeric `===` on Decimal.
- **Property-based testing**: `fast-check` for math-heavy modules. The reconstitution calculator MUST have at least one property test that asserts `concentration * injectionVolume === totalDose` across randomized vial sizes, BAC water volumes, and dose amounts.

### 3.2 Integration Testing (Server Actions / API)
- **Location**: `lib/{module}/infrastructure/*.test.ts` and `app/actions/{module}/*.test.ts`.
- **Harness**: `createTestActionContext(opts)` sets up an authenticated session and an isolated Prisma client scoped to a transaction wrapper (`TEST_USER_ID` prefix on all created rows).
- **Audit Logging — shared helper**: every integration test for a sensitive mutation MUST use the shared `expectAuditEvent(...)` helper, NOT ad-hoc Prisma queries. The helper enforces the canonical `category` + `action` vocabulary from `docs/domain-models/audit.md`.

  ```typescript
  // tests/helpers/audit.ts
  export async function expectAuditEvent(
    db: PrismaClient,
    match: { action: string; actorUserId: string; resourceId?: string }
  ): Promise<AuditEvent> {
    const event = await db.auditEvent.findFirst({ where: match });
    if (!event) {
      throw new Error(`Expected audit event matching ${JSON.stringify(match)} — none found`);
    }
    expect(event.action).toBe(match.action);
    expect(event.actorUserId).toBe(match.actorUserId);
    return event;
  }
  ```

- **Audit failure-injection**: every Server Action that emits an audit event MUST have one integration test that injects an audit-write failure (mock `auditEvent.create` to throw) and asserts the entire mutation is rolled back. The audit-failure test is the only place that exercises the `AUDIT_WRITE_FAILED` (500) error code.

  ```typescript
  it('rolls back protocol creation when audit write fails', async () => {
    const spy = vi.spyOn(db.auditEvent, 'create').mockRejectedValueOnce(new Error('boom'));
    await expect(createProtocol(ctx, validInput)).rejects.toThrow();
    const protocols = await db.protocol.findMany({ where: { userId: ctx.userId } });
    expect(protocols).toHaveLength(0);  // mutation rolled back
    spy.mockRestore();
  });
  ```

### 3.3 E2E Testing (Playwright)
- **Focus**: PWA flows + cross-layer integration + accessibility.
- **Axe-core**: every E2E test must call `await checkA11y(page)` on the primary page state. Failures BLOCK CI (not warnings).
- **Mobile viewports**: every PWA-relevant test runs on `chromium` desktop AND `webkit` iPhone 14 viewport (375x667). Dose-logging tests run on both as required by PRD §8.6.

---

## 4. Quality Gates (CI)

All checks must pass before merge. Commands use **pnpm**.

1. **Lint**: `pnpm lint`
2. **Typecheck**: `pnpm typecheck`
3. **Build**: `pnpm build` (validates Next.js build + Prisma generate)
4. **Schema validate**: `pnpm prisma validate`
5. **Unit/Integration**: `pnpm test`
6. **E2E**: `pnpm e2e`
7. **Evals**: `pnpm eval`
8. **Coverage**: `pnpm test:coverage` (enforces 100% branch on safety-critical modules per §1)

---

## 5. Test Data & Cleanup

- **Isolation**: every E2E test generates a `TEST_USER_ID` prefix (e.g., `e2e-<spec>-<timestamp>`); all created rows are tagged with this prefix.
- **Cleanup**: E2E tests must clean up their own data in `afterEach` (NOT `afterAll`) using the `deleteTestData(testId)` helper. This avoids cross-test pollution if a test fails mid-flight.
- **Why not transactional rollback for E2E**: Playwright drives a real Next.js server in a separate process; we can't share a DB transaction with the browser, so per-test cleanup is mandatory.
- **For integration tests** (Vitest, in-process): transactional rollback is preferred — `createTestActionContext` opens a transaction, runs the test, and rolls back, leaving no DB residue.

---

## 6. Mocking Strategy

| Service | Strategy | Tool |
|---------|----------|------|
| **Telegram (MTProto)** | Mocked | Custom `MTProtoMock` (replays canned vendor exchanges) |
| **Email (Resend)** | Mocked | `vitest.mock('resend')` |
| **Object Storage (R2)** | Mocked | `aws-sdk-client-mock` (S3-compatible) |
| **Web Push (VAPID)** | Mocked | `web-push` test stubs + Playwright `setNotificationPermission` |
| **Sentry** | Mocked | `vitest.mock('@sentry/nextjs')` — assert calls but don't ship to Sentry from tests |
| **AI providers (Anthropic, Gemini)** | Mocked at the Vercel AI SDK boundary | `vitest.mock('ai')`; integration tests stub the streaming responses with canned text. Eval tests use real providers (see §7) |
| **PostgreSQL** | Real DB | Docker-compose container in CI; transactional rollback per integration test |

**AI mocking rule**: AI is mocked everywhere EXCEPT in `tests/evals/`. Integration tests assert that the right prompt was sent and the response was parsed correctly; eval tests assert the response quality (against a gold-standard fixture) using real API calls.

---

## 7. Eval Testing (`tests/evals/`)

AI prompts are exercised against real providers in `tests/evals/`. These tests are SLOW (network + tokens) and EXPENSIVE — they run on every PR but in a parallel job that doesn't gate-block (results are surfaced as a PR comment). Failure to MEET threshold blocks merge; failure to RUN does not.

Each eval defines:
- A canonical input (fixture in `tests/evals/fixtures/`)
- A gold-standard expected output
- A scorer (LLM-as-judge with explicit rubric, OR exact-match for structured outputs)
- A threshold (e.g., 90% similarity, or 100% exact-match for JSON schema)

**Never disable an eval without an explicit comment justifying it** (per `.claude/rules/testing.md`). If a prompt regresses, fix the prompt, not the eval.

---

## 8. Invariant Coverage Matrix

| Invariant | Source | Layer | Test File |
|-----------|--------|-------|-----------|
| Bcrypt cost ≥ 12 | `docs/domain-models/auth.md` | Unit | `lib/auth/domain/PasswordHash.test.ts` |
| Invite expiry = createdAt + 72h | auth.md | Unit | `lib/auth/domain/Invite.test.ts` |
| PasswordResetToken expiry = createdAt + 1h | auth.md | Unit | `lib/auth/domain/PasswordResetToken.test.ts` |
| EmailChangeRequest expiry = createdAt + 24h | auth.md | Unit | `lib/auth/domain/EmailChangeRequest.test.ts` |
| EmailChangeRequest.revertibleUntil = appliedAt + 48h | auth.md | Unit | same file |
| Session.expiresAt ≤ createdAt + 30d | auth.md | Unit | `lib/auth/domain/Session.test.ts` |
| Password change → all other sessions revoked | auth.md | Integration | `app/actions/auth/change-password.test.ts` |
| Dose.value > 0 | tracker.md | Unit | `lib/reconstitution/domain/DoseAmount.test.ts` |
| One OutcomeLog per (userId, scheduledDate) | tracker.md | Integration | `app/actions/tracker/log-outcome.test.ts` |
| Deactivated protocol cannot accept new logs after deactivation timestamp | tracker.md | Integration | `app/actions/tracker/log-dose-deactivated.test.ts` |
| Order status forward-only except Cancel | ordering.md | Integration | `app/actions/ordering/state-machine.test.ts` |
| Order.sendMethod immutable after first set | ordering.md | Integration | same file |
| OrderLineItem duplicate merge on (compoundId, form, vialSizeMg) | ordering.md | Integration | `app/actions/ordering/create-draft.test.ts` |
| 60s duplicate-send protection | ordering.md | Integration | `app/actions/ordering/send-order.test.ts` |
| Payment confirmation safety gate (wallet + amount + acknowledged) | ordering.md | E2E | `tests/e2e/ordering-payment.spec.ts` |
| Audit immutability (no updates, no deletes outside 90d purge) | audit.md | Integration | `lib/audit/infrastructure/PrismaAuditRepo.test.ts` |
| AuditEvent.actorUserId historical reference (survives user deletion) | audit.md, ADR-009 | Integration | `lib/audit/infrastructure/preservation.test.ts` |
| Vial.remainingMg ≥ 0 | reconstitution.md | Unit | `lib/reconstitution/domain/Vial.test.ts` |
| Reconstitution math identity (concentration × volume = total dose) | reconstitution.md | Unit (property-based) | `lib/reconstitution/domain/Calculator.fast-check.test.ts` |
| Compound name uniqueness | reference.md | Integration | `lib/reference/infrastructure/CompoundRepo.test.ts` |

---

## 9. Specialized Testing Patterns

### 9.1 Timezone-Aware Tracker Tests
Tests for `logDose` must explicitly cover:
- Logging across a DST boundary (e.g., March 9, 2026 02:30 → 03:30 in `America/Denver`).
- User in `UTC-10` logging a dose at 11:00 PM local (must resolve to the correct calendar day in their tz, not server UTC).
- User in `UTC+12` logging at 01:00 AM (different calendar day from server UTC).

### 9.2 PWA Offline Sync Replay
Playwright tests for offline sync must:
1. `await page.context().setOffline(true)`
2. Perform dose-log action via UI.
3. Assert event exists in IndexedDB (read via `page.evaluate(() => indexedDB.open(...))`).
4. `await page.context().setOffline(false)`
5. Assert `POST /api/sync` was made and idempotency key matched.
6. Assert dose appears in the server-rendered dashboard on next navigation.

### 9.3 Session Invalidation on Password Change
Integration test for `change-password`:
1. Create user with 3 active sessions.
2. Call `change-password` from session #1.
3. Assert sessions #2 and #3 have `revokedAt` set.
4. Assert session #1 still works (current session preserved).
5. Assert `OTHER_SESSIONS_INVALIDATED` audit event.

### 9.4 Email Change Verify + Revert
E2E test:
1. Logged-in user submits change-email-request → verify the new-address email lands in test inbox (Resend mock captures).
2. Click verify link → assert `auth_users.email` swapped + revert link emailed to old address.
3. Click revert link → assert `auth_users.email` rolled back + `EmailChangeRequest.status = Reverted`.
4. Assert audit chain: `EMAIL_CHANGE_REQUESTED` → `EMAIL_CHANGE_VERIFIED` → `EMAIL_CHANGE_REVERTED`.

### 9.5 Account Deletion 48h Cancel Window
E2E test:
1. User schedules deletion (delayed 48h mode) → assert `AccountDeletionRequest.scheduledFor` is 48h from now.
2. User logs in → assert `DeletionPendingBanner` is shown.
3. User clicks "Cancel deletion" → assert request `status = Cancelled`, banner gone.
4. Assert audit chain: `ACCOUNT_DELETION_SCHEDULED` → `ACCOUNT_DELETION_CANCELLED`.

### 9.6 Managed-User Deletion Export-First
Integration test:
1. Admin calls `delete-managed-user`.
2. Assert a `DataExportRequest` was created BEFORE any deletion side-effect.
3. Mock email send and assert it fires with the export link.
4. Advance time past `scheduledFor` (delayed) or assert immediate-mode bypass.
5. Assert managed user is deleted; assert audit events preserved with the deleted user's `subjectUserId` populated.

### 9.7 Order Cancel from Any Non-Terminal State
Integration test parametrized over states (Draft, Sent, Confirmed, PaymentSent, Stale): cancel from each; assert state transitions to Cancelled; assert audit event has correct previous state in `oldValues`.

### 9.8 Reminder Dispatch (15-minute tick)
Integration test:
1. Create users in 3 different timezones with `dailyReminderTime = "07:00"` each.
2. Mock current time to 07:05 UTC; assert only the UTC user is reminded.
3. Mock current time to 14:05 UTC; assert only the user in UTC-7 is reminded.
4. Assert correct channel selection (push if `pushPermissionState = Granted` AND subscription exists; else email).
5. Failure-injection: mock Resend send failure; assert log + no retry + no user-facing error.

---

## 10. Cross-References

- **Rules**: `.claude/rules/safety-math.md` (Decimal only, 100% coverage on safety modules), `.claude/rules/testing.md` (TDD default, eval disable requires comment).
- **ADRs**: ADR-008 (Vitest + Playwright + coverage requirements binding), ADR-009 (Audit log testing), ADR-010 (AI provider mocking boundary), ADR-012 (cron job testing).
- **Domain models**: `docs/domain-models/` — each invariant in the matrix above is traceable to a domain entity rule.
- **Architecture**: `docs/system-architecture.md` §3 — every documented flow has at least one E2E test in `tests/e2e/` corresponding to it.
