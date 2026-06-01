# No GitHub Actions

This project **does not use GitHub Actions** and must not reintroduce it. CI runs
**locally**, via a `pre-push` git hook. Rationale and full decision: ADR-016.

## Rules
- **Never add files under `.github/workflows/`.** A guard (`pnpm guard:no-actions`,
  wired into `pnpm check` and the pre-push hook) fails the build if any
  `.github/workflows/*.yml` reappears.
- The quality gate is `pnpm check` (`guard:no-actions` + lint + typecheck + test +
  prisma validate), enforced by `.githooks/pre-push`. Activated by the `prepare`
  script (`git config core.hooksPath .githooks`) on `pnpm install`.
- Slow gates (`pnpm e2e`, `pnpm eval`, `pnpm build`) are **manual** — run them before
  merging when relevant; they are deliberately not in the pre-push hook.
- Deploys are **Railway auto-deploy on push to `main`** (not Actions); migrations run
  in the Railway start command. Nothing here depends on Actions.
- Do not reference `gh run watch` or "wait for CI" in workflows/docs — there is no
  remote CI to watch. Merges are not gated on a GitHub check.

## If a server-side check is ever wanted again
Prefer the minimal option discussed in ADR-016 (lint + typecheck + unit only) over the
full pipeline, and get explicit owner sign-off first — Actions minute budget is the
reason this rule exists.
