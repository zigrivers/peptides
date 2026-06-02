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

## Sequencing & risk

- **A → B → C.** A first (coverage safety net for B and C). B and C are independent; A precedes
  C so C's new aggregate branches are coverage-checked.
- Lowest risk: A, C. Highest: B (dependency upgrade) — isolated so it can be reverted cleanly.
