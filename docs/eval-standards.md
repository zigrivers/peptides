# Eval Standards

This document defines the scope and limitations of the automated eval suite.

## What Evals Check
- **Consistency**: Command documented in `CLAUDE.md` matches `package.json`.
- **Structure**: Files placed in correct feature slices (`lib/{module}`).
- **Adherence**: No bare `any` types; Zod validation in Actions; Scoped DB queries.
- **Coverage**: Every User Story AC has a corresponding test case in `docs/story-tests-map.md`.
- **Cross-Doc**: Internal links and file paths in docs are valid.
- **Architecture**: No circular dependencies; correct layer direction.
- **API**: Endpoint existence and method matching.
- **Security**: Auth middleware presence; no secrets in logs.
- **Database**: Migration coverage for all schema changes.
- **Accessibility**: Aria-live regions and tap target sizes in UI.

## What Evals Do NOT Check
- **Business Logic**: Evals check that a test *exists*, not that its logic is correct.
- **Visual Design**: Color palettes and typography are not verified by evals.
- **Network Resilience**: MTProto reconnection logic is tested in E2E, not evals.

## False-Positive Mechanism
If valid code triggers an eval failure, add the file path to `.evalignore` or use the `// @eval-disable-line [category]` comment.

## Command
Run all evals with:
```bash
pnpm eval
```
