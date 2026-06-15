# Dose-Logging UX: Friendly Inventory, Cadence, & Per-Dose Override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the raw `insufficient_inventory` error, let users add inventory inline (with auto-retry) and log a per-dose amount override, and show dose cadence on the tracker card.

**Architecture:** Domain humanizer extracted + reused; `DoseLogService` converts inventory shortfall to a non-blocking warning, honors a caller-supplied amount, and can bind a vial to a vial-less logged dose on retry; the action maps errors to friendly copy; `TrackerCalendar` shows cadence + warning + an editable dose field and reuses `AddActiveVialModal`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Prisma, Vitest, Decimal.js. Spec: `docs/superpowers/specs/2026-06-15-dose-log-inventory-and-overrides-design.md`.

**Conventions:** TDD (test first). `Decimal` for all dose math. Every mutation stays userId-scoped. Run `pnpm typecheck` + the touched test files per task; full `pnpm check` before finishing. Commit per task with `type(scope): desc`.

---

## File Structure

- **Create** `lib/tracker/domain/schedule.ts` — `formatScheduleFrequency(schedule)` humanizer (pure).
- **Create** `lib/tracker/domain/schedule.test.ts` — humanizer tests.
- **Modify** `app/(dashboard)/regimen/_components/RegimenClient.tsx`, `app/(dashboard)/tracker/protocols/new/_components/CreateProtocolForm.tsx` — use the shared humanizer.
- **Modify** `lib/tracker/application/DoseLogService.ts` — shortfall→warning, honor amount, re-bind vial on retry.
- **Modify** `app/actions/tracker/log-dose.ts` — friendly error mapping.
- **Modify** `app/(dashboard)/tracker/page.tsx` — pass `dryVials` + compounds list.
- **Modify** `app/(dashboard)/tracker/_components/TrackerCalendar.tsx` — cadence line, dose field, warning + modal + auto-retry.
- **Modify** matching `*.test.ts(x)` files for each.

---

## Task 1: Shared schedule-frequency humanizer

**Files:**
- Create: `lib/tracker/domain/schedule.ts`
- Test: `lib/tracker/domain/schedule.test.ts`
- Modify: `app/(dashboard)/regimen/_components/RegimenClient.tsx`, `app/(dashboard)/tracker/protocols/new/_components/CreateProtocolForm.tsx`

- [ ] **Step 1: Write the failing test** — `lib/tracker/domain/schedule.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { formatScheduleFrequency } from './schedule';

describe('formatScheduleFrequency', () => {
  it('Daily', () => expect(formatScheduleFrequency({ frequency: 'Daily' })).toBe('Daily'));
  it('TwiceDaily', () => expect(formatScheduleFrequency({ frequency: 'TwiceDaily' })).toBe('Twice daily'));
  it('EOD', () => expect(formatScheduleFrequency({ frequency: 'EOD' })).toBe('Every other day'));
  it('CustomInterval', () =>
    expect(formatScheduleFrequency({ frequency: 'CustomInterval', intervalDays: 3 })).toBe('Every 3 days'));
  it('CustomInterval of 1 day', () =>
    expect(formatScheduleFrequency({ frequency: 'CustomInterval', intervalDays: 1 })).toBe('Every day'));
  it('SpecificDaysOfWeek', () =>
    expect(formatScheduleFrequency({ frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Wed', 'Fri'] })).toBe('Mon, Wed, Fri'));
  it('TwiceSpecificDaysOfWeek', () =>
    expect(formatScheduleFrequency({ frequency: 'TwiceSpecificDaysOfWeek', daysOfWeek: ['Mon', 'Thu'] })).toBe('Twice daily on Mon, Thu'));
  it('empty specific days falls back gracefully', () =>
    expect(formatScheduleFrequency({ frequency: 'SpecificDaysOfWeek', daysOfWeek: [] })).toBe('Custom schedule'));
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run lib/tracker/domain/schedule.test.ts`
Expected: FAIL — `formatScheduleFrequency is not a function`.

- [ ] **Step 3: Implement** — `lib/tracker/domain/schedule.ts`

