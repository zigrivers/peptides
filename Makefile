.PHONY: help dev test lint format check setup db-setup db-reset clean

.DEFAULT_GOAL := help

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev: ## Start Next.js dev server
	pnpm dev

test: ## Run unit and integration tests
	pnpm test

e2e: ## Run Playwright E2E tests
	pnpm e2e

lint: ## Run ESLint and Prettier checks
	pnpm lint

typecheck: ## Run TypeScript compiler check
	pnpm typecheck

check: lint typecheck test ## Run all quality gates

eval: ## Run automated checks
	pnpm eval

setup: ## First-time project setup
	pnpm install
	cp .env.example .env
	docker compose up -d
	pnpm prisma migrate dev
	pnpm prisma db seed

db-setup: ## Setup local database
	docker compose up -d
	pnpm prisma migrate dev

db-reset: ## Wipe and re-seed local database
	pnpm prisma migrate reset --force
	pnpm prisma db seed

clean: ## Remove build artifacts
	rm -rf .next node_modules
