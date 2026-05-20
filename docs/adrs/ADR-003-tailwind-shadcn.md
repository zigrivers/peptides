# ADR-003: Use Tailwind CSS and shadcn/ui for Frontend

## Status
Accepted

## Context
The UI needs to be functional-first, accessible (WCAG 2.1 AA), and mobile-responsive. A solo developer needs to iterate quickly on UI without a dedicated designer.

## Decision
We will use Tailwind CSS 3.x for styling and shadcn/ui for component primitives.

## Alternatives Considered
- **Vanilla CSS / CSS Modules**: Maximum flexibility but slower iteration speed for common UI patterns.
- **Material UI / Mantine**: Robust but harder to customize deeply; black-box dependencies.
- **Tailwind v4**: Too new (unstable) at the time of project initialization.

## Consequences
- **Benefits**: Rapid prototyping with utility classes; copy-paste component model allows full control; high AI training coverage; accessible by default via Radix UI.
- **Costs**: "Tailwind noise" in markup; learning curve for shadcn/ui customization patterns.
