<!-- scaffold:tech-stack v1 2026-05-20 -->
# Technology Stack

**Date:** 2026-05-20
**PRD source:** `docs/plan.md` (post-innovate-prd v1)
**Methodology:** deep | Depth: 5/5
**Status:** COMPLETE — all decisions finalized

---

## 1. Architecture Overview

### 1.1 Pattern: Full-Stack Monolith (Next.js App Router)

A single Next.js 15 application handles both the frontend and backend. This is the correct pattern for a solo-developer personal tool at 1–50 users:

- **No microservices.** Zero operational benefit at this scale; massive coordination cost.
- **No separate API server.** Next.js API routes and Server Actions replace Express/Fastify entirely.
- **Stateless HTTP layer + stateful Telegram layer.** HTTP endpoints are stateless. The MTProto Telegram session is held server-side (encrypted in Postgres) and reconnected per-request. This works correctly on Railway (always-on), not on serverless platforms.

### 1.2 Rendering Strategy

| Surface | Strategy | Rationale |
|---------|----------|-----------|
| Reference pages (compound profiles) | SSG (static) with 24h ISR | Content changes rarely; maximum CDN performance; SEO-irrelevant but fast load |
| Dashboard + dose logging | Server Components + Client Components | Personalized; auth-gated; streaming SSR for fast FCP |
| Admin panel | SSR (server-side rendered) | Personalized, no public caching |
| Order builder | Client Components | Interactive cart state; no SSG benefit |
| Reconstitution calculator | Client Component | Real-time math; all client-side computation |
| Auth pages (login, register) | SSR | Session check server-side; prevents flash of unauthenticated state |

**Progressive hydration principle:** Server Components for read-only, non-interactive UI (reference pages, dose history). Client Components only where interactivity is required (dose log form, order cart, calculator input fields).

### 1.3 Always-On Requirement

The app **must** run on an always-on server (Railway), not serverless. Two reasons:
1. **GramJS MTProto** requires a persistent Node.js process or at minimum reliable session storage. Cold starts on serverless create auth latency and session issues.
2. **Scheduled dose reminders** require a cron-triggered server process, not on-demand invocation.

### 1.4 PWA Architecture

```
Browser (PWA shell)
  └── Service Worker (Serwist)
        ├── Cache: App shell, static assets
        ├── Offline queue: IndexedDB → background sync → POST /api/dose-logs
        └── Push: Web Push API subscription → web-push server → Sentry alert if fails
```

Offline dose-log writes are queued in IndexedDB via Workbox background-sync. On reconnect, the service worker replays them against the API. The server applies standard idempotency checks (duplicate log for same protocol + same day → confirmation prompt).

---

## 2. Language & Runtime

### 2.1 TypeScript 5.x (strict mode)

**Decision:** TypeScript strict mode throughout. No `any` except explicitly typed as `unknown` first.

**Why:** Safety-critical reconstitution math and payment flows require compile-time type guarantees. TypeScript strict mode catches dose-unit mismatches, null pointer errors in protocol lookups, and API response shape mismatches at build time rather than runtime.

**Alternatives considered:**
- JavaScript only — eliminates type safety on dose calculations; rejected
- Zod-only runtime types — complements TypeScript, does not replace compile-time types

**AI compatibility:** Maximum. TypeScript is the #1 language in Claude Code training data for web development. Type annotations let AI tools generate more accurate code on first attempt.

**Configuration:** `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true` (prevents `array[i]` from returning `T | undefined` silently).

### 2.2 Node.js 22 LTS

**Decision:** Node.js 22 LTS on Railway.

**Why:** Long-term support until April 2027. Native fetch, native `crypto.subtle`, `--watch` mode, improved ESM support. GramJS and all chosen dependencies are compatible.

**Runtime target:** `@types/node@22`, `engines: { node: ">=22" }` in `package.json`.

### 2.3 Package Manager: pnpm 9.x

**Decision:** pnpm over npm or yarn.

**Why:** 50–70% faster installs than npm via content-addressable store. Strict node_modules layout prevents phantom dependencies (a risk with Prisma client generation). Railway supports pnpm natively via `packageManager` field in `package.json`.

**Alternatives considered:**
- npm — slower, no phantom dependency protection
- Bun — incompatible with GramJS native deps; avoid for production Node.js apps until ecosystem matures

---

## 3. Meta-Framework: Next.js 15 (App Router)

**Decision:** Next.js 15 with App Router. React 19.

**Why:**
- **Full-stack in one framework.** API routes + Server Actions + React in a single codebase eliminates the context switch between frontend and backend.
- **App Router** enables React Server Components (zero-JS reference pages), streaming SSR (fast dashboard FCP), and native layouts for the multi-page authenticated app structure.
- **PWA-ready.** Works with Serwist for service worker generation.
- **AI compatibility:** Strongest AI tooling coverage of any full-stack web framework. Every AI coding tool (Claude Code, Copilot, Cursor) has extensive Next.js App Router training data.

**Alternatives considered:**
- **SvelteKit** — smaller bundles, simpler mental model, but smaller ecosystem and less AI training data. No compelling advantage over Next.js for this app.
- **Remix** — excellent progressive enhancement story but smaller community and less AI coverage. Not worth the tradeoff for a solo developer.
- **Express + Vite + React** — more control, but replaces Next.js conventions with bespoke wiring. Every convention Next.js provides (routing, layouts, middleware, Server Actions) would require custom implementation. Solo dev cost: high.

**Version pins:** `next@15.x`, `react@19.x`, `react-dom@19.x`

