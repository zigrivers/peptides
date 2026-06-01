# ADR-016: Local-First CI (No GitHub Actions)

## Status
Accepted — 2026-06-01

## Context
CI ran on **GitHub Actions** (`.github/workflows/ci.yml`, the `quality` job: lint →
typecheck → schema validate → build → migrations → unit/integration tests → Playwright
E2E → eval). On the current GitHub plan this repeatedly **exhausted the account's
Actions minutes**. The minute-heavy steps are `playwright install --with-deps`,
`pnpm build`, `prisma migrate deploy`, and `pnpm eval`.

Two facts make Actions non-essential here:
- **Deploys do not use Actions.** Railway auto-deploys on push to `main` (ADR-006);
  migrations run in the Railway start command. Superseding the CI/CD note in
  `tech-stack.md` §8.3, no deploy path depends on Actions.
- The repo had **no enforced branch protection** requiring the CI check, so PRs were
  already merging past red CI — the gate was advisory, not blocking.

## Decision
**Remove GitHub Actions entirely and run CI locally via a `pre-push` git hook.**

- The hook lives at `.githooks/pre-push` and is activated by the package.json
  `prepare` script (`git config core.hooksPath .githooks`) on `pnpm install` — no
  extra dependency (chosen over Husky/lefthook for a solo project).
- The hook runs `pnpm check` = `guard:no-actions` + lint + typecheck + test +
  prisma validate. Integration tests need a local Postgres (`make db-setup`).
- **Slow gates stay manual:** `pnpm e2e`, `pnpm eval`, `pnpm build` are run on demand
  before merging, not on every push (they are the minute hogs and the latency tax).
- **Guardrail:** `scripts/no-github-actions.mjs` (`pnpm guard:no-actions`, wired into
  `pnpm check`) fails if any `.github/workflows/*.yml` reappears, so Actions cannot
  silently return. Reinforced by `.claude/rules/no-github-actions.md`.
- **Repo setting:** Actions is additionally disabled at the repository level (manual
  one-time step, see Consequences).

## Alternatives Considered
- **Minimal Actions workflow (lint + typecheck + unit only):** keeps a server-side net
  while cutting ~90% of minute usage (drops Playwright/build/migrations/eval). Rejected
  for now because the goal is zero Actions usage; this remains the preferred fallback
  if a remote check is ever wanted again (requires owner sign-off).
- **Husky / lefthook:** managed hook runners with nicer config. Rejected to avoid a new
  dependency; native `core.hooksPath` is sufficient.
- **Keep Actions, upgrade the plan / add caching:** spends money or only defers the
  minute ceiling; doesn't address the stated goal.

## Consequences
- **Benefits:** zero Actions minutes; fast local feedback; deploys unaffected (Railway).
- **Costs / risks:**
  - The pre-push hook is **bypassable** with `git push --no-verify`; gating now depends
    on contributor discipline. Acceptable for a solo/Railway project.
  - E2E and eval no longer run automatically on every change — they must be run
    manually before merging the relevant work.
  - A fresh clone must run `pnpm install` once to activate the hook (the `prepare`
    script). Document this in onboarding.
- **Manual repo step (owner):** disable Actions at the repository level as
  belt-and-suspenders:
  ```
  gh api -X PUT repos/zigrivers/peptides/actions/permissions \
    -F enabled=false
  ```
  (Or GitHub → repo **Settings → Actions → General → Disable actions**.)

## Traces
- ADR-006 (Railway hosting — the actual deploy path).
- ADR-008 (testing strategy — gates now run locally).
- `tech-stack.md` §8.3 (CI/CD — updated to reflect local-first CI).
- `.claude/rules/no-github-actions.md`, `scripts/no-github-actions.mjs`,
  `.githooks/pre-push`.
