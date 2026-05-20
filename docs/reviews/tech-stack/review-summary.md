# Tech Stack — Multi-Model Research Summary

**Date:** 2026-05-20
**Artifact:** `docs/tech-stack.md`
**Status:** COMPLETE

## Models Used

| Model | Status | Notes |
|-------|--------|-------|
| Claude (Sonnet 4.6) | Complete | Primary research pass; all 12 open decisions covered |
| Gemini CLI | Complete | 12 recommendations produced; output saved to gemini-review.json |
| Codex CLI | Failed | `codex exec` requires a git repository; project directory is not a git repo; exit 1 |

**Degraded-mode note:** Codex failed (not a git repo constraint). Gemini + Claude = 2-model synthesis. Maximum gate verdict: degraded-pass.

---

## Consensus Findings

Both Claude and Gemini agreed on 10 of 12 decisions:

| # | Decision | Choice | Confidence |
|---|----------|--------|------------|
| 1 | PWA / Service Worker | Serwist | High |
| 2 | Push Notifications | web-push + VAPID | High |
| 3 | Email Provider | Resend + React Email | High |
| 4 | Charts | shadcn/ui Charts (Recharts) | High |
| 5 | Scheduled Jobs | Railway cron → Next.js API route | High |
| 6 | Error Monitoring | Sentry (free tier) | High |
| 7 | Testing | Vitest (unit) + Playwright (E2E) | High |
| 8 | Validation | Zod 3.x | High |
| 9 | State Management | RSC + Server Actions + TanStack Query | High |
| 10 | Client Forms | React Hook Form + Zod resolver | High (implicit consensus) |

---

## Divergent Findings (User Decision Not Required — Resolved)

Two decisions diverged between Claude and Gemini. Both were resolved in the tech-stack document with explicit rationale.

### Divergence 1 — Authentication Library

| Model | Recommendation | Rationale |
|-------|---------------|-----------|
| Gemini | Better Auth (v0.x) | TypeScript-native; spiritual successor to Lucia Auth; Prisma adapter; AI-native docs |
| Claude | Auth.js v5 (NextAuth) | Largest training corpus; most AI-generated examples; mature Next.js integration |

**Resolution:** Auth.js v5 chosen. Better Auth is technically superior in design but has significantly less AI training coverage. For a solo dev whose primary tool is Claude Code, AI-assisted development velocity is a hard criterion. Auth.js v5 generates more accurate boilerplate on first attempt. Better Auth is noted as the upgrade path if Auth.js v5 causes issues.

### Divergence 2 — Telegram MTProto Client

| Model | Recommendation | Rationale |
|-------|---------------|-----------|
| Gemini | mtcute | Modern TypeScript-native API; better maintained; cleaner architecture |
| Claude | GramJS (`telegram` npm) | ~3M weekly downloads; most battle-tested; most AI training examples; StringSession well-documented |

**Resolution:** GramJS chosen. mtcute is architecturally cleaner but has ~30x fewer weekly downloads and significantly less real-world session management documentation and AI training data. The MTProto layer is already medium-complexity for AI assistance; the established library wins. mtcute noted as the v2 upgrade path.

---

## Additional Decisions (Claude-Only)

Gemini covered the 12 prompted open decisions. Claude identified and resolved additional decisions not in the dispatch prompt:

| Decision | Choice | Notes |
|----------|--------|-------|
| Node.js version | 22 LTS | Long-term support through April 2027 |
| Package manager | pnpm 9.x | Faster installs; strict dependency resolution |
| Date handling | date-fns 3.x + date-fns-tz | UTC storage + local display (PRD §8.8) |
| MTProto session encryption | Node.js crypto (AES-256-GCM) | No additional dependency; AES-256 at rest per PRD §8.2 |
| Object storage (async exports) | Cloudflare R2 | Free egress; S3-compatible; for exports > 10MB |
| CI/CD | GitHub Actions | Standard; Railway auto-deploys on push to main |
| Linting/formatting | ESLint 9 + Prettier 3 | Next.js preset; Biome noted as future option |
| Environment validation | Zod env.ts | Fail-fast on missing env vars |
| Uptime monitoring | Better Stack Uptime | Gemini-recommended; accepted |

---

## PRD Capability Gap Check

Cross-reference of all PRD Must Have and Should Have features against the chosen stack: **zero gaps identified.** Every feature has a covering technology. See `docs/tech-stack.md §9` for full cross-reference table.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| GramJS MTProto session fragility (v1 critical path) | HIGH | Graceful fallback in all order flows; `lib/telegram/client.ts` abstraction layer for future library swap |
| iOS Web Push requires "Add to Home Screen" | MEDIUM | User education banner when push permission denied (PRD §5.2.7) |
| Auth.js v5 is RC-stage | LOW | API is stable for Credentials provider + Prisma adapter use case; monitor release notes |
| Codex failed (no git repo) | LOW | Gemini + Claude produced sufficient coverage; no capability gaps identified |

---

## Gate Verdict

**Degraded-Pass.** All required decisions made, zero PRD capability gaps, Gemini + Claude consensus on 10/12 decisions, 2 divergences resolved with explicit rationale. Codex failure noted (non-git-repo environment constraint).

Next eligible steps: `user-stories`, `coding-standards`
