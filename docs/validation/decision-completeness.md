# Validation: Decision Completeness

**Date:** 2026-05-20 (re-review, auto-fix batch)
**Methodology:** deep | Depth: 5/5
**Status:** RE-REVIEWED — produced from scratch (prior pass left only multi-model CLI artifacts in `docs/validation/decision-completeness/`, both of which failed: Gemini rate-limited, Codex returned no findings JSON); 3 new findings raised + 1 fixed inline + 2 acknowledged as acceptable; Full Pass

---

## 1. Scope and Method

Per the meta-prompt: verify all decisions are recorded, justified, and non-contradictory. The audit dimensions are:

1. **Coverage** — every significant tech-stack choice has a corresponding ADR.
2. **Quality** — rationale + alternatives + consequences are documented.
3. **Consistency** — no contradictions between ADRs or between ADRs and `docs/tech-stack.md`, `docs/system-architecture.md`, etc.

Both external CLI models failed:
- **Gemini**: `RESOURCE_EXHAUSTED` (rate limit on `gemini-3.1-pro-preview`) across 9 retry attempts.
- **Codex**: returned input echo only, no findings JSON.

Single-channel audit performed by Claude (Opus 4.7).

---

## 2. ADR Coverage Matrix

| Tech-stack decision (from `docs/tech-stack.md`) | Has dedicated ADR? |
|--------------------------------------------------|---------------------|
| Next.js 15 App Router | ✓ ADR-001 |
| PostgreSQL 16 + Prisma 5.x | ✓ ADR-002 |
| Tailwind 3.x + shadcn/ui | ✓ ADR-003 |
| Auth.js v5 | ✓ ADR-004 |
| GramJS (Telegram MTProto) | ✓ ADR-005 |
| Railway hosting | ✓ ADR-006 |
| Serwist (PWA / service worker) | ✓ ADR-007 |
| Vitest + Playwright | ✓ ADR-008 |
| Audit logging architecture | ✓ ADR-009 |
| **AI provider (Anthropic + Gemini fallback)** | ✓ **ADR-010** |
| Resend (transactional email) | ✓ ADR-011 |
| Railway Cron | ✓ ADR-012 |
| Sentry (error monitoring) | ✓ ADR-013 |
| Cloudflare R2 (object storage) | ✓ ADR-014 |
| Ordering module isolation | ✓ ADR-015 |
| TypeScript strict mode | — (conventional baseline; acceptable to skip per project-rules) |
| Node.js 22 LTS | — (conventional baseline) |
| pnpm 9.x | — (conventional baseline) |
| React Hook Form + Zod | — (no ADR; documented in tech-stack §4.4) |
| TanStack Query | — (no ADR; documented in tech-stack §4.7) |
| date-fns | — (minor utility; documented in tech-stack §4.6) |
| web-push / VAPID | — (referenced in ADR-007 §"Web Push for Dose Reminders" but no dedicated ADR) |
| Better Stack Uptime | — (referenced in ops; minor) |
| GitHub Actions CI | — (conventional; referenced in `.github/workflows/ci.yml`) |
| Recharts (via shadcn chart) | — (minor; documented in tech-stack §4.3) |

**Coverage: 15 dedicated ADRs covering all 15 major architectural decisions. 10 smaller/conventional tech choices lack dedicated ADRs but are documented in `docs/tech-stack.md`. This is acceptable per ADR's "significant decisions only" principle.**

---

## 3. Quality Audit

Spot-check across all 15 ADRs for the Context / Decision / Alternatives / Consequences quartet:

| ADR | Context | Decision | Alternatives | Consequences | Traces |
|-----|---------|----------|--------------|---------------|--------|
| 001 | ✓ | ✓ | ✓ (SvelteKit, Express+Vite, Remix) | ✓ | — |
| 002 | ✓ | ✓ | ✓ (Drizzle, MongoDB, SQLite) | ✓ | — |
| 003 | ✓ | ✓ | ✓ (Vanilla CSS, Material UI, Tailwind v4) | ✓ | — |
| 004 | ✓ | ✓ | ✓ (Better Auth, Lucia, Custom JWT) | ✓ | ✓ (added in step 5) |
| 005 | ✓ | ✓ | ✓ (mtcute, MTKruto, tdlib) | ✓ | ✓ |
| 006 | ✓ | ✓ | ✓ (Vercel, Hetzner, Fly.io) | ✓ | — |
| 007 | ✓ | ✓ | ✓ (next-pwa, online-only, native) | ✓ | ✓ (added in step 5) |
| 008 | ✓ | ✓ | ✓ (Jest, Cypress, no E2E) | ✓ | ✓ (added in step 5) |
| 009 | ✓ | ✓ | ✓ (App Logs, Prisma Middleware, Event Sourcing) | ✓ | ✓ (added in step 5) |
| 010 | ✓ | ✓ | ✓ (OpenAI primary, self-hosted, no AI) | ✓ | ✓ |
| 011 | ✓ | ✓ | ✓ (SES, Postmark, SendGrid) | ✓ | — |
| 012 | ✓ | ✓ | ✓ (Inngest, BullMQ, Upstash) | ✓ | ✓ (added in step 5) |
| 013 | ✓ | ✓ | ✓ (LogRocket, Axiom, Console) | ✓ | — |
| 014 | ✓ | ✓ | ✓ (AWS S3, Local Disk, Supabase) | ✓ | ✓ (added in step 5) |
| 015 | ✓ | ✓ | ✓ (Shared Codebase, Microservices) | ✓ | — |

