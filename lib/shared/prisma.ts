import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DATABASE_URL || '';
const bypassPgGuard = process.env.BYPASS_PG_GUARD === 'true';
const isTestOrBuild = process.env.NODE_ENV === 'test' || process.env.NEXT_PHASE === 'phase-production-build';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  (() => {
    const normalizedUrl = dbUrl.toLowerCase();
    if (!bypassPgGuard && !isTestOrBuild && !normalizedUrl.startsWith('postgres://') && !normalizedUrl.startsWith('postgresql://')) {
      throw new Error(
        `FATAL: Database connection error. PostgreSQL is a strict project-wide requirement. ` +
        `DATABASE_URL must start with 'postgres://' or 'postgresql://'. ` +
        `To bypass this guard for rare offline setups, set BYPASS_PG_GUARD=true.`
      );
    }
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  })();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
