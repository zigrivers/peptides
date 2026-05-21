# Project Lessons

This file tracks architectural and process learnings for future agents. Append a dated section after every PR that surfaced a non-obvious lesson worth carrying forward. Keep entries terse — one or two sentences each; link to the related ADR, PR, or incident.

## 2026-05-20

- **Precision**: Math must use `Decimal` (per `.claude/rules/safety-math.md`); floating point leads to rounding errors in dose calculations. Vitest config enforces 100% branch coverage on `lib/reconstitution` and `lib/audit`.
- **Session Persistence**: Always-on containers (Railway) are required for stable MTProto sessions — serverless does not work for this app (ADR-006). Cron jobs run on Railway Cron (ADR-012).
- **Audit immutability**: Hard gate for immutable audit logs on all protocol mutations, order events, and admin actions. `actor_user_id` and `subject_user_id` are intentionally non-FK historical references that survive user deletion (ADR-009).
- **Resolution-log discipline**: A repeated finding during the 2026-05-20 review batch was prior reviews marking findings as RESOLVED when the actual artifact had not been updated. Future review work must verify the artifact state matches the resolution-log entry before closing.

## 2026-05-21 (Task 1.6b)

- **Next.js App Router cache invalidation**: After a Server Action mutates state that affects an RSC page, call `revalidatePath('/target-path')` in the action — otherwise users can see stale RSC-rendered content until a hard refresh.
- **UX spec is the authoritative source for dismiss behavior**: If the spec says a component "persists until X", don't add a dismiss button without re-reading the spec. A dismiss button on the GettingStartedChecklist contradicted "persists until 100% complete" — three MMR channels flagged the resulting dead loop.
- **`next/cache` must be mocked in vitest tests**: Importing `revalidatePath` from `next/cache` in a Server Action will cause tests to throw `system_error` unless `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))` is added.

## 2026-05-21 (Task 2.1)

- **Global reference data needs an explicit userId-scoping exception in AGENTS.md**: MMR will P0-flag any Prisma query without `userId` scoping unless the exception is documented in AGENTS.md (not just CLAUDE.md — Codex reads AGENTS.md as review context). Add the exception before the first MMR run to avoid repeated P0 findings.
- **Prisma migration safety for new non-nullable columns**: Add the column nullable → backfill existing rows → set NOT NULL → add unique index. Adding NOT NULL with a default empty string on a table with existing rows will fail when adding a unique index (all rows share the same default). The correct SQL uses multiple steps including a REGEXP_REPLACE backfill.
- **`Prisma.CompoundGetPayload<{include: ...}>` prevents type drift**: Use the generated payload type instead of a manually duplicated interface — it stays in sync with schema changes automatically and the mapper functions only need to handle `JsonValue` → domain type coercions.
- **MMR channels cache PR diffs**: After pushing fixes, if a reviewer still flags an already-fixed issue, it is reading a stale diff. Verify the file is correct locally, don't re-fix it; add a known-false-positive entry in AGENTS.md if the finding will recur.
