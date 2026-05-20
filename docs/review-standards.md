# Review Standards

**Status:** Draft  
**Date:** 2026-05-20  
**Methodology:** deep | Depth: 5/5

---

## 1. Severity Levels

| Severity | Definition | Action |
|----------|------------|--------|
| **P0** | Blocks merge. Critical logic, security, or safety error. | Must fix before merge. |
| **P1** | Major finding. Gaps in TDD, invariants, or PRD coverage. | Should fix before merge. |
| **P2** | Improvement. Suggestion for better naming or patterns. | Fix if time permits. |
| **P3** | Nitpick. Style or formatting preference. | Non-blocking. |

---

## 2. Review Criteria

### 2.1 Security & Safety
- **Auth**: Every database query must be scoped by `userId`.
- **Precision**: Math must use `Decimal`. 100% test coverage for `lib/reconstitution`.
- **Secrets**: No API keys or tokens in logs/code.

### 2.2 TDD & Coverage
- **Unit**: All pure logic must have a unit test.
- **E2E**: Critical paths (Payment, Sync) must have a Playwright spec.
- **Audit**: Mutations must record an `AuditEvent`.

### 2.3 Architecture & Style
- **Colocation**: Files must live in the correct feature slice.
- **Naming**: Consistent `camelCase` / `PascalCase` usage.
- **Imports**: Correct alias usage (`@/*`).

---

## 3. Review Process
1. **Trigger**: After creating a PR, run `scaffold run review-pr`.
2. **Reconcile**: MMR combines findings from Codex, Gemini, and Claude.
3. **Fix**: Address all P0 and P1 findings.
4. **Verify**: Re-run review to confirm fixes.
