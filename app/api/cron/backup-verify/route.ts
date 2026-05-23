import { NextResponse } from 'next/server';
import { prisma } from '@/lib/shared/prisma';

export const dynamic = 'force-dynamic';

/**
 * Backup verify cron (Task 6.3, PRD §8.7 + ADR-012).
 *
 * Daily 05:00 UTC via Railway Cron with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * What this cron actually verifies in v1:
 *   - The database is reachable via a `prisma.$queryRaw\`SELECT 1\``
 *     round-trip. If it throws (network blip, exhausted connection
 *     pool, DB stopped), the route returns 500. Railway's existing
 *     non-2xx alerting picks up the failure and pages.
 *
 * What this does NOT verify (yet — known limitation, documented in
 * tasks/lessons.md):
 *   - That Railway's daily snapshot actually completed. Railway's
 *     backup API isn't integrated; checking it requires an API token
 *     we don't have provisioned. The liveness check above is the v1
 *     proxy — a DB that's unreachable is the most common cause of a
 *     missed backup, and this catches it.
 *   - Row-level freshness. A previous iteration checked
 *     `User.updatedAt`, but low-traffic environments produce false
 *     positives (a solo dev's profile not updated in 72h is normal,
 *     not a backup failure). Dropped.
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

  // eslint-disable-next-line no-console
  console.info('[backup-verify] heartbeat ok', { verifiedAt });
  return NextResponse.json({ ok: true, verifiedAt });
}
