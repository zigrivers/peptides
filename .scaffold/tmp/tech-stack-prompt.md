You are a senior software architect recommending a technology stack for a solo-developer web application.

## Project Summary

A full-stack web app ("peptide tracker") for personal use (1-50 users). Key capabilities:
- **Protocol Tracker**: Daily dose logging, injection site rotation, cycle management, vial inventory with expiry warnings, batch "log all scheduled" action, outcome logging
- **Reference**: Compound profile pages (~25 peptides), search/browse catalog
- **Ordering**: Build orders, send via Telegram MTProto (user's own Telegram account), payment tracking, inventory-aware order suggestions
- **Auth**: Email/password, sessions, invite-based managed users (Power User + Delegated Participants)
- **PWA**: Installable to home screen, offline dose-log queuing via service worker, Web Push API for dose reminders
- **Export**: JSON + CSV data export

## Already Confirmed

- **Meta-framework**: Next.js 15 + TypeScript (App Router)
- **CSS**: Tailwind CSS + shadcn/ui components
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Deployment**: Railway (always-on PaaS, not serverless)
- **Methodology**: Solo developer, personal tool first

## Open Decisions (research needed)

1. **Auth library**: NextAuth v5 (Auth.js) vs Lucia Auth vs custom sessions. Need: email/password, httpOnly cookie sessions, 30-day rolling expiry, password reset, bcrypt ≥ 12 cost factor.
2. **MTProto client**: Which JS/TS MTProto library for user-level Telegram automation? Requirements: Node.js compatible, TypeScript types, active maintenance, can store and restore sessions. Candidates: GramJS (`telegram` npm), MTKruto, Telegraf (bot API only — not suitable).
3. **PWA / service worker**: Serwist vs next-pwa vs custom. Needs: offline dose-log queuing (IndexedDB), background sync, Web Push API support.
4. **Push notifications**: web-push npm package for VAPID-based Web Push. Any alternatives?
5. **Email**: Resend vs Postmark. Need: transactional email (invites, password reset, dose reminders). Free tier important at < 50 users.
6. **Charts**: For outcome-dose correlation timeline. Recharts vs Chart.js vs Tremor. Must work with React/Next.js, TypeScript support.
7. **Scheduled jobs / cron**: Dose reminders must fire at user-configured times. Railway cron service → Next.js API route vs node-cron vs pg_cron. What's the right approach?
8. **Error monitoring**: Sentry vs alternatives. Free tier required.
9. **Testing**: Unit (Vitest vs Jest), E2E (Playwright vs Cypress). Which is best for Next.js App Router in 2025?
10. **Validation**: Zod vs other schema validation. Standard for Next.js?
11. **Uptime monitoring**: UptimeRobot (free) vs alternatives.
12. **React state / server state**: TanStack Query vs SWR vs React Server Components only.

## Constraints
- Infrastructure budget: < $100/month at 1-50 users
- Solo developer: prefer convention-heavy, well-documented choices
- AI coding tools (Claude Code) are primary development tool — AI compatibility is a key criterion
- No App Store: PWA only
- Safety-critical: reconstitution math must be 100% unit-tested; no dose calculation defects
- Security: bcrypt sessions, AES-256 MTProto session storage, no IDOR vulnerabilities

## Output Format

Respond with JSON:
```json
{
  "recommendations": [
    {
      "category": "category name",
      "choice": "chosen technology + version",
      "rationale": "why this choice",
      "alternatives_considered": ["alt1", "alt2"],
      "ai_compatibility": "assessment of AI tooling coverage",
      "lock_in_risk": "none|low|medium|high",
      "notes": "any caveats or integration notes"
    }
  ],
  "architecture_notes": "overall architecture recommendation",
  "risks": ["risk1", "risk2"]
}
```

Cover all 12 open decisions plus any additional choices you identify as important.
