import { NextResponse } from 'next/server';
import { markOrdersStale } from '@/lib/ordering/application/OrderService';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ADR-015 / US-ORD-08: cron is a clean no-op when ordering is disabled.
  // Not a 404 because Railway Cron invokes this on schedule with a valid
  // CRON_SECRET — a noisy failure would spam the runbook alerts.
  if (isOrderingDisabled()) {
    return NextResponse.json({ skipped: true, reason: 'ordering_disabled' });
  }
  const staled = await markOrdersStale(new Date());
  return NextResponse.json({ staled });
}
