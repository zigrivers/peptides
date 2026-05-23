import { NextResponse } from 'next/server';
import { purgeOldAuditEvents } from '@/lib/audit/application/AuditPurgeService';

export const dynamic = 'force-dynamic';

/**
 * Audit log purge cron (Task 6.3, ADR-009 + ADR-012).
 *
 * Daily 04:00 UTC via Railway Cron with `Authorization: Bearer ${CRON_SECRET}`.
 * Deletes AuditEvents older than 90 days. Idempotent.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { deleted, cutoff } = await purgeOldAuditEvents(new Date());
    return NextResponse.json({ deleted, cutoff: cutoff.toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: 'purge_failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
