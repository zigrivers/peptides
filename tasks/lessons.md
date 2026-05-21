# Project Lessons

This file tracks architectural and process learnings for future agents. Append a dated section after every PR that surfaced a non-obvious lesson worth carrying forward. Keep entries terse — one or two sentences each; link to the related ADR, PR, or incident.

## 2026-05-20

- **Precision**: Math must use `Decimal` (per `.claude/rules/safety-math.md`); floating point leads to rounding errors in dose calculations. Vitest config enforces 100% branch coverage on `lib/reconstitution` and `lib/audit`.
- **Session Persistence**: Always-on containers (Railway) are required for stable MTProto sessions — serverless does not work for this app (ADR-006). Cron jobs run on Railway Cron (ADR-012).
- **Audit immutability**: Hard gate for immutable audit logs on all protocol mutations, order events, and admin actions. `actor_user_id` and `subject_user_id` are intentionally non-FK historical references that survive user deletion (ADR-009).
- **Resolution-log discipline**: A repeated finding during the 2026-05-20 review batch was prior reviews marking findings as RESOLVED when the actual artifact had not been updated. Future review work must verify the artifact state matches the resolution-log entry before closing.
