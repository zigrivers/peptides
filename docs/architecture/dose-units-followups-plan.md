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

## PR B — Next/React RC → stable (issue #2)

- Bump `next` `15.0.0-rc.0 → 15.x` stable and `react`/`react-dom` `19.0.0-rc.0 → 19` stable
  (own PR). Verify `pnpm check` **and `pnpm build`** — the `useContext` static-prerender errors
  should clear. Address minor RC→stable migration deltas; if the upgrade is unexpectedly hairy,
  fall back to `export const dynamic = 'force-dynamic'` on the auth-gated pages that fail
  prerender rather than block.

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
