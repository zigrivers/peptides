# ADR-001: Use Next.js 15 App Router for Full-Stack Monolith

## Status
Accepted

## Context
The application needs to handle both frontend UI (Tracker, Catalog, Dashboard) and backend logic (Dose Logging, Telegram integration, Auth). A solo developer needs a productive environment that minimizes context switching and operational overhead.

## Decision
We will use Next.js 15 with the App Router architecture as a full-stack monolith.

## Alternatives Considered
- **SvelteKit**: Smaller bundles, but less AI training data and smaller ecosystem for some integrations.
- **Express + Vite + React**: More control, but requires manual wiring for routing, layouts, and API boundaries. Higher maintenance cost.
- **Remix**: Excellent progressive enhancement, but smaller community than Next.js.

## Consequences
- **Benefits**: Single codebase for UI and API; unified type system; React Server Components (RSC) for zero-JS reference pages; built-in Server Actions for mutations.
- **Costs**: Learning curve for RSC boundaries; SSR complexity (hydration mismatches); dependence on Vercel or Node.js server for optimized hosting.