**Key App Router conventions used:**
- `app/` directory (not `pages/`)
- Server Components by default; `"use client"` boundary for interactive components
- Server Actions for all form mutations (dose logging, protocol creation, order submission)
- Route handlers (`app/api/*/route.ts`) for machine-to-machine API calls (PWA sync, cron triggers)
- Middleware (`middleware.ts`) for session validation on protected routes

---

## 4. Frontend Stack

### 4.1 CSS: Tailwind CSS 3.x

**Decision:** Tailwind CSS 3.x (utility-first).

**Why:**
- Required per user preference.
- Pairs natively with shadcn/ui — all component variants are Tailwind class strings.
- AI tools generate accurate Tailwind markup on first attempt (huge AI training corpus).
- CSS-in-JS alternatives (styled-components, Emotion) add runtime overhead and complicate RSC boundaries.

**Configuration:** `tailwind.config.ts` with custom design tokens for the app's color palette (to be defined at implementation). PostCSS pipeline via `postcss.config.mjs`.

### 4.2 Components: shadcn/ui

**Decision:** shadcn/ui component library.

**Why:**
- Required per user preference.
- Copy-paste model: components are owned code, not a black-box dependency. This matters for a solo dev — customize freely without monkey-patching an external package.
- Built on Radix UI primitives (accessible by default — satisfies WCAG 2.1 AA requirement for Delegated Participant flows).
- Tailwind-native: component variants are class strings, not JS objects.
- AI compatibility: Claude Code has strong shadcn/ui training data; generates accurate component usage and customization.

**Install model:** `npx shadcn@latest add <component>`. Components live in `components/ui/`.

**Components anticipated for this app:**
- `button`, `card`, `badge`, `dialog`, `drawer` — dose logging, protocol views
- `form`, `input`, `select`, `checkbox`, `textarea` — all form flows
- `table`, `data-table` — order history, dose history, admin user list
- `tabs` — compound profile (overview / my data)
- `sheet` — mobile slide-up for quick log, batch confirm
- `toast` — dose logged confirmation, order sent feedback
- `progress`, `skeleton` — loading states
- `chart` (Recharts-based) — outcome-dose correlation timeline

### 4.3 Charts: shadcn/ui Charts (Recharts-based)

**Decision:** shadcn/ui chart components, which wrap Recharts.

**Why:**
- PRD requires a dual-axis dose-vs-outcome chart (§5.2.8).
- shadcn's chart components are styled with Tailwind, match the app's design system, and are owned code (copyable, modifiable).
- Recharts is a React-native library (no imperative DOM manipulation), meaning it composes naturally with Server and Client Components.
- AI compatibility: both shadcn chart patterns and Recharts are well-represented in AI training data.

**Alternatives considered:**
- **Tremor Raw** — React component library with built-in charts; less flexible than shadcn copy-paste model
- **Chart.js** — vanilla JS with React wrapper; imperative API is less natural in React; larger bundle
- **Victory** — React-native but smaller community; less AI coverage

**Implementation note:** The correlation timeline needs a `ComposedChart` with `Bar` (dose events) and `Line` (outcome rating). This is a standard Recharts pattern.

### 4.4 Forms: React Hook Form 7.x + Zod 3.x

**Decision:** React Hook Form with Zod resolver.

**Why:**
- React Hook Form: uncontrolled inputs (no re-render per keystroke), well-maintained, standard shadcn/ui integration pattern.
- Zod: schema-first validation; the same Zod schema validates Server Action inputs (server-side) and form inputs (client-side) — single source of truth for validation logic.
- `@hookform/resolvers/zod` bridges the two.

**Pattern:**
```
Zod schema (shared) → React Hook Form (client) + Server Action (server)
                    → Prisma type (via zod-prisma-types or manual mapping)
```

**Alternatives considered:**
- Formik — older, more verbose, less performant
- Plain `<form>` + Server Actions — fine for simple forms; React Hook Form needed for complex multi-field validation (reconstitution calculator, order builder)

### 4.5 Icons: Lucide React

**Decision:** Lucide React (bundled with shadcn/ui).

**Why:** shadcn/ui uses Lucide by convention. Tree-shakeable SVG icons. No additional install needed.

### 4.6 Date Handling: date-fns 3.x

**Decision:** date-fns 3.x for all date manipulation and formatting.

**Why:**
- PRD: UTC storage, browser-local-timezone display (§8.8).
- date-fns is functional (pure functions), tree-shakeable, and has excellent TypeScript types.
- `formatInTimeZone` (via `date-fns-tz`) handles UTC → user-local conversion correctly.
- Lightweight alternative to moment.js (deprecated) and Day.js (minimal TypeScript support for some edge cases).

**Pattern:**
- All timestamps stored as UTC ISO 8601 in Postgres (`TIMESTAMPTZ`).
- Display: `formatInTimeZone(utcDate, userBrowserTimezone, 'MMM d, yyyy h:mm a')`.
- "Today's doses" resolved using user's `Intl.DateTimeFormat().resolvedOptions().timeZone` (captured in client, sent as header or stored in session).

**Alternatives considered:**
- Day.js — lighter but `date-fns-tz` has better TypeScript support for timezone conversion
- Native `Intl.DateTimeFormat` — adequate for formatting but no utility functions for arithmetic

### 4.7 Client State: TanStack Query 5.x + React Context

**Decision:** TanStack Query for server state; React Context for UI state (wizard step, batch log selection).

