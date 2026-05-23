import { NextResponse } from 'next/server';
import { cleanupExpiredExports } from '@/lib/auth/application/exportCleanupService';

export const dynamic = 'force-dynamic';

/**
 * Async export cleanup cron (Task 6.2 R2 upgrade, ADR-014 + ADR-012).
 *
 * Daily 03:00 UTC via Railway Cron with `Authorization: Bearer ${CRON_SECRET}`.
 * Deletes R2 export objects older than 7 days and nulls out matching
 * DataExportRequest.downloadUrl rows. Returns a summary suitable for
 * Railway's cron audit log. Idempotent.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await cleanupExpiredExports(new Date());
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: 'export_cleanup_failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
