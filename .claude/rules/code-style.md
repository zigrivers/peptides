---
description: TypeScript naming, formatting, and colocation conventions
globs: ["**/*.ts", "**/*.tsx"]
---

# Code Style Rules

- **Naming**: `camelCase` for variables/functions, `PascalCase` for types/classes/components, `kebab-case.ts` for modules.
- **Colocation**: Keep components, hooks, and types used by only one route inside that route's `_components/` or `_lib/` directory.
- **Exports**: Prefer named exports over default exports for better discoverability.
- **Types**: No bare `any`. Use `unknown` or strictly typed Zod schemas.
- **Import Order**: External packages, then internal aliased modules (`@/*`), then relative imports.
