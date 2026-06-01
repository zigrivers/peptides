# Git Workflow

**Status:** Draft  
**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5

---

## 1. Branching Strategy

We follow a strict **One Task = One Branch = One PR** model to enable parallel AI agent work without merge conflicts.

- **Main Branch**: `main` (Always deployable, branch-protected).
- **Feature Branches**: `<type>/<task-desc>` (e.g., `feat/dose-logging`, `fix/calc-rounding`).
- **Cleanup**: Delete branches immediately after squash-merge.

---

## 2. Commit Standards

We use **Conventional Commits** to automate changelog generation.

**Format**: `type(scope): description`

| Type | Use Case |
|------|----------|
| `feat` | A new user-facing feature. |
| `fix` | A bug fix. |
| `docs` | Documentation changes only. |
| `refactor` | Code change that neither fixes a bug nor adds a feature. |
| `test` | Adding or correcting tests. |
| `chore` | Build process or auxiliary tool changes. |

---

## 3. PR Workflow (9-step lifecycle + 4.5 PR review)

All agents must follow this sequence for every task:

1. **Commit**: `git commit -m "feat(module): description"`
2. **AI review (pre-push)**: `scaffold run review-code` (local MMR check on the working tree before push)
3. **Rebase**: `git fetch origin main && git rebase origin/main`
4. **Push**: `git push origin head` — the `pre-push` hook runs `pnpm check` locally (the CI gate; see §5)
4.5. **AI review (post-push, pre-merge)**: `scaffold run review-pr` (full MMR on the PR diff against `main`)
5. **Create**: `gh pr create --fill`
6. **Merge**: `gh pr merge --squash --delete-branch` (no remote check to wait on)
7. **Confirm**: verify merge in `main` and close the task
8. **Log lessons**: if the PR surfaced a non-obvious learning, append a dated entry to `tasks/lessons.md`

---

## 4. Worktree Awareness (Parallel Sessions)

For running multiple agents simultaneously, use **Git Worktrees**.

```bash
# Create a dedicated workspace for an agent
./scripts/setup-agent-worktree.sh agent-name
```

**Conflict Prevention Rules**:
- Never assign two agents to tasks touching the same files.
- Each agent MUST work in its own worktree and its own branch.
- Rebase frequently to catch upstream changes early.

---

## 5. CI: Local-First (No GitHub Actions)

This project **does not use GitHub Actions** (ADR-016). CI runs **locally** via the
`.githooks/pre-push` hook, activated by the `prepare` script on `pnpm install`
(`git config core.hooksPath .githooks`). After a fresh clone, run `pnpm install` once.

**Pre-push gate** — `pnpm check` (blocks the push on failure):
1. **Guard**: `pnpm guard:no-actions` — fails if any `.github/workflows/*.yml` exists.
2. **Lint**: `pnpm lint` (ESLint + Prettier).
3. **Typecheck**: `pnpm typecheck` (`tsc --noEmit`).
4. **Unit/Integration**: `pnpm test` (coverage gates per ADR-008; needs a local Postgres — `make db-setup`).
5. **Schema validate**: `pnpm prisma:validate`.

**Manual gates** (run before merging when relevant; deliberately not in the hook because
they are slow / were the Actions minute hogs):
- **Build**: `pnpm build`.
- **E2E**: `pnpm e2e` (Playwright).
- **Eval**: `pnpm eval` (LLM-bearing prompts vs. gold-standard fixtures).

Emergency bypass of the hook (you own the consequences): `git push --no-verify`.

---

## 6. Agent Crash Recovery

If a Claude Code session crashes or hangs:
1. Identify the worktree/branch.
2. `git worktree remove --force agent-name`.
3. Re-run `scripts/setup-agent-worktree.sh` to resume if the branch was pushed.
4. If not pushed, the branch remains in the main repository; check out and resume.

---

## 7. Merge Discipline

There is **no GitHub Actions status check** to gate merges (ADR-016); the quality gate
is the local `pre-push` hook (§5). Discipline is therefore convention, not enforcement:

- **Run the gate before pushing** — `pnpm check` runs automatically via the pre-push
  hook; do not routinely `--no-verify`.
- **Squash merge only**: `gh pr merge --squash --delete-branch`.
- **Resolve review conversations before merge.**
- **Avoid direct pushes to `main`**; branch and PR even for small changes.
