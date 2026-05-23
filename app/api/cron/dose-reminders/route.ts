import { NextResponse } from 'next/server';
import { dispatchDoseReminders } from '@/lib/notifications/application/ReminderDispatcher';

export const dynamic = 'force-dynamic';

/**
 * Dose-reminder dispatch cron (Task 5.2, ADR-012).
 *
 * Triggered every 15 minutes by Railway Cron with
 * `Authorization: Bearer ${CRON_SECRET}`. The dispatcher reads all enabled
 * `ReminderPreference` rows, filters by per-user local time window, and
 * sends push + email per the user's channel + permission state. Returns a
 * summary object suitable for Railway's cron audit log.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await dispatchDoseReminders(new Date());
    return NextResponse.json(summary);
  } catch (err) {
    // Catch-all for fatal errors (DB unreachable, etc.) so Railway records
    // a 500 instead of a hung request. Per-user errors are caught inside
    // the dispatcher and reported via summary.errors.
    return NextResponse.json(
      { error: 'dispatch_failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
