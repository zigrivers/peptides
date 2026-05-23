import { NextResponse } from 'next/server';
import { markVialsExpired } from '@/lib/reconstitution/application/VialExpiryService';

export const dynamic = 'force-dynamic';

/**
 * Vial expiry cron (Task 6.4, ADR-012). Triggered daily by Railway Cron
 * with `Authorization: Bearer ${CRON_SECRET}`. Transitions vials whose
 * `expiresAt` has passed from RECONSTITUTED to EXPIRED and emits one
 * VIAL_EXPIRED audit per transition. Idempotent.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || !auth || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { expired } = await markVialsExpired(new Date());
    return NextResponse.json({ expired });
  } catch (err) {
    return NextResponse.json(
      { error: 'vial_expiry_failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
