# Implementation Playbook

This is the operational manual for AI agents working on the **Peptides** project. Follow these rules and loops for every task to ensure consistency and quality.

---

## 1. The Autonomous TDD Loop (8 Steps)

Every task must follow this execution loop. Do not skip steps.

1. **Read Context**: Read `docs/onboarding-guide.md` once, then read the specific docs listed in the task's "Context" block.
2. **Setup Branch**: `git checkout -b feat/task-name` or `fix/task-name`.
3. **Write Test**: Implement the pending test skeleton in `tests/acceptance/` or create a colocated `*.test.ts`.
4. **Implement**: Write the minimal code to pass the test, following the `CLAUDE.md` principles.
5. **Verify Local**: Run `make check` (Lint + Type + Test).
6. **Automated Review**: Run `scaffold run review-code` (MMR). Fix all P0/P1 findings.
7. **Submit PR**: `gh pr create --fill`.
8. **Merge & Cleanup**: `gh pr merge --auto --squash` -> `git checkout main` -> `git pull`.

---

## 2. Coding Standards

### 2.1 Precision & Safety
- **Decimal Only**: Use `Decimal` for all math. `Float` usage triggers a **P0** review failure.
- **Audit Logging**: Wrap all mutations in a transaction with an `AuditEvent`. Use the `withAudit` helper.
- **Auth Scoping**: Every query must include `where: { userId: session.user.id }`.

### 2.2 Directory Conventions
- **Feature Slices**: Logic lives in `lib/{module}/{domain|application|infrastructure}/`.
- **Colocation**: UI components live in `app/**/_components/`.
- **Barrels**: Export public APIs via `index.ts` in each slice.

---

## 3. Inter-Agent Handoff Protocol

When passing work between sessions or agents, provide a `HANDOFF.md` with:

- **Status**: Current wave and task ID.
- **Summary**: What was implemented in the last session.
- **Gotchas**: Any non-obvious architecture or environment issues encountered.
- **Next Steps**: The very next task on the critical path.

---

## 4. Quality Gates

| Gate | Command | Purpose |
|------|---------|---------|
| **Lint** | `pnpm lint` | Ensure style consistency. |
| **Typecheck** | `pnpm typecheck` | Catch type errors. |
| **Eval** | `pnpm eval` | Verify adherence to project standards. |
| **Unit** | `pnpm test` | Verify domain logic. |
| **E2E** | `pnpm e2e` | Verify critical user journeys. |

---

## 5. Execution Order (Critical Path)

1. **Wave 1 (Foundation)**: Task 1.1 (Auth) -> 1.3 (Audit) -> 1.4 (Math).
2. **Wave 2 (Pillars)**: Task 2.1 (Catalog) -> 2.2 (Protocol) -> 2.3 (Logging).
3. **Wave 3 (Ordering)**: Task 3.1 (MTProto) -> 3.3 (Dispatch) -> 3.4 (Safety Gate).
4. **Wave 4 (Scale)**: Task 4.2 (Analytics) -> 4.3 (Reminders).

---

## 6. Task Context Reference

Before starting a task, you MUST read these documents:

| Task Area | Mandatory Docs |
|-----------|----------------|
| **Auth** | `docs/adrs/ADR-004-authjs.md`, `docs/domain-models/auth.md` |
| **Tracker** | `docs/domain-models/tracker.md`, `docs/ux-spec.md` (Section 2.1) |
| **Ordering** | `docs/adrs/ADR-005-gramjs.md`, `docs/api-contracts.md` (Section 5) |
| **Math** | `docs/domain-models/reconstitution.md`, `docs/tdd-standards.md` |

---

## 7. Rollback Procedures

If a task introduces a regression that cannot be fixed in 15 minutes:
1. `git checkout main`
2. `git branch -D <feature-branch>`
3. Notify the next agent via `HANDOFF.md` that the task was reverted.
