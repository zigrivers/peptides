# ADR-004: Use Auth.js v5 for Authentication

## Status
Accepted

## Context
The application needs secure authentication (Email/Password), session management (30-day rolling), and role-based access control (Power User vs Managed User).

## Decision
We will use Auth.js v5 (NextAuth) with the Credentials provider and Prisma adapter.

## Alternatives Considered
- **Better Auth**: Newer and well-designed, but less AI training data available than Auth.js.
- **Lucia Auth**: Deprecated by author in 2024.
- **Custom JWT session**: More work to implement secure rolling refresh, CSRF protection, and edge middleware integration.

## Consequences
- **Benefits**: Native integration with Next.js App Router; large ecosystem; easy database persistence via Prisma adapter; handles complex auth flows out-of-the-box.
- **Costs**: Learning curve for v5 beta patterns; some friction with custom "password reset" flows which must be implemented manually.
