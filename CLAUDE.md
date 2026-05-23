# Peptides Project Rules

## Core Principles
- **Safety & Precision**: 100% test coverage for math; use `Decimal` only.
- **TDD Always**: Write pending test skeletons in `tests/acceptance/` first.
- **Autonomous & Verified**: Prove every change with `pnpm check`.
- **Identity Scoping**: Every DB query must include `where: { userId: session.user.id }`.
  - **Exception**: `AuthRepository.findByEmailForAuth` in `lib/auth/infrastructure/AuthRepository.ts` is explicitly exempt — it queries the User table by email to establish identity and cannot be userId-scoped because userId is what is being established. It selects only authentication-required fields and never returns user-authored content.
  - **Exception**: All queries in `lib/reference/infrastructure/CompoundRepo.ts` are explicitly exempt — `Compound`, `CompoundProfile`, and `Citation` are admin-curated global reference data with no `userId` column. All authenticated users have read access to the full compound catalog. These are not user-authored resources.
  - **Exception**: Write mutations on `VendorProduct` in `lib/ordering/application/VendorProductService.ts` use `update({ where: { id: existing.id } })` after a scoped `findFirst({ where: { id, vendor: { userId } } })` within the **same Prisma transaction**. `VendorProduct` has no direct `userId` column; ownership is verified through its `vendor` relation. `updateMany` with relation filters does not reliably work in Prisma for write operations. The intra-transaction `findFirst` + `update` pattern is the approved equivalent.
  - **Exception**: `processPendingDeletions` in `lib/admin/application/AdminService.ts` is explicitly exempt — it is a system-level cron operation with no session context. It queries `AccountDeletionRequest` globally (all rows with `status: PENDING, scheduledFor: { lte: now }`) to process scheduled user deletions. Ownership was verified at request-creation time; the cron only acts on previously authorized deletion records.
  - **Exception**: `markVialsExpired` in `lib/reconstitution/application/VialExpiryService.ts` is explicitly exempt — system-level cron operation (ADR-012, `POST /api/cron/vial-expiry`, daily). The initial `findMany` is intentionally global (scans every user's RECONSTITUTED vials past their `expiresAt`). Endpoint secured with `CRON_SECRET`. Per-vial `updateMany` includes both `id` and `userId` predicates; audit events emitted only on `count === 1`. `actorUserId: 'SYSTEM'`. Same pattern as `markOrdersStale`.
  - **Exception**: `purgeOldAuditEvents` in `lib/audit/application/AuditPurgeService.ts` is explicitly exempt — system-level cron operation (ADR-009 + ADR-012, `POST /api/cron/audit-purge`, daily 04:00 UTC). The `deleteMany` is intentionally global because `AuditEvent` rows have no `userId` column — `actorUserId` and `subjectUserId` are historical references (not FKs) per ADR-009. Endpoint is secured with `CRON_SECRET`. Idempotent.
  - **Exception**: `dispatchDoseReminders` in `lib/notifications/application/ReminderDispatcher.ts` is explicitly exempt — it is a system-level cron operation (ADR-012, `POST /api/cron/dose-reminders`, every 15 minutes). Its initial `ReminderPreference.findMany({ where: { enabled: true } })` scans all users by design so the dispatcher can decide per-user whether the local time window matches. Endpoint is secured with `CRON_SECRET`. All per-user follow-up reads (`PushSubscription.findMany`, `listProtocolsForUser`) are userId-scoped. The dedupe mutation (`ReminderPreference.update({ where: { userId } })`) is userId-scoped. Audit events use `actorUserId: 'SYSTEM'` with `subjectUserId: userId`.
  - **Exception**: `PushSubscriptionRepo.findByEndpoint` in `lib/notifications/infrastructure/PushSubscriptionRepo.ts` is explicitly exempt. `endpoint` is `@unique` on the model and identifies the device's Web Push channel globally. The lookup verifies ownership BEFORE overwriting: the calling service (`registerPushSubscription` in `lib/notifications/application/ReminderService.ts`) refuses writes when `existing.userId !== actor.userId` (throws `push_subscription_endpoint_owned_by_another_user`). Returns only `id`, `userId`, `endpoint` — no secrets. Same pattern as `AuthRepository.findByEmailForAuth`.

### Key Commands
| Task | Command |
|------|---------|
| Start Dev | `make dev` or `pnpm dev` |
| Production Build | `pnpm build` |
| Start Prod Server | `pnpm start` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Format | `pnpm format` |
| Format Check | `pnpm format:check` |
| Full Check | `make check` (Lint + Type + Test) |
| Unit Tests | `pnpm test` |
| Tests (watch) | `pnpm test:watch` |
| Test Coverage | `pnpm test:coverage` |
| Run Evals | `pnpm eval` |
| Run E2E | `pnpm e2e` |
| DB Setup | `make db-setup` or `pnpm db:setup` |
| DB Reset | `pnpm db:reset` |
| Prisma Dev Migration | `pnpm prisma:dev` |
| Prisma Deploy Migration | `pnpm prisma:deploy` |
| Prisma Generate | `pnpm prisma:generate` |
| Prisma Validate | `pnpm prisma:validate` |
| DB Seed | `pnpm db:seed` |

## Git & PR Workflow (9-step lifecycle + 4.5 PR review)
1. **Commit**: `type(scope): desc`.
2. **Review code (pre-push)**: `scaffold run review-code` (local MMR check).
3. **Rebase**: `git fetch origin main && git rebase origin/main`.
4. **Push**: `git push origin head`.
4.5. **Review PR (post-push, pre-merge)**: `scaffold run review-pr` (full MMR on the PR diff).
5. **Create**: `gh pr create --fill`.
6. **Auto-Merge**: `gh pr merge --auto --squash --delete-branch`.
7. **Watch**: `gh run watch` (Wait for CI success).
8. **Confirm**: verify merge in `main`; close the task.
9. **Log lessons**: if the PR surfaced a non-obvious learning, append a dated entry to `tasks/lessons.md`.

**Parallel sessions**: create worktree with `./scripts/setup-agent-worktree.sh <name>`.

## Project Rules & Memory
- **Rules**: Path-scoped conventions in `.claude/rules/`.
- **Memory**: Captured in `.claude/memory-graph.json` via MCP.
- **Lessons**: `tasks/lessons.md` — append a dated entry after any PR with a non-obvious learning.
- **Standards**: Reference `docs/coding-standards.md` and `docs/tdd-standards.md`.

## Doc Lookup Reference
| Question | Document |
|----------|----------|
| Branching/PR? | `docs/git-workflow.md` |
| System Design? | `docs/system-architecture.md` |
| API Contracts? | `docs/api-contracts.md` |
| Persistence? | `docs/database-schema.md` |
| Operations? | `docs/operations-runbook.md` |

<!-- scaffold:claude-md-optimization v1 2026-05-20 -->
<!-- scaffold:workflow-audit v1 2026-05-20 -->
