# Plan: MMR Round-22 Cleanup — Remove Unused Variable

## Goal
Remove the unused `recentDuplicate` variable from the `force=true` sendOrder test so PR #25 passes MMR round-23 and lint.

## Non-goals
No logic changes, no new tests, no refactoring.

## Files Expected to Change
- `tests/acceptance/ORD-ordering.test.ts` — remove line 1097 only

## Steps

### Step 1: Remove the unused variable
In `tests/acceptance/ORD-ordering.test.ts`, find and remove the declaration on line 1097:
```
const recentDuplicate = { id: 'order-0', sentAt: new Date(), messageText: 'same' };
```

Context for uniqueness — it appears inside the describe/it block for the `force=true` AC:
```typescript
    it('AC-3: sendOrder proceeds past 60s duplicate check when force=true', async () => {
      // ... setup ...
      const recentDuplicate = { id: 'order-0', sentAt: new Date(), messageText: 'same' };
      // line above must be removed — it is never referenced
```

Only line 1097 should be removed. Line 1054 (which IS used at line 1058) must be left untouched.

### Step 2: Verify the fix
```bash
pnpm lint
pnpm typecheck
pnpm test
```
Expected: 0 lint errors, 0 type errors, 426 passing tests, 23 todo.

## Acceptance Criteria
- `pnpm lint` exits 0
- `pnpm typecheck` exits 0
- `pnpm test` shows 426 passing, 23 todo, 0 failing

## Rollback
```bash
git checkout tests/acceptance/ORD-ordering.test.ts
```

## Risks
None — removing a dead assignment has no runtime effect.
