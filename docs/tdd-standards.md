# TDD Standards

**Status:** Draft  
**Date:** 2026-05-20  
**Tech Stack source:** `docs/tech-stack.md`  
**Methodology:** deep | Depth: 5/5

---

## 1. Test Pyramid & Coverage Targets

We follow a rigorous Test Pyramid. **Safety-critical modules require 100% branch coverage.**

| Layer | Tool | Overall Target | High-Priority Target |
|-------|------|-----------------|----------------------|
| **Unit** | Vitest | 90% | **100%**: `lib/reconstitution`, `lib/audit`, `lib/shared/math` |
| **Integration** | Vitest | 70% | **100%**: `app/actions/ordering/payment-gate.ts`, Auth logic |
| **E2E** | Playwright | 100% Critical Paths | Hard Gates, Offline Sync, Account Deletion |

---

## 2. Testing Layer Selection

| Use Case | Recommended Layer | Reason |
|----------|-------------------|--------|
| Mathematical logic | **Unit** | Needs 100% precision and zero side-effects. |
| DB Invariants | **Integration** | Verifies schema constraints and transactional integrity. |
| Cross-module data flow | **Integration** | Tests the "seams" between bounded contexts. |
| Offline-to-Online sync | **E2E** | Requires Service Worker and browser storage interaction. |
| Visual layouts | **E2E** | Playwright screenshots catch CSS regressions. |
| Access Control (RBAC) | **E2E** | Verifies route protection and middleware behavior. |

---

## 2. Testing Patterns

### 2.1 Unit Testing
- **Location**: Colocated (`*.test.ts`).
- **Focus**: Pure logic and math.
- **Assertion**: Use `expect().toBe()` and `expect().toThrow()`.

### 2.2 Integration Testing (Server Actions / API)
- **Location**: `lib/{module}/infrastructure/*.test.ts`.
- **Harness**: Use `createTestActionContext()` to setup authenticated sessions and isolated Prisma clients.
- **Audit Logging**: Every integration test for a sensitive mutation MUST assert that an `AuditEvent` was persisted.
```typescript
// Example Audit Assertion
const auditEvent = await db.auditEvent.findFirst({ where: { resourceId: protocol.id } });
expect(auditEvent).toMatchObject({ action: 'PROTOCOL_CREATED', actorUserId: user.id });
```

### 2.3 E2E Testing (Playwright)
- **Focus**: PWA flows and cross-layer integration.
- **Axe-core**: Every E2E test must call `checkA11y()` on the primary page state.

---

## 3. Quality Gates (CI)

All checks must pass before merge. Commands use **pnpm**.

1. **Lint**: `pnpm lint`
2. **Typecheck**: `pnpm typecheck`
3. **Build**: `pnpm build` (Validates Next.js build and schema)
4. **Schema**: `pnpm prisma validate`
5. **Unit/Integration**: `pnpm test`
6. **E2E**: `pnpm e2e`
7. **Coverage**: `pnpm test:coverage`

---

## 4. Test Data & Cleanup

- **Isolation**: Use `TEST_USER_ID` prefixes for all data created in E2E.
- **Cleanup**: E2E tests must clean up their own data in `afterAll` using the `deleteTestData(testId)` helper. Do not rely on transactional rollback for browser-driven tests.

---

## 5. Mocking Strategy

| Service | Strategy | Tool |
|---------|----------|------|
| **Telegram (MTProto)** | Mocked | Custom `MTProtoMock` |
| **Email (Resend)** | Mocked | `vitest.mock('resend')` |
| **Object Storage (R2)** | Mocked | `aws-sdk-client-mock` |
| **Web Push (VAPID)** | Mocked | `web-push` test stubs |

---

## 6. Invariant Coverage Matrix

| Invariant | Layer | Test File |
|-----------|-------|-----------|
| **Bcrypt Cost >= 12** | Unit | `lib/auth/domain/PasswordHash.test.ts` |
| **Invite Expiry (72h)** | Unit | `lib/auth/domain/Invite.test.ts` |
| **Dose > 0** | Unit | `lib/reconstitution/domain/DoseAmount.test.ts` |
| **Audit Immutability** | Integration | `lib/audit/infrastructure/PrismaAuditRepo.test.ts` |
| **Wallet Display Safety** | E2E | `tests/e2e/ordering-payment.spec.ts` |

---

## 7. Specialized Testing Patterns

### 7.1 Timezone-Aware Tracker Tests
Tests for `logDose` must explicitly cover:
- Logging across a DST boundary.
- User in `UTC-10` logging a dose at 11:00 PM (must resolve to the correct calendar day).

### 7.2 PWA Offline Sync Replay
Playwright tests for offline sync must:
1. `page.context().setOffline(true)`
2. Perform dose log action.
3. Assert event exists in IndexedDB.
4. `page.context().setOffline(false)`
5. Assert request sent to `/api/sync` and idempotency handled.