**Why:**
- **TanStack Query:** Handles data fetching, caching, background refetch, and optimistic updates for client-side interactions (search, inventory live updates). Better than SWR for this app's needs (more control over cache invalidation when dose is logged).
- **React Context:** Lightweight UI state (auth user object, current wizard step, batch log selection set). No global store library (Redux, Zustand) needed — app complexity doesn't justify it.
- **Server Actions + `useActionState`:** For all form mutations (React 19 native pattern). No client-side fetch needed for most forms.

**Alternatives considered:**
- Zustand — appropriate if cross-component state grows complex; not needed at v1 scale
- SWR — less powerful cache invalidation; fewer features than TanStack Query

---

## 5. Backend Stack

### 5.1 Authentication: Auth.js v5 (NextAuth)

**Decision:** Auth.js v5 (formerly NextAuth) with Credentials provider and Prisma adapter.

**Why:**
- Auth.js v5 is the v1-stable release of NextAuth, built for Next.js App Router. It handles session cookies, CSRF protection, and edge middleware natively.
- Credentials provider supports email/password with custom bcrypt verification (min cost 12 per PRD §5.6).
- Prisma adapter stores sessions and users in Postgres — no additional session store needed.
- Password reset via custom token flow (Auth.js does not include reset out of the box; implement a token table and email link per PRD §5.6 spec).
- AI compatibility: Auth.js/NextAuth is the most widely documented auth library in the Next.js ecosystem; Claude Code generates accurate boilerplate.

**Configuration specifics:**
- Strategy: JWT (httpOnly cookie, `SameSite=Strict`, 30-day rolling expiry)
- bcrypt cost: 12 (PRD §5.6, §8.2)
- Session expiry: `maxAge: 30 * 24 * 60 * 60` (30 days in seconds)
- Rolling sessions: `updateAge: 24 * 60 * 60` (refresh cookie daily if active)
- Password reset: custom `password_reset_tokens` table (token, user_id, expires_at, used boolean); token delivered via Resend; expires 1 hour; single-use

**Diverges from Gemini recommendation (Better Auth).** Gemini suggested Better Auth as the spiritual successor to Lucia Auth. Assessment:
- Better Auth is newer (2024), well-designed, has a Prisma adapter.
- Risk: significantly less AI training data (Claude Code generates poor Better Auth boilerplate due to novelty).
- Auth.js v5 has the largest documentation corpus and most AI training coverage of any Next.js auth library.
- Decision: Auth.js v5 for maximum AI-assisted development velocity. Re-evaluate if Auth.js v5 causes issues (migration to Better Auth is straightforward — same Prisma adapter pattern).

**Alternatives considered:**
- Better Auth — technically sound; rejected due to low AI training coverage
- Lucia Auth — deprecated by author in 2024; rejected
- Custom sessions (iron-session) — simpler but eliminates session management utilities; Auth.js handles rolling refresh, CSRF, and edge middleware automatically

### 5.2 Telegram MTProto Client: GramJS

**Decision:** GramJS (`telegram` npm package, ~3M weekly downloads).

**Why:**
- PRD §7.1 explicitly defers MTProto library choice to this step and requires: Node.js compatible, user-level Telegram access (not bot API), session storage and restoration.
- GramJS is the most widely-used JavaScript MTProto client, with extensive documentation, community examples, and battle-tested session management.
- Session strings: GramJS's `StringSession` serializes the auth session to an encrypted string that can be stored in Postgres and restored on each request.
- AI compatibility: GramJS has the most examples in Claude's training data of any JS MTProto library.

**Session handling pattern:**
1. Power User authenticates via Telegram phone number + verification code (one-time setup).
2. GramJS produces a `StringSession` string.
3. App encrypts the string with AES-256-GCM (Node.js `crypto` module; key from `TELEGRAM_SESSION_KEY` env var) and stores in `telegram_sessions` Postgres table (user-scoped).
4. On order send: decrypt session → `new StringSession(decrypted)` → `TelegramClient` → `sendMessage()`.
5. On session invalidation: force re-auth flow; session deleted; user prompted.

**Rate limits:** At v1 usage (5–15 order messages/month, 1 auth event per device setup), flood-wait limits are not a risk. Session-level flood-wait handling in GramJS automatically respects `FLOOD_WAIT_X` errors.

**Diverges from Gemini recommendation (mtcute).** Gemini suggested mtcute as more modern. Assessment:
- mtcute has better TypeScript types and a cleaner API.
- Risk: ~100K weekly downloads vs GramJS's ~3M; significantly less AI training data; fewer real-world examples of session storage patterns.
- Decision: GramJS for ecosystem maturity and AI compatibility. mtcute can be evaluated at v2 if GramJS causes issues.

**Alternatives considered:**
- mtcute — technically superior API; rejected due to low ecosystem maturity and AI coverage
- MTKruto — newer, Deno/Bun-first; Node.js support less mature; rejected
- tdlib (node-tdlib) — official Telegram C++ library; requires native compilation; deployment complexity on Railway; rejected

**Lock-in level:** Medium. Switching MTProto libraries requires re-encrypting and migrating session storage. Mitigated by keeping GramJS calls behind a `lib/telegram/client.ts` abstraction layer.

### 5.3 Email: Resend + React Email

**Decision:** Resend as the transactional email provider with React Email for templates.

**Why:**
- PRD §7.1 and §7.3 require transactional email for invites, password reset, async export delivery, and dose reminder fallback.
- Resend free tier: 3,000 emails/month — sufficient for 1–50 users with generous headroom.
- React Email: JSX-based email templates (type-safe, editable with component patterns). Far superior to HTML table email templates for AI-assisted development.
- Resend has native Next.js integration and excellent documentation.

