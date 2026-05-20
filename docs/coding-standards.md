# Coding Standards

**Status:** Draft  
**Date:** 2026-05-20  
**Tech Stack source:** `docs/tech-stack.md`  
**Methodology:** deep | Depth: 5/5

---

## 1. Project Structure

We use the Next.js 15 App Router directory structure with a focus on colocation.

```
/
├── app/                # Next.js App Router (Routes, Layouts, Server Actions)
│   ├── (auth)/         # Auth-related routes (grouped)
│   ├── (dashboard)/    # Dashboard and tracker routes (grouped)
│   ├── api/            # Route handlers (Machine-to-machine, PWA sync, Cron)
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Homepage
├── components/         # Shared React components
│   ├── ui/             # shadcn/ui components (copy-pasted)
│   └── shared/         # Custom shared components
├── lib/                # Shared utilities and core logic
│   ├── db.ts           # Prisma client instance
│   ├── telegram/       # GramJS client and session management
│   ├── math/           # Reconstitution and dose calculations
│   └── utils.ts        # shadcn/ui helper
├── hooks/              # Custom React hooks
├── styles/             # Global CSS
├── prisma/             # Database schema and migrations
├── public/             # Static assets and PWA icons
└── docs/               # Project documentation
```

**Conventions:**
- **Colocation**: Keep components, hooks, and types used by only one route inside that route's directory (e.g., `app/(dashboard)/tracker/_components/`).
- **Path Aliases**: Use `@/` for `src/` or root imports (e.g., `import { db } from "@/lib/db"`). Avoid deep relative paths (`../../../`).

---

## 2. Naming Conventions

| Context | Standard | Example |
|---------|----------|---------|
| Variables / Functions | `camelCase` | `const doseAmount = 250;` |
| Types / Interfaces / Classes | `PascalCase` | `interface ProtocolProps {}` |
| React Components | `PascalCase` | `function DoseLogForm() {}` |
| File Names (Modules) | `kebab-case.ts` | `reconstitution-math.ts` |
| File Names (Components) | `PascalCase.tsx` | `DoseLogForm.tsx` |
| Next.js Pages / Layouts | `page.tsx`, `layout.tsx` | (Fixed by Next.js) |
| CSS Classes | `Tailwind classes` | `className="flex flex-col gap-4"` |
| Database Tables | `PascalCase` (Prisma) | `model DoseLog {}` |
| Database Columns | `camelCase` (Prisma) | `loggedAt DateTime` |
| Environment Variables | `UPPER_SNAKE_CASE` | `DATABASE_URL` |

---

## 3. Code Patterns

### 3.1 Server Components vs. Client Components
- **Default to Server Components (RSC)**: Every component is a Server Component unless it needs interactivity.
- **`"use client"` Boundary**: Use only at the leaf nodes (forms, buttons, interactive charts).
- **Data Fetching**: Fetch data in Server Components (pages or layouts) and pass to Client Components as props.

### 3.2 Server Actions
- Use Server Actions for all mutations (creating protocols, logging doses, submitting orders).
- Place actions in `app/actions.ts` or close to the route they serve.
- **Validation**: Always validate inputs with Zod inside the Server Action.

```typescript
// Example Server Action
export async function logDose(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const validated = doseSchema.parse(Object.fromEntries(formData));
  
  await db.doseLog.create({
    data: { ...validated, userId: session.user.id }
  });
  
  revalidatePath("/dashboard");
}
```

### 3.3 State Management
- **URL State**: Use `useSearchParams` for filters and tabs.
- **Server State**: Use TanStack Query for client-side background sync.
- **UI State**: Use React `useState` or Context for simple local state (e.g., multi-step wizard).

---

## 4. Type Safety

- **Strict Mode**: `tsconfig.json` must have `"strict": true`.
- **No `any`**: Use `unknown` if a type is truly unknown, then narrow with Zod or type guards.
- **Zod Schemas**: Every form and API input must have a corresponding Zod schema.

```typescript
// Zod + TypeScript integration
const doseSchema = z.object({
  amount: z.number().positive(),
  compoundId: z.string().uuid(),
});

type DoseInput = z.infer<typeof doseSchema>;
```

---

## 5. Security Guardrails

- **IDOR Protection**: Every database query MUST include the `userId` of the currently authenticated user.
  - `db.protocol.findFirst({ where: { id, userId: session.user.id } })`
- **Audit Logging**: Use the `lib/audit.ts` helper to record all protocol mutations and order events.
- **Sensitive Data**: Never log or return sensitive data (Telegram session strings, wallet addresses) to the client.

---

## 6. Database Access (Prisma)

- **One Client**: Use a singleton pattern for the Prisma client to avoid connection pool exhaustion in development.
- **Migrations**: Always use `npx prisma migrate dev` for schema changes.
- **Soft Deletes**: Use the `archivedAt` column for compounds; do not hard delete if referenced by history.

---

## 7. AI-Specific Rules

To help AI agents work effectively:
- **No Dead Code**: Do not leave commented-out code or unused imports.
- **Small Files**: Keep files under 250 lines. Split large components into sub-components.
- **Explicit Exports**: Prefer named exports over default exports for better IDE/AI discoverability.
- **Predictable Patterns**: Follow the shadcn/ui and Next.js conventions strictly. AI models are trained heavily on these.

---

## 8. Commit Messages

Follow Conventional Commits: `type(scope): description`.

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, missing semi colons, etc (no code changes) |
| `refactor` | Refactoring production code |
| `test` | Adding missing tests, refactoring tests |
| `chore` | Updating build tasks, package manager configs, etc |

---

## 9. Code Review Checklist

- [ ] Does this query include `userId` scoping (IDOR protection)?
- [ ] Is input validation performed on the server with Zod?
- [ ] Are all dose/math calculations covered by unit tests?
- [ ] Is `"use client"` used only where interactivity is required?
- [ ] Does the commit message follow the conventional format?
- [ ] Are there any `any` types that could be replaced with `unknown`?
- [ ] Is the PRD requirements traceability preserved?
