# ADR-002: Use PostgreSQL with Prisma ORM

## Status
Accepted

## Context
The application requires a relational data model for compounds, protocols, logs, and orders. We need strict type safety and migrations for a evolving schema.

## Decision
We will use PostgreSQL 16 (managed by Railway) as the primary database, with Prisma 5.x as the Object-Relational Mapper (ORM).

## Alternatives Considered
- **Drizzle ORM**: SQL-first and lightweight, but Prisma has superior AI compatibility and schema-first DX.
- **MongoDB**: Flexible but lacks built-in relational integrity needed for safety-critical protocol/vial linkages.
- **SQLite (local-first)**: Simplifies some things but complicates multi-user data synchronization and server-side Telegram session management.

## Consequences
- **Benefits**: Type-safe queries generated from `schema.prisma`; easy migrations; managed backups on Railway; JSONB support for flexible metadata.
- **Costs**: Prisma Client overhead; potential connection pooling issues at scale (mitigated by low user count).