**Emails required:**
- Managed user invite (72h expiry link)
- Password reset (1h expiry link)
- Async data export delivery (download link)
- Dose reminder (fallback when push is unavailable)
- Order stale alert (14-day flag notification)

**Alternatives considered:**
- Postmark — excellent deliverability; more expensive ($15/month minimum); free tier more limited
- SendGrid — large but complex; overkill for personal tool
- Nodemailer (SMTP) — DIY; not a managed service; deliverability responsibility falls on developer

### 5.4 Push Notifications: web-push + VAPID

**Decision:** `web-push` npm package with VAPID keys for Web Push API.

**Why:**
- PRD §5.2.7 requires browser push notifications as the primary dose reminder channel.
- `web-push` is the standard Node.js library for sending Web Push API payloads. No third-party service required — VAPID keys are self-generated and stored as env vars.
- Cost: zero. No SaaS dependency.
- Works with Serwist service worker to receive push events and display browser notifications.

**iOS note:** Web Push on iOS Safari requires the PWA to be installed via "Add to Home Screen" (iOS 16.4+). App must show a banner explaining this requirement when push permission is denied (§5.2.7 error scenario).

**VAPID key storage:** `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Railway environment variables. Public key exposed via `/api/push/vapid-key` endpoint for service worker registration.

**Alternatives considered:**
- OneSignal — SaaS push service; adds vendor dependency and free tier limitations; rejected
- Firebase Cloud Messaging — Google dependency; cross-platform complexity; rejected for this simple use case

### 5.5 Validation: Zod 3.x

**Decision:** Zod for all input validation — Server Actions, API routes, form schemas, and environment variable validation.

**Why:**
- Single schema definition validates both client-side form inputs and server-side API boundaries.
- Zod integrates with React Hook Form (`@hookform/resolvers/zod`), Prisma (via `zod-prisma-types`), and tRPC/Server Actions.
- Prevents IDOR vulnerabilities: route parameters and query strings validated against Zod schemas before database queries.
- PRD §8.2: parameterized queries only. Zod ensures no raw string concatenation from user inputs ever reaches the database layer.
- Environment variable validation: `env.ts` using Zod validates all required env vars at startup — prevents silent missing-env bugs.

**AI compatibility:** Elite. Claude Code generates accurate, idiomatic Zod schemas from plain-English requirements.

**Alternatives considered:**
- Valibot — smaller bundle, similar API; less AI training data; acceptable alternative if bundle size becomes a concern
- TypeBox — JSON Schema-based; excellent OpenAPI integration if API documentation is ever needed; not needed for v1

---

## 6. Database

### 6.1 PostgreSQL 16 (Railway-managed)

**Decision:** PostgreSQL 16, hosted by Railway's managed Postgres service.

**Why (from PRD §7.1):**
- PRD explicitly states "Relational (PostgreSQL preferred)."
- Relational model fits all four pillars: compound profiles, protocols, dose logs, orders all have well-defined relational structure.
- PostgreSQL JSONB columns available for flexible metadata without a separate document store.
- Railway-managed Postgres: automatic backups (30-day retention per PRD §8.4), connection pooling via PgBouncer, no operational burden.
- Cost: Railway Postgres starts at ~$5–10/month for the dev/production tier.

**Schema design principles:**
- All timestamps as `TIMESTAMPTZ` (UTC-aware).
- Soft deletes on compound records (never hard-deleted; `archived_at` column). This satisfies PRD §5.1 FK integrity requirement.
- Audit log table (`audit_events`) for protocol mutations, dose logs, order events, admin actions — 90-day rolling retention (PRD §5.7, §8.2).
- MTProto sessions in dedicated `telegram_sessions` table (encrypted `session_string`, `user_id` FK, `created_at`, `revoked_at`).

**Connection:** Direct TCP connection via Railway's internal networking. No connection pooler needed at < 50 users (Prisma manages its own pool with `connection_limit = 10`). Re-evaluate Prisma Accelerate or PgBouncer at 100+ concurrent users.

### 6.2 ORM: Prisma 5.x

**Decision:** Prisma as the ORM — CONFIRMED per user preference.

**Why:**
- Schema-first approach: `schema.prisma` is the single source of truth for the data model. Migrations generated automatically via `prisma migrate dev`.
- Type-safe queries: Prisma Client generates TypeScript types from the schema. Every query result is fully typed.
- PRD §8.2 security: "parameterized queries only; ORM or query builder; no raw string concatenation" — Prisma satisfies this by default.
- `prisma migrate deploy` in CI/CD ensures migrations run before code deploys.

**AI compatibility:** Maximum. Prisma schema syntax and Prisma Client query patterns are extremely well-represented in AI training data.

**Key Prisma features used:**
- `@relation` for FK integrity (protocol → compound, dose_log → protocol, order → vendor)
- `@@index` on hot query columns (`user_id`, `protocol_id`, `logged_at`)
- `$transaction` for atomic operations (dose batch log, order status transitions)
- Soft delete middleware for compound records

**Alternatives considered:**
- Drizzle ORM — SQL-first, zero overhead; good TypeScript support; less AI training data than Prisma; more verbose for complex queries; acceptable alternative if Prisma performance becomes a concern

---

## 7. Infrastructure & Deployment

### 7.1 Hosting: Railway

**Decision:** Railway — CONFIRMED per user preference.

**Why:**
- Always-on PaaS: single Railway service runs the Next.js server process continuously. No cold starts. Correct for GramJS MTProto and cron-triggered dose reminders.
- Postgres included: Railway-managed Postgres as a linked service to the main app service.
- Cost: ~$15–30/month for Next.js service + Postgres at 1–50 users — well within §7.3's $100/month budget.
- Deployment: `railway up` or GitHub push triggers. Zero-downtime rolling deploys supported via Railway's restart policy.
- Environment variables: managed via Railway dashboard; available to Next.js via `process.env`.

**Railway service structure:**
- **App service:** Next.js 15 process (single container, always-on)
- **Postgres service:** Railway-managed Postgres 16
- **Cron service:** Railway cron for scheduled jobs (see §7.2)

**Cost estimate at 1–50 users:**
| Service | Cost |
|---------|------|
| Railway app service | ~$5–10/month (512MB RAM, 0.5 vCPU) |
| Railway Postgres | ~$5–10/month (1GB storage) |
| Resend (email) | Free (3k emails/month) |
| Better Stack (uptime) | Free tier |
| Sentry (errors) | Free tier (5k errors/month) |
| Cloudflare R2 (exports) | Free (10GB) |
| **Total** | **~$10–20/month** |

### 7.2 Scheduled Jobs: Railway Cron Service

**Decision:** Railway cron service hitting a protected Next.js API route.

**Why:**
- Dose reminders (§5.2.7) require firing at user-configured daily times — a background job, not a request handler.
- Railway has a native cron service (a separate service that runs on a schedule).
- Pattern: Railway cron → `curl -H "Authorization: Bearer $CRON_SECRET" https://app.railway.app/api/cron/send-reminders`
- The API route validates `Authorization: Bearer $CRON_SECRET` before executing. `CRON_SECRET` is a 32-byte random string set as an env var on both the app service and the cron service.