```ts
import type { Schedule } from './types';

/**
 * Succinct, human-readable cadence label for a protocol schedule.
 * Shared by the tracker card, the regimen list, and the protocol form.
 */
export function formatScheduleFrequency(schedule: Schedule): string {
  switch (schedule.frequency) {
    case 'Daily':
      return 'Daily';
    case 'TwiceDaily':
      return 'Twice daily';
    case 'EOD':
      return 'Every other day';
    case 'CustomInterval':
      return schedule.intervalDays === 1 ? 'Every day' : `Every ${schedule.intervalDays} days`;
    case 'SpecificDaysOfWeek': {
      const days = schedule.daysOfWeek ?? [];
      return days.length > 0 ? days.join(', ') : 'Custom schedule';
    }
    case 'TwiceSpecificDaysOfWeek': {
      const days = schedule.daysOfWeek ?? [];
      return days.length > 0 ? `Twice daily on ${days.join(', ')}` : 'Custom schedule';
    }
    default:
      return 'Custom schedule';
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm vitest run lib/tracker/domain/schedule.test.ts` → PASS.

- [ ] **Step 5: Replace the duplicated inline humanizers**

In `app/(dashboard)/regimen/_components/RegimenClient.tsx`: the local `formatScheduleText` (≈ lines 103–116) is consumed elsewhere in the file. Keep the function NAME and call sites, but make it delegate so wording is centralized — replace its body with:
```ts
function formatScheduleText(schedule: Schedule): string {
  return formatScheduleFrequency(schedule);
}
```
and add `import { formatScheduleFrequency } from '@/lib/tracker/domain/schedule';`.
Note: this file previously rendered `Daily → "Every day"`; the shared util returns `"Daily"`. That is an intentional, acceptable wording change. If any test asserts the old `"Every day"` string for `Daily`, update it to `"Daily"`.

Do the same in `app/(dashboard)/tracker/protocols/new/_components/CreateProtocolForm.tsx` (replace the `any`-typed `formatScheduleText` body with a delegating call; drop the `eslint-disable` line).

- [ ] **Step 6: Run affected tests + typecheck**

Run: `pnpm vitest run app/\(dashboard\)/regimen` and `pnpm typecheck`. Fix any `"Every day"`→`"Daily"` assertion drift. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/tracker/domain/schedule.ts lib/tracker/domain/schedule.test.ts app/\(dashboard\)/regimen/_components/RegimenClient.tsx "app/(dashboard)/tracker/protocols/new/_components/CreateProtocolForm.tsx"
git commit -m "refactor(tracker): extract shared formatScheduleFrequency humanizer"
```

---

## Task 2: Cadence on the tracker card

**Files:**
- Modify: `app/(dashboard)/tracker/_components/TrackerCalendar.tsx`
- Test: `app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx`

- [ ] **Step 1: Write the failing test** (add to the main describe block)

```tsx
it('shows the dose cadence on the route line', () => {
  render(
    <TrackerCalendar
      protocols={mockProtocols}
      doseLogs={mockDoseLogs}
      compounds={mockCompounds}
      initialDateISO="2026-05-24T00:00:00.000Z"
    />
  );
  // proto-1 is Daily, proto-2 is EOD (see mockProtocols).
  expect(screen.getAllByText(/Every other day/).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run app/\(dashboard\)/tracker/_components/TrackerCalendar.test.tsx -t "cadence"` → FAIL.

- [ ] **Step 3: Add `scheduleSummary` to the event type + populate it**

In `TrackerCalendar.tsx`:
- Add to `type CalendarEvent` (≈ line 22): `scheduleSummary?: string;`
- Import: `import { formatScheduleFrequency } from '@/lib/tracker/domain/schedule';`
- When building the **scheduled** events (the block that does `doseAmount: p.dose.amount` ≈ line 474–482), add `scheduleSummary: formatScheduleFrequency(p.schedule),`.
- When building the **logged/skipped** events from logs (the block ≈ line 442 with `doseAmount: log.amount.amount`), look up the owning protocol and add the summary. The component already maps `protocols`; resolve via a `protocolsById` map (build once with `React.useMemo`): `scheduleSummary: protocolsById[log.protocolId] ? formatScheduleFrequency(protocolsById[log.protocolId].schedule) : undefined,`.

- [ ] **Step 4: Render it on the route line**

Find where the route (e.g. `Subq`) renders in the card header (search `administrationRoute` / the route label near the compound name). Append the cadence:
```tsx
{e.scheduleSummary ? <span className="text-gray-400"> · {e.scheduleSummary}</span> : null}
```
Place it inline after the existing route text so it reads `Subq · Every other day`. Keep existing classes; only add the cadence span. If the route label is its own element, append the span as a sibling within the same line container.

- [ ] **Step 5: Run test + typecheck** → PASS. Run the full `TrackerCalendar.test.tsx` to confirm no regressions.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/tracker/_components/TrackerCalendar.tsx" "app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx"
git commit -m "feat(tracker): show dose cadence on the compound card"
```

---

## Task 3: Friendly error mapping in the log-dose action

**Files:**
- Modify: `app/actions/tracker/log-dose.ts`
- Test: `tests/acceptance/` (create `tests/acceptance/TRK-log-dose-action-errors.test.ts` if no action test exists; otherwise extend the existing one)

- [ ] **Step 1: Write failing tests** — mock `logDose` to throw, assert friendly messages.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: 'user-1' } })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const logDoseMock = vi.fn();
vi.mock('@/lib/tracker/application/DoseLogService', () => ({ logDose: (i: unknown) => logDoseMock(i) }));

