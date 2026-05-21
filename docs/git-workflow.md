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
4. **Push**: `git push origin head`
4.5. **AI review (post-push, pre-merge)**: `scaffold run review-pr` (full MMR on the PR diff against `main`)
5. **Create**: `gh pr create --fill`
6. **Auto-merge**: `gh pr merge --auto --squash --delete-branch`
7. **Watch**: `gh run watch` (wait for CI success)
8. **Confirm**: verify merge in `main` and close the task
9. **Log lessons**: if the PR surfaced a non-obvious learning, append a dated entry to `tasks/lessons.md`

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

## 5. CI Pipeline

The CI pipeline runs on every push and PR. Source of truth: `.github/workflows/ci.yml`. Authoritative stage list also documented in `docs/operations-runbook.md` §1.1.

**Jobs** (in order):
1. **Lint**: `pnpm lint` (ESLint + Prettier).
2. **Typecheck**: `pnpm typecheck` (`tsc --noEmit`).
3. **Schema validate**: `pnpm prisma:validate`.
4. **Build**: `pnpm build` (validates Next.js build + `prisma generate`).
5. **Unit/Integration**: `pnpm test` (with coverage gates per ADR-008).
6. **E2E**: `pnpm e2e` (Playwright against the production build on both `chromium` and `webkit` viewports).
7. **Eval**: `pnpm eval` (LLM-bearing prompts evaluated against gold-standard fixtures; threshold-blocking on miss).

---

## 6. Agent Crash Recovery

If a Claude Code session crashes or hangs:
1. Identify the worktree/branch.
2. `git worktree remove --force agent-name`.
3. Re-run `scripts/setup-agent-worktree.sh` to resume if the branch was pushed.
4. If not pushed, the branch remains in the main repository; check out and resume.

---

## 7. Branch Protection

- **Required**: Status checks (CI) must pass.
- **Required**: Squash merge only.
- **Required**: Conversation resolution before merge.
- **Prohibited**: Direct push to `main`.