**Jobs required:**
| Job | Frequency | Description |
|-----|-----------|-------------|
| `send-reminders` | Every 15 min | Find users whose reminder time falls in current 15-min window; send push/email |
| `flag-stale-orders` | Daily | Auto-flag orders in "Sent" status for > 14 days |
| `check-vial-expiry` | Daily | Compute expiry warnings for dashboard badges |

**Alternatives considered:**
- **node-cron** (in-process) — simpler but couples cron to the web process; Railway restarts could skip a job; no visibility into job history
- **Inngest / Trigger.dev** — event-driven job platforms; excellent features but adds SaaS dependency and monthly cost; overkill for 3 simple cron jobs
- **pg_cron** — PostgreSQL extension for in-database cron; requires PostgreSQL extension permissions; Railway Postgres supports it but Railway cron is simpler and more observable

### 7.3 PWA & Service Worker: Serwist

**Decision:** Serwist (the maintained Next.js-native fork of next-pwa).

**Why:**
- `next-pwa` is unmaintained (last commit 2022). Serwist is its active successor, maintained by @serwist.
- Built for Next.js App Router: correctly handles RSC asset precaching and runtime caching strategies.
- Workbox-based: offline dose-log queuing uses Workbox's `BackgroundSyncPlugin` strategy, which queues failed POST requests in IndexedDB and replays them on reconnect.
- PWA manifest support: generates `manifest.json` from config.

**PWA manifest configuration:**
```json
{
  "name": "[App name — TBD]",
  "short_name": "[App short name]",
  "theme_color": "[TBD at implementation]",
  "background_color": "#ffffff",
  "display": "standalone",
  "icons": [{ "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
             { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" }]
}
```

**Caching strategies:**
- App shell (HTML, CSS, JS): `StaleWhileRevalidate`
- API routes (dose logs, dashboard): `NetworkFirst` with `BackgroundSync` fallback
- Compound reference pages: `CacheFirst` (24h TTL; content changes rarely)
- Images: `CacheFirst` (30-day TTL)

**Offline behavior (§8.4, §8.6 PRD):**
- Dose log submit: queue in IndexedDB; sync on reconnect; UI shows "Saved offline — will sync when connected"
- All other features: show "You're offline" state; no writes attempted

### 7.4 Error Monitoring: Sentry

**Decision:** Sentry, free Developer tier.

**Why:**
- PRD §8.7 requires P0 errors (reconstitution math failure, payment flow error, audit write failure) alerted within 15 minutes. Sentry alerts can trigger email/Slack/webhook on any error matching a rule.
- Next.js Sentry integration (`@sentry/nextjs`) captures both server-side and client-side errors with full stack traces.
- Free tier: 5,000 errors/month — more than sufficient for a personal tool at 1–50 users.
- Telegram send failures will surface in order history (per PRD) and also in Sentry for developer visibility.

**Configuration:**
- Source maps uploaded to Sentry on each deploy (Next.js Sentry plugin)
- PII scrubbing: all Sentry events must have `beforeSend` hook that strips dose amounts, compound names, and wallet addresses before transmission
- Alert rules: error rate spike on `/api/reconstitution` or `/api/orders` → email alert within 5 minutes

**Alternatives considered:**
- Highlight.io — free session replays; good for visual debugging; adds heavier client-side instrumentation; trade-off not worth it for a utility app
- GlitchTip — self-hosted Sentry alternative; adds operational burden; rejected

### 7.5 Uptime Monitoring: Better Stack Uptime

**Decision:** Better Stack Uptime (free tier).

**Why:**
- PRD §8.7 requires external uptime check; alert if unreachable > 5 minutes.
- Better Stack free tier: 3 monitors, 3-minute check interval — adequate.
- Monitors the `/api/health` endpoint (which checks DB connectivity per PRD §8.7 pattern).
- SMS/email alerts on downtime.

**Alternatives considered:**
- UptimeRobot — free tier with 5-minute intervals; adequate alternative
- Pingdom — paid-only; overkill