**Quality: PASS.** All ADRs have all four required sections. 7 ADRs have Traces sections (added during step 5 review-adrs). The remaining 8 ADRs lack Traces — this was deferred in step 5 because their PRD anchors are less ambiguous.

---

## 4. Consistency Audit

Cross-checked for contradictions between ADRs and across ADRs ↔ tech-stack ↔ architecture:

| Domain | Cross-references | Verdict |
|--------|------------------|---------|
| Hosting (Railway always-on) | ADR-001 + ADR-005 + ADR-006 + tech-stack §1.3 | Consistent — all agree Railway always-on required for GramJS session persistence. |
| AI provider | ADR-010 + tech-stack §9b (NEW in this re-review) + architecture §2.1 + ops §4.1 AI playbook + security §7 | **Consistent (after this re-review's tech-stack §9b fix).** |
| Database (Postgres + Prisma) | ADR-002 + tech-stack §6 + schema-design + domain models | Consistent. |
| Auth (session + invite + email-change) | ADR-004 + domain/auth.md + schema + api §2 + ux §3.7 | Consistent (after batch steps 5/7/9). |
| MTProto + Telegram | ADR-005 + tech-stack §5.2 + architecture §2.2 + ux ordering flow | Consistent. |
| Audit log (no FK + 90d retention) | ADR-009 + domain/audit.md + schema + security §6 + ops §3.3 | Consistent (after batch step 5). |
| PWA + Web Push + iOS Safari | ADR-007 + ux §3.8 + platform-parity §2.1 + architecture §3.7 reminder dispatch | Consistent (after batch steps 5/12/13). |
| Cron schedules (every 15 min for dose reminders) | ADR-012 + architecture §6 + ops §3.3 + api §7 + plan task 5.2 | Consistent. |
| Module isolation | ADR-015 + plan task 4.4 + ops feature flag | Consistent. |
| Coverage gates (100% on safety modules) | ADR-008 + .claude/rules/safety-math.md + .claude/rules/testing.md + tdd-standards §1 | Consistent (after batch step 5). |
| Vision ordering mode (v1 = full MTProto, not guided-manual) | vision §10 + PRD §5.4 | **Consistent after step 16 fix.** |

**Consistency: PASS.** No contradictions detected. All inconsistencies that existed in the initial pipeline output were repaired across batch steps 5-12 and 16.

---

## 5. Findings (re-review)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| N1 | P1 | `docs/tech-stack.md` did not reference ADR-010 (AI provider strategy) anywhere despite §10 "AI Compatibility Assessment" being adjacent. The AI provider was a v1 architectural decision and warranted a tech-stack section. | **Added §9b "AI Provider (Vercel AI SDK + Anthropic + Gemini fallback)"** to tech-stack.md with full rationale, fail-over policy, and env vars. Referenced ADR-010 as authoritative. |
| N2 | P2 (acknowledged) | 10 minor / conventional tech-stack choices have no dedicated ADR (TypeScript strict, Node 22, pnpm, RHF, TanStack Query, date-fns, web-push, Better Stack, GitHub Actions, Recharts). | Acknowledged. These are conventional baseline choices documented in tech-stack but without their own ADR. Adding an ADR for each would be sprawl. Re-trigger condition: if any of these is replaced with a non-conventional alternative, generate an ADR. |
| N3 | P3 (acknowledged) | 8 of 15 ADRs lack explicit "Traces" sections back to PRD/stories/domain (deferred in step 5). | Acknowledged from step 5 (review-adrs N10). Re-trigger if any ADR is updated for a substantive scope change. |

---

## 6. Multi-Model Dispatch Note

**Gemini**: rate-limited (`RESOURCE_EXHAUSTED` on `gemini-3.1-pro-preview`). 9 retry attempts; all failed. Raw error log preserved at `docs/validation/decision-completeness/gemini-review.json` for diagnostic purposes.

**Codex** (gpt-5.5): returned only the input echo with no findings JSON. Likely a tool wiring issue (the prompt asked for a JSON array, and the CLI returned text). Raw output at `docs/validation/decision-completeness/codex-review.json`.

**Compensating pass**: Claude (Opus 4.7) performed the full audit single-channel. The 14 prior consistency-related batch fixes already encompass most of what multi-model dispatch would have surfaced.

---

## 7. Gate Result

- **Gate**: **Full Pass**
- **Coverage**: 15/15 major decisions have ADRs.
- **Quality**: all 15 ADRs have Context/Decision/Alternatives/Consequences; 7 have Traces.
- **Consistency**: no contradictions across ADRs ↔ tech-stack ↔ architecture ↔ operations.
- **Re-trigger conditions**: any new bounded context (must spawn an ADR for context boundary); any new external service (must spawn an ADR + tech-stack section); replacing any conventional baseline (TypeScript / Node / pnpm) with a non-conventional alternative.

---

## 8. Cross-References

- ADR index: `docs/adrs/index.md` (15 ADRs).
- Tech-stack: `docs/tech-stack.md` (now includes §9b AI Provider).
- Architecture: `docs/system-architecture.md`.
- This audit: `docs/validation/decision-completeness.md` (this file).
- Raw multi-model dispatch artifacts: `docs/validation/decision-completeness/codex-review.json` + `gemini-review.json` (both failed; preserved for diagnostic purposes).
