# ADR-006: Use Railway for Hosting and Deployment

## Status
Accepted

## Context
The application requires an always-on server for MTProto persistent sessions and cron-triggered dose reminders. Serverless platforms (Vercel, AWS Lambda) are unsuitable due to cold starts and lack of persistence.

## Decision
We will use Railway as the primary hosting provider for the application and database.

## Alternatives Considered
- **Vercel**: Excellent for Next.js but purely serverless; problematic for GramJS sessions and scheduled jobs.
- **DigitalOcean / Hetzner**: More manual configuration (VPS); higher operational burden for a solo developer.
- **Fly.io**: Good for persistent apps but more complex deployment and networking model than Railway.

## Consequences
- **Benefits**: Simple "PaaS" experience; integrated managed Postgres; support for always-on containers; easy env var management; native pnpm support.
- **Costs**: Higher cost than basic serverless if app sits idle; Railway-specific deployment conventions.