### 7.6 Object Storage: Cloudflare R2 (async data exports)

**Decision:** Cloudflare R2 for data exports ≥ 10MB.

**Why:**
- PRD §5.7: exports ≥ 10MB generated asynchronously; download link emailed within 5 minutes.
- At < 50 users, exports are almost certainly < 10MB. R2 is for future-proofing and the async path.
- R2 free tier: 10GB storage, zero egress fees. Cost: effectively $0 at v1 scale.
- S3-compatible API: works with AWS SDK v3 (`@aws-sdk/client-s3` with custom endpoint).
- Pre-signed URLs for secure download links with 24-hour expiry.

**Alternatives considered:**
- AWS S3 — egress fees at scale; R2 is a strict cost upgrade
- Railway volumes — limited to block storage; not suitable for user-generated file downloads

**Implementation note:** For v1 at < 50 users, synchronous download (streaming response from API route) is the first implementation path. R2 is only needed when an export actually exceeds 10MB — implement async R2 path at that point.

---

## 8. Developer Tooling

### 8.1 Testing: Vitest 2.x + Playwright 1.x

**Decision:** Vitest for unit/integration tests; Playwright for E2E.

**Unit/integration tests (Vitest):**
- **Why:** Faster than Jest for Vite-based toolchains; native ESM support; compatible with Next.js App Router via `@vitejs/plugin-react`; jsdom environment for React component tests.
- **Critical test surface:** `lib/math/reconstitution.ts` — **100% branch coverage required** (PRD §7.4, §6 hard gates). Every reconstitution calculation must have a matching test with known reference values.
- **React Testing Library** (`@testing-library/react`) for component tests.
- **MSW (Mock Service Worker)** for mocking external API calls (Resend, push notification service) in integration tests.

**E2E tests (Playwright):**
- **Why:** Gold standard for E2E in 2025. Supports Chromium, Firefox, and WebKit (for iOS Safari PWA testing). `--ui` mode provides a visual test runner.
- **Critical E2E paths (PRD §6 hard gates):**
  - Payment confirmation flow: wallet address + amount must be visible before "Mark payment sent" can be clicked
  - Dose log submit: successful completion with correct timestamp
  - Batch log: "Log All Scheduled" confirms all pending doses
  - Auth: login, password reset, invite acceptance
- **Playwright component testing** for interactive components (dose log form, order cart).

**CI gate:** All unit tests and E2E critical path tests must pass before merge to main.

**Alternatives considered:**
- Jest — slower; worse ESM support; no compelling advantage over Vitest for Next.js
- Cypress — better visual debugging than Playwright but slower, less WebKit support

### 8.2 Linting & Formatting: ESLint 9 + Prettier 3

**Decision:** ESLint 9 with Next.js config preset + Prettier 3.

**Why:**
- Next.js ships `eslint-config-next` which includes React, React Hooks, accessibility, and TypeScript rules out of the box.
- Prettier formats code consistently; eliminates style debates in solo development; pairs with `eslint-config-prettier` to disable conflicting ESLint style rules.

**Additional ESLint rules:**
- `@typescript-eslint/no-explicit-any` — enforce `unknown` + type narrowing
- `@typescript-eslint/no-floating-promises` — all async calls must be awaited or void-annotated
- `no-console` — use structured logger; console.log removed in production

**Alternatives considered:**
- Biome — all-in-one linter + formatter, extremely fast; newer and growing; less AI training data than ESLint; acceptable future upgrade path

### 8.3 CI/CD: GitHub Actions

**Decision:** GitHub Actions for CI pipeline; Railway auto-deploy on push to `main`.

**Pipeline:**
```
Push to main branch
  → GitHub Actions: type-check → lint → unit tests → E2E tests (Playwright)
  → On pass: Railway auto-deploy (triggered by GitHub push webhook)
  → Post-deploy: `prisma migrate deploy` runs as part of Railway start command
```

**Start command (Railway):** `npx prisma migrate deploy && node server.js`

**Key workflows:**
- `ci.yml`: runs on PR and push to main; type-check, lint, vitest, playwright
- Caching: pnpm store cache, Next.js build cache

### 8.4 Environment Management

**Decision:** Next.js native `.env.local` for development; Railway environment variables for production.

