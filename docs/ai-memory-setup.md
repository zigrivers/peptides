# AI Memory Configuration

This project uses a tiered memory stack to ensure agents remain effective across sessions.

## Tier 1: Modular Rules
Conventions are extracted from project docs into path-scoped rule files in `.claude/rules/`. These load automatically based on the files an agent is working on.

| Rule File | Active For | Concern |
|-----------|------------|---------|
| `code-style.md` | All `.ts(x)` files | Naming, colocation, types. |
| `safety-math.md` | Tracker/Reconstitution | Decimal precision, safety warnings. |
| `ordering.md` | Ordering module | MTProto security, fallback, safety gates. |
| `testing.md` | All test files | TDD, coverage, mobile E2E. |

## Tier 2: Persistent Memory (MCP)
The project is configured to use the **MCP Knowledge Graph** server for cross-session decision capture.

**MCP Server**: `@modelcontextprotocol/server-memory`  
**Persistence**: `.claude/memory-graph.json`

## Tier 3: External Context
(Optional) Library documentation servers (e.g. for GramJS or Next.js) can be added to `.claude/settings.json` to prevent API hallucinations.
