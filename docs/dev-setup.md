# Developer Setup Guide

This guide will get you from a fresh clone to a running development environment in under 5 minutes.

## 1. Prerequisites

- **Node.js**: 22.x (LTS)
- **pnpm**: 9.x
- **Docker**: For running the local PostgreSQL database.

## 2. Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Setup environment
cp .env.example .env

# 3. Start local database
docker compose up -d

# 4. Run migrations and seed data
pnpm prisma migrate dev
pnpm prisma db seed

# 5. Start dev server
pnpm dev
```

The app will be running at [http://localhost:3000](http://localhost:3000).

## 3. Daily Development

| Task | Command |
|------|---------|
| Start dev server | `pnpm dev` (or `make dev`) |
| Run all tests | `pnpm test` |
| Run E2E tests | `pnpm e2e` |
| Run evals | `pnpm eval` |
| Run quality gates | `pnpm check` (or `make check`) — runs lint + typecheck + test + schema validate |
| Set up local DB | `pnpm db:setup` (or `make db-setup`) |
| Reset database | `pnpm db:reset` (or `make db-reset`) |
| Generate Prisma client | `pnpm prisma:generate` |

## 4. Environment Variables

See `.env.example` for the full list of required variables and their purpose. 
For local development, only `DATABASE_URL` is required for core features. MTProto features require a valid `TELEGRAM_APP_ID` and `TELEGRAM_APP_HASH`.

## 5. Architecture for Agents

Implementing agents should follow these rules:
- **Colocation**: Keep components close to the routes they serve.
- **TDD**: Write the test skeleton in `tests/acceptance/` before implementation.
- **Safety**: Never use `Float` for doses; use `Decimal`.
- **Auth**: Always scope queries by `userId`.

## 6. Troubleshooting

- **Database connection error**: Ensure Docker is running and the `DATABASE_URL` matches the `docker-compose.yml` config.
- **Next.js build failure**: Run `pnpm clean` and try again.
- **Prisma client sync**: Run `pnpm prisma generate` after schema changes.