**Env vars required:**
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Railway Postgres connection string |
| `NEXTAUTH_SECRET` | Auth.js session signing secret (32+ bytes, random) |
| `NEXTAUTH_URL` | Production URL for OAuth redirect (e.g., `https://app.railway.app`) |
| `RESEND_API_KEY` | Resend transactional email API key |
| `TELEGRAM_SESSION_KEY` | AES-256 key for encrypting MTProto session strings |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_EMAIL` | VAPID contact email (required by Web Push spec) |
| `CRON_SECRET` | Shared secret for cron API route authentication |
| `SENTRY_DSN` | Sentry project DSN |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name |

**Validation:** `src/lib/env.ts` uses Zod to validate all required env vars at startup. App fails to start if any required var is missing — no silent undefined errors in production.

---

## 9. PRD Feature Cross-Reference

Every PRD Must Have and Should Have feature cross-referenced against the stack to confirm no capability gaps:

| PRD Feature | Stack Component(s) | Capability Gap? |
|-------------|-------------------|-----------------|
| Dose logging (daily, batch) | Next.js Server Actions + Prisma | None |
| Protocol management (CRUD, pause, clone, restart) | Server Actions + Prisma | None |
| Reconstitution calculator | Client Component (math lib); Vitest 100% coverage | None |
| Vial inventory + expiry warnings | Prisma queries; Railway cron `check-vial-expiry` | None |
| Compound reference pages | Next.js SSG/ISR; Prisma | None |
| Stacking notes | Prisma text field on compound | None |
| Injection site rotation | Prisma query (last 7 sites); Client Component | None |
| Cycle management | Prisma; Server Actions | None |
| Outcome logging + timeline chart | Prisma + shadcn/ui chart (Recharts) | None |
| Stack overview dashboard | RSC + Server Components; Prisma | None |
| Telegram ordering (MTProto) | GramJS + Prisma (session storage) + AES-256 encryption | None |
| Inventory-aware order builder | Prisma query (days-to-depletion calc) + Server Component | None |
| Order tracking + payment flow | Prisma state machine; Server Actions | None |
| Multi-user admin panel | Prisma (RLS via user_id scoping); Auth.js roles | None |
| Invite link lifecycle | Prisma + Resend (email) + Auth.js | None |
| Email/password auth | Auth.js v5 Credentials provider + bcrypt | None |
| Password reset | Custom token table + Resend | None |
| First-run setup wizard | React state (wizard step) + Server Actions | None |
| PWA / home screen install | Serwist; web app manifest; Railway (HTTPS) | None |
| Offline dose-log queuing | Serwist BackgroundSync + IndexedDB | None |
| Dose reminders (push + email) | web-push (VAPID) + Resend; Railway cron | None |
| CSV export | Node.js stream (csv-stringify or manual) + Cloudflare R2 | None |
| JSON export | Prisma full-table queries + JSON.stringify | None |
| Audit log | Prisma `audit_events` table; 90-day rolling | None |
| Data retention controls | Prisma cascade deletes on account deletion | None |
| WCAG 2.1 AA (Delegated Participant flows) | shadcn/ui (Radix primitives); axe CI scan | None |
| bcrypt cost ≥ 12 | Auth.js Credentials provider config | None |
| AES-256 MTProto session | Node.js `crypto.createCipheriv('aes-256-gcm')` | None |
| Error monitoring + P0 alerts | Sentry (`@sentry/nextjs`) | None |
| Uptime monitoring | Better Stack Uptime | None |
| DB backup (30-day) | Railway-managed Postgres | None |
| Zero reconstitution math defects | Vitest 100% branch coverage | None |

**Conclusion: No capability gaps.** Every PRD feature is covered by a chosen technology.

---

## 9b. AI Provider (Vercel AI SDK + Anthropic + Gemini fallback)

**Decision:** Anthropic Claude (Sonnet 4.6 for drafting, Haiku 4.5 for batch) as primary AI provider; Google Gemini 2.5 Pro as secondary fallback. Vercel AI SDK as the unified client. Authoritative ADR: **ADR-010**.

**Why:**
- Bounded AI uses per vision §8 anti-vision (no dose recommendations, no stack optimization, no AI safety claims). Allowed: PubMed citation extraction, profile drafting w/ human review, v2 Telegram parser, v2 PubMed digest.
- Anthropic primary chosen over OpenAI to limit provider-lock-in surface and because team's evaluation + prompt-caching workflows are already invested in Claude.
- Gemini secondary covers Anthropic outages without adding a third dependency.
- Anthropic prompt caching (5-minute TTL) is non-optional — materially affects cost at v1 scale.

**Failure handling:** auto-fail-over Anthropic → Gemini per ADR-010. If both fail, dependent features degrade gracefully (PubMed digest skips that week; profile drafting falls back to manual entry). AI failures NEVER block user-facing dose logging, ordering, or reconstitution flows.

**Env vars added (per §8.4 env table):** `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`.

**Alternatives considered:** OpenAI primary (rejected — adds a second provider lock-in without compelling cost/quality win); self-hosted Llama (rejected — solo dev cannot sustain GPU hosting + eval pipeline at v1).

**Lock-in level:** Low. Vercel AI SDK abstracts the provider; switching is a configuration change.

---

## 10. AI Compatibility Assessment

This project uses Claude Code as the primary development tool. AI compatibility is a first-class criterion.

| Technology | AI Compatibility | Notes |
|------------|-----------------|-------|
| Next.js 15 App Router | ★★★★★ | Largest training corpus of any full-stack framework |
| TypeScript strict | ★★★★★ | Type annotations guide AI to correct output |
| Tailwind CSS | ★★★★★ | Utility classes are well-understood; accurate first-attempt |
| shadcn/ui | ★★★★★ | Extensive examples; component API is predictable |
| Prisma | ★★★★★ | Schema-first; Claude generates accurate queries |
| Auth.js v5 | ★★★★☆ | v5 newer; v4 docs may confuse; always specify "v5 App Router" |
| Zod | ★★★★★ | Elite coverage; complex schemas generated accurately |
| React Hook Form | ★★★★★ | Standard pattern; shadcn integration well-documented |
| TanStack Query | ★★★★☆ | Strong coverage; specify v5 to avoid v4 patterns |
| GramJS | ★★★☆☆ | Moderate coverage; session patterns require explicit prompting |
| Serwist | ★★★☆☆ | Newer; Workbox patterns (which it wraps) are well-known |
| web-push | ★★★★☆ | VAPID patterns well-documented |
| Resend + React Email | ★★★★☆ | Good coverage; JSX templates AI-friendly |
| Vitest | ★★★★★ | Vitest docs well-represented; Jest-compatible syntax |
| Playwright | ★★★★★ | Best E2E AI coverage; locator patterns well-understood |
| Sentry Next.js | ★★★★☆ | Good; specify App Router integration explicitly |
| date-fns | ★★★★★ | Functional API is AI-friendly |

**Total direct dependencies:** ~35 production packages. Within the acceptable range for a solo developer — every package is justified by a PRD requirement.

---

## 11. Security Decisions

| Requirement (PRD §8.2) | Implementation |
|------------------------|---------------|
| Password storage: bcrypt ≥ 12 | Auth.js Credentials provider with `bcrypt.hash(password, 12)` |
| Session tokens: httpOnly, SameSite=Strict, 30-day rolling | Auth.js v5 JWT strategy; configured in `auth.config.ts` |
| Telegram session: AES-256 at rest, never returned via API | `crypto.createCipheriv('aes-256-gcm', key, iv)` in `lib/telegram/session.ts`; session string never included in API responses |
| Transport: TLS 1.2+, HSTS | Railway provides TLS; `Strict-Transport-Security` header via `next.config.ts` security headers |
| SQL injection: parameterized queries only | Prisma Client by default; `$queryRaw` banned except with `Prisma.sql` template tag |
| XSS: CSP headers, framework auto-escaping | Next.js Content-Security-Policy via `next.config.ts`; no `dangerouslySetInnerHTML` |
| IDOR: user_id scoping on all queries | Zod-validated route params; every Prisma query includes `where: { userId: session.user.id }` |
| Audit log: 90-day rolling | `audit_events` table; Railway cron purges rows older than 90 days |

---

## 12. Quick Reference — Dependency List

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 15.x | Meta-framework |
| `react` | 19.x | UI library |
| `react-dom` | 19.x | DOM renderer |
| `typescript` | 5.x | Language |
| `tailwindcss` | 3.x | CSS utilities |
| `@prisma/client` | 5.x | ORM client |
| `prisma` | 5.x | ORM CLI + migrations |

### Authentication

| Package | Version | Purpose |
|---------|---------|---------|
| `next-auth` | 5.x (beta) | Auth.js v5 for Next.js |
| `@auth/prisma-adapter` | latest | Auth.js Prisma adapter |
| `bcrypt` | 5.x | Password hashing |
| `@types/bcrypt` | latest | TypeScript types |

### UI Components

| Package | Version | Purpose |
|---------|---------|---------|
| `shadcn` (CLI, not a package) | latest | Component scaffolding |
| `@radix-ui/react-*` | latest | shadcn/ui Radix primitives |
| `lucide-react` | latest | Icons |
| `class-variance-authority` | latest | shadcn component variants |
| `clsx` | latest | Class name utility |
| `tailwind-merge` | latest | Tailwind class deduplication |
| `recharts` | 2.x | Charts (via shadcn chart components) |

### Forms & Validation

| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | 7.x | Form state management |
| `zod` | 3.x | Schema validation |
| `@hookform/resolvers` | latest | Zod resolver for RHF |

### Data Fetching & State

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | 5.x | Client server-state management |
| `@tanstack/react-query-next-experimental` | 5.x | Next.js App Router integration |

### Date Handling

| Package | Version | Purpose |
|---------|---------|---------|
| `date-fns` | 3.x | Date utilities |
| `date-fns-tz` | 3.x | Timezone-aware formatting |

### Telegram

| Package | Version | Purpose |
|---------|---------|---------|
| `telegram` | latest | GramJS MTProto client |
| `input` | latest | GramJS dependency (stdin input) |

### Email

| Package | Version | Purpose |
|---------|---------|---------|
| `resend` | latest | Transactional email SDK |
| `@react-email/components` | latest | React Email component library |

### PWA & Push

| Package | Version | Purpose |
|---------|---------|---------|
| `@serwist/next` | latest | Next.js PWA / service worker |
| `serwist` | latest | Serwist core (Workbox wrapper) |
| `web-push` | latest | Web Push API (VAPID) |
| `@types/web-push` | latest | TypeScript types |

### Error Monitoring

| Package | Version | Purpose |
|---------|---------|---------|
| `@sentry/nextjs` | latest | Sentry integration for Next.js |

### Object Storage

| Package | Version | Purpose |
|---------|---------|---------|
| `@aws-sdk/client-s3` | 3.x | Cloudflare R2 (S3-compatible) |
| `@aws-sdk/s3-request-presigner` | 3.x | Pre-signed URLs for exports |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vitest` | 2.x | Unit test runner |
| `@vitest/ui` | 2.x | Vitest visual UI |
| `@testing-library/react` | latest | React component testing |
| `@testing-library/user-event` | latest | User interaction simulation |
| `jsdom` | latest | DOM environment for Vitest |
| `msw` | 2.x | API mocking |
| `playwright` | 1.x | E2E test runner |
| `@playwright/test` | 1.x | Playwright test framework |
| `eslint` | 9.x | Linting |
| `eslint-config-next` | 15.x | Next.js ESLint rules |
| `prettier` | 3.x | Code formatting |
| `eslint-config-prettier` | latest | Disable conflicting ESLint rules |
| `@typescript-eslint/eslint-plugin` | latest | TypeScript ESLint rules |

### Runtime Configuration

| Item | Value |
|------|-------|
| Node.js | 22 LTS |
| Package manager | pnpm 9.x |
| TypeScript config | strict mode + noUncheckedIndexedAccess |
| Next.js config | App Router; standalone output for Railway |
| Prisma schema | PostgreSQL provider |
| Tailwind config | JIT mode (default 3.x); custom design tokens TBD |
| Serwist config | BackgroundSync for offline dose logs |
| Railway start command | `npx prisma migrate deploy && node .next/standalone/server.js` |

---

*This document is the definitive technology reference. All subsequent implementation decisions reference it. Changes require updating this document first.*
