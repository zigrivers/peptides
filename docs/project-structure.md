# Project Structure

**Status:** Draft  
**Date:** 2026-05-20  
**Tech Stack source:** `docs/tech-stack.md`  
**Methodology:** deep | Depth: 5/5

---

## 1. Module Organization Strategy: Feature-Based Slices

We use a feature-based organization strategy within the Next.js App Router structure. Each bounded context (Auth, Tracker, Reference, Ordering, Reconstitution) is treated as a "slice" with its own domain, application, and infrastructure layers.

### 1.1 High-Level Tree
```
/
├── app/                        # Next.js App Router (UI & Routing)
│   ├── (auth)/                 # Auth route group
│   ├── (dashboard)/            # Dashboard route group
│   ├── ordering/               # Ordering (Isolated module)
│   ├── api/                    # Route Handlers (Sync, Cron, Webhooks)
│   └── actions/                # Server Action Entrypoints (Entry gates)
├── lib/                        # Core Logic (The Bounded Context Slices)
│   ├── {module}/               # e.g., auth, tracker, ordering
│   │   ├── domain/             # Entities, Value Objects, Domain Events
│   │   ├── application/        # Services, Use Cases, Port Definitions
│   │   └── infrastructure/     # Prisma Repos, API Clients, Adapters
│   ├── jobs/                   # Background Task implementations
│   └── shared/                 # Truly cross-cutting utilities & types
├── components/                 # Shared React Components
│   ├── ui/                     # shadcn/ui primitives
│   └── shared/                 # Shared layout/logic components
├── hooks/                      # Shared Custom Hooks
├── styles/                     # Global CSS & Tailwind Config
├── prisma/                     # DB Schema & Migrations
├── public/                     # Static Assets & PWA Manifest
└── worker/                     # PWA Service Worker (Serwist)
```

---

## 2. File Placement Rules

| File Type | Location | Example |
|-----------|----------|---------|
| **Page** | `app/**/page.tsx` | `app/tracker/page.tsx` |
| **Component (Page-specific)** | `app/**/_components/` | `app/tracker/_components/LogForm.tsx` |
| **Component (Shared)** | `components/shared/` | `components/shared/UserAvatar.tsx` |
| **Server Action** | `app/actions/{module}/` | `app/actions/tracker/log-dose.ts` |
| **Domain Entity** | `lib/{module}/domain/` | `lib/tracker/domain/DoseLog.ts` |
| **Application Service** | `lib/{module}/application/` | `lib/tracker/application/SyncService.ts` |
| **Database Repo** | `lib/{module}/infrastructure/` | `lib/tracker/infrastructure/PrismaDoseLogRepo.ts` |
| **Utility (Shared)** | `lib/shared/utils/` | `lib/shared/utils/date-formatter.ts` |
| **Unit Test** | Colocated with implementation | `log-dose.test.ts` |
| **E2E Test** | `tests/e2e/` | `tests/e2e/payment-gate.spec.ts` |

---

## 3. Import Conventions & Path Aliases

We use path aliases to avoid deep relative paths.

| Alias | Target |
|-------|--------|
| `@/*` | `/*` (root) |
| `@/app/*` | `app/*` |
| `@/lib/*` | `lib/*` |
| `@/components/*` | `components/*` |
| `@/hooks/*` | `hooks/*` |

**Ordering Rules**:
1. External libraries (React, Next, etc.)
2. Path-aliased internal imports (`@/*`)
3. Relative internal imports (`./`, `../`)
4. Styles/Assets

---

## 4. Barrel File Policy (index.ts)

- **Feature Barrels**: Every directory in `lib/{module}/` must have an `index.ts` that exports the public API for that slice.
- **Components**: `components/ui/index.ts` is optional (shadcn standard is preferred).
- **Rule**: Never import from the internal files of another module; always go through the barrel.

---

## 5. Generated vs. Committed Files

| Path | Category | Rule |
|------|----------|------|
| `.next/` | Generated | Never commit |
| `node_modules/` | Generated | Never commit |
| `prisma/client/` | Generated | Never commit |
| `public/sw.js` | Generated | Committed (Serwist output) |
| `docs/reviews/` | Committed | Mandatory for pipeline history |

---

## 6. High-Contention Files

| File | Risk | Mitigation |
|------|------|------------|
| `prisma/schema.prisma` | DB changes | Use descriptive field names; sync frequently. |
| `app/actions.ts` | All mutations | **Avoid**: Use module-specific action files instead. |
| `lib/shared/types.ts` | Shared types | **Avoid**: Colocate types with their domain if possible. |
