# Dose-Units / Inventory Follow-ups — Remediation Plan

Three follow-up PRs addressing the caveats from the tracker-units + inventory work
(`tracker-dose-units-design.md`). Each is its own verified PR (`pnpm check` green; PR B also
`pnpm build`), merged sequentially **A → B → C**.

## PR A — Coverage tooling + cleanup (issues #1, #3)

- Install `@vitest/coverage-v8` (matches vitest 1.6) and add a `coverage` block to
  `vitest.config` (v8 provider) with **100% branch/function/line thresholds for
  `lib/reconstitution/**` and `lib/audit/**`**, report-only globally.
- Add a **`pnpm check:coverage`** script (the fast pre-push `pnpm check` stays coverage-free).
- Run it, close real gaps, and `/* c8 ignore */` the genuinely unreachable defensive
  divide-by-zero guards in `getInventorySummaryByCompound` (VialService.ts) — kept for safety,
  each with a "unreachable with validated positive doses" comment.
- Make `getInventorySummaryByCompound`'s `await import('./InventoryService')` a static import
  (no real cycle).

## PR B — Next/React RC → stable (issue #2) — **ATTEMPTED, DEFERRED**

Outcome of the attempt (2026-06-02): upgrading to `next@15.5.19`/`15.1.8` + `react@19.2`
**did clear the `useContext` prerender errors** and passed `pnpm check` (after the
`unstable_after → after` rename and making one page's `searchParams` a Promise). **But** stable
Next 15.x then hard-fails `pnpm build` (exit 1) on the framework `/404`/`/_error` pages with
`<Html> should not be imported outside of pages/_document` — a Next-internal error with **no
source cause** (no `next/document` import, no `next.config`, no `pages/`). It persisted across
cache-clear, `force-dynamic`, explicit `app/not-found.tsx` + `app/global-error.tsx`, and two Next
patches (15.1.8 and 15.5.19). It is a structural interaction between this app's **dynamic root
layout** (`cookies()`/`auth()`) and Next 15's static error-page generation.

**Decision:** reverted the upgrade. The RC build currently **exits 0** (the `useContext` lines are
non-fatal log noise; CI's Build step passes on RC), so `main` stays deployable. The stable upgrade
is the right long-term fix but needs **dedicated investigation** of the `/404` `<Html>` build
failure (candidate angles: refactor the root layout so it isn't request-dynamic for error routes,
or track the upstream Next issue). Re-attempt as its own focused effort — do **not** bundle with
other work.

## PR C — Managed-user inventory support (issue #4)

- Add a subject selector to the reconstitution page (self or a managed user via
  `getManagedUserIds`); plumb `subjectUserId` through `getVialsForUser` / `getDryVialsForUser` /
  `getInventorySummaryByCompound` / `listProtocolsForUser`. `setActiveVialAction` already
  accepts a subject. Tests for the subject-scoped fetches + the selector. The PR A coverage gate
  guards the new `lib/reconstitution` branches.

## PR D — Close remaining reconstitution coverage debt (OPEN)

Logged 2026-06-15 while adding the reconstitution syringe-units preview. PR A added the
`check:coverage` gate and 100% thresholds for `lib/reconstitution/domain/**`, but the gate is
**currently red** and was confirmed pre-existing (not introduced by the preview work):

- **`lib/reconstitution/domain/doseUnits.ts`** — an uncovered branch (~`loggedDoseMcg`, around
  the mL/IU reconstruction path) leaves the domain below its 100% branch threshold. Add the
  missing-branch test(s), or `/* c8 ignore */` the genuinely unreachable arm with a justifying
  comment (same pattern as the `getInventorySummaryByCompound` guards).
- **`lib/reconstitution/application/**`** — still floored at `branches: 80, functions/lines/
  statements: 90` (see `vitest.config.ts`), i.e. the "ratchet toward 100%" from PR A is
  incomplete. Cover the error paths in `InventoryService` / `VialExpiryService` / `VialService`
  (e.g. divide-by-zero / not-found / depleted branches), then raise the thresholds.
- Note: a `check:coverage` run also surfaces intentional `chk_*` CHECK-constraint errors from the
  REF dosing-protocol negative tests — those are expected test output, not failures; don't chase
  them. Confirm the integration DB is set up (`make db-setup`) so application coverage isn't
  understated by skipped DB tests.

**Goal:** `pnpm check:coverage` green with `lib/reconstitution/domain/**` at 100% and the
`application/**` thresholds ratcheted up toward 100%. Its own verified PR; not bundled with
feature work. (`check:coverage` is intentionally NOT in the pre-push `pnpm check`, so this debt
does not block merges — but it should be paid down so the safety-net gate is trustworthy.)

## Sequencing & risk

- **A → B → C.** A first (coverage safety net for B and C). B and C are independent; A precedes
  C so C's new aggregate branches are coverage-checked.
- **D** is independent and low-risk (tests + threshold bumps only); do it whenever, ideally before
  leaning on `check:coverage` as a release gate.
- Lowest risk: A, C, D. Highest: B (dependency upgrade) — isolated so it can be reverted cleanly.
