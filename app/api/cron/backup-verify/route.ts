import { NextResponse } from 'next/server';
import { prisma } from '@/lib/shared/prisma';

export const dynamic = 'force-dynamic';

const STALE_DB_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Backup verify cron (Task 6.3, PRD §8.7 + ADR-012).
 *
 * Daily 05:00 UTC via Railway Cron with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * What this cron actually verifies in v1:
 *   1. The database is reachable (`prisma.$queryRaw` round-trip). A
 *      failed query returns 500 — Railway's existing alerting picks up
 *      the non-2xx and pages.
 *   2. The User table has been written to within the last 72 hours.
 *      A frozen User updatedAt is a strong indicator that the prod DB
 *      has diverged from the backup source (e.g., we're reading a
 *      replica that's no longer being replicated to). Returns 503 with
 *      a `db_stale: true` flag.
 *
 * What this does NOT verify (yet — known limitation):
 *   - That Railway's daily snapshot actually completed. Railway's
 *     backup API isn't integrated; checking it requires an API token
 *     we don't have provisioned. The above checks are the v1 proxy.
 *
 * Future Sentry upgrade: replace the structured log with
 * `Sentry.captureCheckIn({ monitorSlug: 'backup-verify', status })`
 * once @sentry/nextjs is added.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const verifiedAt = new Date().toISOString();

  // Liveness check: the DB responds.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[backup-verify] db unreachable', { verifiedAt, err: (err as Error).message });
    return NextResponse.json(
      { ok: false, verifiedAt, error: 'db_unreachable' },
      { status: 500 }
    );
  }

  // Freshness check: the User table has been touched recently.
  const mostRecentUser = await prisma.user.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  if (mostRecentUser) {
    const sinceLastUpdateMs = Date.now() - mostRecentUser.updatedAt.getTime();
    if (sinceLastUpdateMs > STALE_DB_THRESHOLD_MS) {
      // eslint-disable-next-line no-console
      console.error('[backup-verify] user-table stale', {
        verifiedAt,
        lastUserUpdate: mostRecentUser.updatedAt.toISOString(),
        sinceLastUpdateMs,
      });
      return NextResponse.json(
        {
          ok: false,
          verifiedAt,
          error: 'db_stale',
          lastUserUpdate: mostRecentUser.updatedAt.toISOString(),
        },
        { status: 503 }
      );
    }
  }

  // eslint-disable-next-line no-console
  console.info('[backup-verify] heartbeat ok', { verifiedAt });
  return NextResponse.json({
    ok: true,
    verifiedAt,
    lastUserUpdate: mostRecentUser?.updatedAt.toISOString() ?? null,
  });
}
