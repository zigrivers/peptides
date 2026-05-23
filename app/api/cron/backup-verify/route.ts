import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Backup verify cron (Task 6.3, PRD §8.7 + ADR-012).
 *
 * Daily 05:00 UTC via Railway Cron with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Implementation note for v1:
 *   Railway Cron's existence proves the platform's scheduler is healthy.
 *   The PRD operational guarantee is "alert via Sentry on miss". For v1
 *   we emit a structured log line (a future Sentry integration can poll
 *   for this or replace it with a check-in heartbeat). When Sentry is
 *   wired up, swap the console.info for a `Sentry.captureCheckIn` call.
 *
 * Future Sentry upgrade:
 *   - Import `@sentry/nextjs` (already a dependency once added).
 *   - Replace the log with `Sentry.captureCheckIn({ monitorSlug:
 *     'backup-verify', status: 'ok' })`.
 *   - Configure the Sentry monitor with a 24h+15m expected schedule;
 *     missed cron firings will then page.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const verifiedAt = new Date().toISOString();
  // Structured log — drainable by Sentry/Logtail/Datadog when integrated.
  // eslint-disable-next-line no-console
  console.info('[backup-verify] heartbeat', { verifiedAt });
  return NextResponse.json({ ok: true, verifiedAt });
}