import { logDoseAction } from '@/app/actions/tracker/log-dose';

const base = {
  protocolId: '11111111-1111-1111-1111-111111111111',
  amount: { amount: '15', unit: 'IU' as const },
  status: 'LOGGED' as const,
  injectionSite: { bodyPart: 'thigh', side: 'right' as const },
  scheduledDate: '2026-06-15',
};

describe('logDoseAction error mapping', () => {
  beforeEach(() => logDoseMock.mockReset());

  it('maps a raw insufficient_inventory throw to a friendly message', async () => {
    logDoseMock.mockRejectedValueOnce(new Error('insufficient_inventory'));
    const res = await logDoseAction(base);
    expect(res).toMatchObject({ ok: false, error: 'insufficient_inventory' });
    expect(res.ok === false && res.message).not.toMatch(/insufficient_inventory/);
    expect(res.ok === false && res.message.length).toBeGreaterThan(0);
  });

  it('maps an unknown error to a friendly generic, not the raw message', async () => {
    logDoseMock.mockRejectedValueOnce(new Error('TypeError: cannot read foo of undefined'));
    const res = await logDoseAction(base);
    expect(res).toMatchObject({ ok: false, error: 'unknown' });
    expect(res.ok === false && res.message).not.toMatch(/cannot read foo/);
  });

  it('returns warnings on success', async () => {
    logDoseMock.mockResolvedValueOnce({
      doseLog: { id: 'd1' },
      warnings: [{ code: 'insufficient_inventory', message: 'short' }],
    });
    const res = await logDoseAction(base);
    expect(res).toMatchObject({ ok: true });
    expect(res.ok === true && res.warnings?.[0]?.code).toBe('insufficient_inventory');
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/acceptance/TRK-log-dose-action-errors.test.ts`.

- [ ] **Step 3: Implement** — in `app/actions/tracker/log-dose.ts` catch block, before the final `unknown` return, add:
```ts
    if (/^insufficient_inventory/.test(msg)) {
      return { ok: false, error: 'insufficient_inventory', message: 'Not enough inventory to fully cover this dose. Add inventory to keep your stock accurate.' };
    }
```
Then change the terminal fallback from `message: msg` to a friendly generic:
```ts
    return { ok: false, error: 'unknown', message: 'Something went wrong logging this dose. Please try again.' };
```
Leave the already-mapped branches (future date, off-schedule, invalid site, site required, protocol not found / not active) untouched.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**
```bash
git add app/actions/tracker/log-dose.ts tests/acceptance/TRK-log-dose-action-errors.test.ts
git commit -m "fix(tracker): map dose-log errors to friendly messages, never leak raw codes"
```

---

## Task 4: DoseLogService — shortfall→warning, honor amount, re-bind on retry

**Files:**
- Modify: `lib/tracker/application/DoseLogService.ts`
- Test: existing `lib/tracker/application/DoseLogService.test.ts` (or `tests/acceptance/` if that is where its tests live — search first)

- [ ] **Step 1: Locate the existing DoseLogService test file** and read its mocking style (Prisma tx mock helpers). Add new tests beside the current ones. Search: `grep -rln "logDose" lib/tracker/application/*.test.ts tests/acceptance`.

- [ ] **Step 2: Write failing tests** for the four behaviors (use the file's existing tx-mock pattern; pseudocode shapes shown):

```ts
// a) Covering vial → decrements, no insufficient_inventory warning. (assert decrement called; warnings has no insufficient_inventory)
// b) Resolved vial cannot cover → logs (createDoseLog called), vialId stored null,
//    warnings contains { code: 'insufficient_inventory' }, and NO throw escapes logDose.
//    (Simulate by making decrementVialInventory throw new Error('insufficient_inventory').)
// c) Caller amount override: input.amount = { amount: '12', unit: 'IU' } while protocol.dose is 15 IU →
//    createDoseLog receives amount { amount: '12', unit: 'IU' }; decrement uses 12.
// d) Re-bind on retry: existing LOGGED dose with vialId null + a covering vial now available →
//    decrement called once and updateDoseLog sets vialId; a second identical call does NOT decrement again.
```

Mock `decrementVialInventory` from `@/lib/reconstitution/application/InventoryService` and `resolveActiveVial` from `@/lib/reconstitution/application/VialService` to control coverage.

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement — honor caller amount (new-log path, ≈ line 363)**

Replace:
```ts
  // Use the protocol's scheduled dose amount as the authoritative amount.
  const amount = protocol.dose;
```
with:
```ts
  // Default to the protocol's planned dose, but honor a caller-supplied per-dose override.
  // Override is amount-only: the unit must match the planned unit; the regimen is unchanged.
  const plannedAmount = protocol.dose;
  let amount = plannedAmount;
  if (input.amount && input.amount.unit === plannedAmount.unit) {
    const parsed = parseDoseAmountSum(input.amount.amount);
    if (parsed.isFinite() && parsed.gt(0)) {
      amount = input.amount;
    } else {
      throw new Error('invalid_input: dose amount must be a positive number');
    }
  } else if (input.amount && input.amount.unit !== plannedAmount.unit) {
    throw new Error('invalid_input: dose unit must match the protocol unit');
  }
```
(The action already maps `invalid_input`-style messages; add an `/invalid_input/` branch in the action if not already covered — verify and add a friendly "Enter a valid dose amount." mapping there.)

- [ ] **Step 5: Implement — shortfall→warning (new-log path, ≈ line 384–393)**

Wrap the decrement so a shortfall becomes a warning instead of a throw:
```ts
      let inventoryShort = false;
      if (input.status === 'LOGGED' && effectiveVialId) {
        try {
          await decrementVialInventory(
            innerTx, subjectUserId, effectiveVialId,
            parseDoseAmountSum(amount.amount), amount.unit, syringeStandard,
          );
        } catch (e) {
          if (e instanceof Error && /^insufficient_inventory$/.test(e.message)) {
            inventoryShort = true;
            effectiveVialId = undefined; // do not bind a vial we couldn't decrement
          } else {
            throw e;
          }
        }
      }
```
After the `createDoseLog` call (still inside the tx), if `inventoryShort` push the warning (note: `warnings` is declared in the outer scope ≈ line 247, so it is visible):
```ts
      if (inventoryShort) {
        warnings.push({
          code: 'insufficient_inventory',
          message: `Your active ${protocol.compoundName ?? 'compound'} vial couldn't cover this dose — inventory may be inaccurate.`,
        });
      }
```
If `protocol` has no `compoundName` field, use a neutral message: `"Your active vial couldn't cover this dose — inventory may be inaccurate."` (verify the protocol shape; prefer the compound name only if cheaply available).

Also unify the zero-vial message (≈ line 251) with this wording for consistency.

- [ ] **Step 6: Implement — re-bind vial on retry (existing-edit path, idempotency block ≈ line 270–282)**

Add a condition so a vial-less LOGGED dose is NOT treated as a no-op when a vial can now be resolved. Before the early-return `if`, compute:
```ts
    // A LOGGED dose with no backing vial can later acquire one when inventory is added.
    const canBindVial =
      existing.status === 'LOGGED' &&
      input.status === 'LOGGED' &&
      existing.vialId === null;
```
Add `&& !canBindVial` to the early-return guard. Then in the `oldStatus === 'LOGGED' && newStatus === 'LOGGED'` branch (≈ line 308), when `canBindVial` and `newVialId` is still null, resolve the active vial and, if found and it covers, decrement once and set `newVialId` so the subsequent `updateDoseLog` persists it. Guard the decrement in a try/catch identical to Step 5 (a still-short vial leaves it null + warning, no throw). Ensure `updateDoseLog` writes `vialId: newVialId`.

- [ ] **Step 7: Run new + existing DoseLogService tests + typecheck.** Expected: PASS. Confirm no existing test regressed (the amount/idempotency change is behavior-additive; fix any test that assumed input.amount was ignored).

- [ ] **Step 8: Commit**
```bash
git add lib/tracker/application/DoseLogService.ts lib/tracker/application/DoseLogService.test.ts
git commit -m "feat(tracker): inventory shortfall is a warning, honor per-dose amount, re-bind vial on retry"
```

---

## Task 5: Provide dry vials + compounds list to the calendar

**Files:**
- Modify: `app/(dashboard)/tracker/page.tsx`
- Modify: `app/(dashboard)/tracker/_components/TrackerCalendar.tsx` (add props)

- [ ] **Step 1: Add props to `TrackerCalendar`** — in `Props` (≈ line 45):
```ts
  /** Dry (un-reconstituted) vials for the add-inventory modal. */
  dryVials?: import('@/lib/reconstitution/application/VialService').SerializedVialData[];
  /** Compounds list for the add-inventory modal (id/name/profile/slug). */
  compoundOptions?: { id: string; name: string; slug: string; profile?: unknown }[];
```
Destructure with defaults `dryVials = []`, `compoundOptions = []`.

- [ ] **Step 2: Fetch + serialize on the page** — in `page.tsx`:
- Import `getDryVialsForUser, serializeVial` from `@/lib/reconstitution/application/VialService`.
- Add `getDryVialsForUser(userId)` to the existing `Promise.all` (or a follow-up `await`).
- Serialize: `const dryVials = dryVialRows.map(serializeVial);` (match how the reconstitution page serializes — check `ReconstitutionClient` data prep for the exact call signature of `serializeVial`).
- Build `compoundOptions` from the already-loaded `compoundsList`: `compoundsList.map(c => ({ id: c.id, name: c.name, slug: c.slug, profile: c.profile }))`.
- Pass `dryVials={dryVials}` and `compoundOptions={compoundOptions}` to `<TrackerCalendar … />`.

- [ ] **Step 3: Typecheck** — `pnpm typecheck`. Resolve `SerializedVialData` / `serializeVial` signature mismatches by reading `VialService.ts`. Expected: clean.

- [ ] **Step 4: Commit**
```bash
git add "app/(dashboard)/tracker/page.tsx" "app/(dashboard)/tracker/_components/TrackerCalendar.tsx"
git commit -m "feat(tracker): supply dry vials + compounds to the calendar for inline add-inventory"
```

---

## Task 6: Per-dose amount override field (UI)

**Files:**
- Modify: `app/(dashboard)/tracker/_components/TrackerCalendar.tsx`
- Test: `app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it('logs an overridden dose amount and shows the planned hint', async () => {
  render(
    <TrackerCalendar
      protocols={mockProtocols}
      doseLogs={mockDoseLogs}
      compounds={mockCompounds}
      initialDateISO="2026-05-24T00:00:00.000Z"
    />
  );
  // Expand the first scheduled dose card to reveal the log panel, then edit the dose field.
  // (Use the same expand interaction the other tests use — click the compound row / expand control.)
  const doseInput = await screen.findByLabelText(/dose/i);
  fireEvent.change(doseInput, { target: { value: '12' } });
  expect(screen.getByText(/Planned:/i)).toBeDefined();
  // Click Log Dose; assert logDoseAction was called with amount.amount === '12'.
  fireEvent.click(screen.getAllByRole('button', { name: /log dose/i })[0]);
  await waitFor(() =>
    expect(vi.mocked(logDoseAction)).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expect.objectContaining({ amount: '12' }) })
    )
  );
});
```
(`logDoseAction` is already mocked in this test file — confirm the existing `vi.mock` for `@/app/actions/tracker/log-dose`; if it returns `{ ok: true }`, this works. Reuse the existing expand interaction pattern from the “inline quick-logging” test ≈ line 242.)

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement the dose field**

- Add state mirroring `editNotes`: `const [editAmount, setEditAmount] = useState<Record<string, string>>({});`
- In the expanded log panel (where the site grid + notes render — same block the “inline quick-logging” test exercises), add, above Notes:
```tsx
<div className="space-y-1">
  <div className="flex items-center justify-between">
    <label htmlFor={`dose-${e.id}`} className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Dose</label>
    <span className="text-[10px] text-gray-400">Planned: {e.doseAmount} {e.doseUnit}</span>
  </div>
  <div className="flex items-center gap-2">
    <input
      id={`dose-${e.id}`}
      type="number"
      inputMode="decimal"
      min="0"
      step="any"
      value={editAmount[e.id] ?? e.doseAmount}
      onChange={(ev) => setEditAmount((p) => ({ ...p, [e.id]: ev.target.value }))}
      className="w-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-sm"
    />
    <span className="text-sm text-gray-500">{e.doseUnit}</span>
    {(editAmount[e.id] ?? e.doseAmount) !== e.doseAmount && (
      <button type="button" className="text-xs text-primary underline"
        onClick={() => setEditAmount((p) => { const c = { ...p }; delete c[e.id]; return c; })}>
        reset
      </button>
    )}
  </div>
  {(editAmount[e.id] ?? e.doseAmount) !== e.doseAmount && (
    <p className="text-[10px] text-amber-600 dark:text-amber-400">Logging {editAmount[e.id]} {e.doseUnit} (planned {e.doseAmount} {e.doseUnit})</p>
  )}
</div>
```
- In the log submit (the `handle…Save`/`logDoseAction` call ≈ line 797–805), use the edited amount:
```tsx
amount: { amount: (editAmount[event.id] ?? event.doseAmount), unit: event.doseUnit },
```
- Clear `editAmount[event.id]` on success alongside the existing `editNotes`/`editSite` cleanup. Also clear it in the offline-enqueue success path for consistency (offline uses `event.doseAmount`; acceptable to keep planned offline, but clear the override state).

- [ ] **Step 4: Run test + full file + typecheck** → PASS, no regressions.

- [ ] **Step 5: Commit**
```bash
git add "app/(dashboard)/tracker/_components/TrackerCalendar.tsx" "app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx"
git commit -m "feat(tracker): per-dose amount override in the log panel"
```

---

## Task 7: Inventory warning display + inline add-inventory modal + auto-retry

**Files:**
- Modify: `app/(dashboard)/tracker/_components/TrackerCalendar.tsx`
- Test: `app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it('shows a friendly insufficient-inventory warning with an Add inventory action', async () => {
  vi.mocked(logDoseAction).mockResolvedValueOnce({
    ok: true,
    doseLog: { id: 'newlog' } as never,
    warnings: [{ code: 'insufficient_inventory', message: "Your active vial couldn't cover this dose — inventory may be inaccurate." }],
  });
  render(<TrackerCalendar protocols={mockProtocols} doseLogs={mockDoseLogs} compounds={mockCompounds}
    initialDateISO="2026-05-24T00:00:00.000Z" dryVials={[]} compoundOptions={[{ id: 'compound-tirz', name: 'Tirzepatide', slug: 'tirzepatide' }]} />);
  // expand + click Log Dose for a scheduled dose
  fireEvent.click(screen.getAllByRole('button', { name: /log dose/i })[0]);
  expect(await screen.findByText(/inventory may be inaccurate/i)).toBeDefined();
  expect(screen.getByRole('button', { name: /add inventory/i })).toBeDefined();
});

it('opens the Add Vial modal prefilled with the compound when Add inventory is clicked', async () => {
  // same setup; after the warning shows, click "Add inventory" and assert the modal heading renders.
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement warning state + display**

- Add `const [logWarnings, setLogWarnings] = useState<Record<string, string>>({});`
- In the `logDoseAction` success branch (`if (result.ok)`), before `router.refresh()`:
```tsx
const invWarn = result.warnings?.find((w) => w.code === 'insufficient_inventory');
if (invWarn) setLogWarnings((p) => ({ ...p, [event.id]: invWarn.message }));
else setLogWarnings((p) => { const c = { ...p }; delete c[event.id]; return c; });
```
- Render (near the existing `logErrors[e.id]` display, but styled as a non-error notice — amber, not red):
```tsx
{logWarnings[e.id] && (
  <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
    <div className="space-y-1">
      <p>{logWarnings[e.id]}</p>
      <button type="button" className="font-semibold underline"
        onClick={() => setInventoryModalFor({ compoundId: e.compoundId, eventId: e.id })}>
        + Add inventory
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Implement modal + auto-retry**

- Add `const [inventoryModalFor, setInventoryModalFor] = useState<{ compoundId: string; eventId: string } | null>(null);`
- Import `AddActiveVialModal` from `@/app/(dashboard)/reconstitution/_components/AddActiveVialModal`.
- Near the component's modal/portal area (where `CompoundInfoModal` is rendered ≈ end of JSX), render:
```tsx
{inventoryModalFor && (
  <AddActiveVialModal
    compounds={compoundOptions.filter((c) => c.id === inventoryModalFor.compoundId).length
      ? compoundOptions.filter((c) => c.id === inventoryModalFor.compoundId)
      : compoundOptions}
    dryVials={dryVials}
    onClose={() => setInventoryModalFor(null)}
    onSuccess={() => {
      const target = selectedEvents.find((ev) => ev.id === inventoryModalFor.eventId);
      setInventoryModalFor(null);
      if (target) handleLogOrSkip(target, 'LOGGED'); // re-invoke the same log; service binds + decrements the new vial
    }}
  />
)}
```
Use the actual name of the inline log handler (the function wrapping `logDoseAction` — found ≈ line 715). Passing a single-compound `compounds` array makes the modal preselect it (verify against `AddActiveVialModal`'s compound-select default; if it doesn't auto-select a single option, set its initial `compoundId` — may require a small `initialCompoundId` prop, in which case add that prop to the modal and default its `useState`).

- [ ] **Step 5: Verify the modal auto-selects the compound**

Read `AddActiveVialModal.tsx` compound `<select>`/state init. If it doesn't preselect when one compound is passed, add an optional `initialCompoundId?: string` prop and seed `useState(initialCompoundId ?? '')`. Add a quick test that passing `initialCompoundId` preselects it. (Keep this change minimal and backward-compatible.)

- [ ] **Step 6: Run all TrackerCalendar + AddActiveVialModal tests + typecheck** → PASS.

- [ ] **Step 7: Commit**
```bash
git add "app/(dashboard)/tracker/_components/TrackerCalendar.tsx" "app/(dashboard)/tracker/_components/TrackerCalendar.test.tsx" "app/(dashboard)/reconstitution/_components/AddActiveVialModal.tsx" "app/(dashboard)/reconstitution/_components/AddActiveVialModal.test.tsx"
git commit -m "feat(tracker): inline add-inventory modal with auto-retry on insufficient inventory"
```

---

## Final verification (after all tasks)

- [ ] Run the full gate: `pnpm check` (guard:no-actions + lint + typecheck + test + prisma:validate). All green.
- [ ] Manual smoke (optional, dev server): a dose with no covering vial logs with the amber warning; **Add inventory** opens the modal preselected to the compound; on save the dose ends LOGGED with the warning cleared; the dose field overrides the logged amount; the card shows cadence on the route line.
- [ ] Dispatch a final holistic code review (subagent) over the whole branch diff before finishing.

## Self-review notes (author)
- Spec coverage: inventory shortfall→warning (T4), allow-with-warning (T4), inline modal + auto-retry (T7), cadence (T1/T2), dose override (T4 service + T6 UI), friendly errors (T3), data plumbing (T5). All covered.
- Type consistency: `formatScheduleFrequency(schedule: Schedule)` used in T1/T2; `scheduleSummary?: string` on `CalendarEvent`; `editAmount`/`logWarnings`/`inventoryModalFor` state names consistent across T6/T7; `compoundOptions`/`dryVials` props consistent across T5/T7.
- Watch-outs flagged inline: `Daily` wording change in T1; `serializeVial` signature in T5; modal compound preselect in T7; `invalid_input` mapping in T3/T4.
