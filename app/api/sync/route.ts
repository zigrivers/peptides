import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logDose } from '@/lib/tracker/application/DoseLogService';

type SyncEntry = {
  id: string;
  protocolId: string;
  scheduledDate: string;
  amount: { amount: string; unit: 'mcg' | 'mg' | 'IU' | 'mL' };
  status: 'LOGGED' | 'SKIPPED';
};

type EntryResult = { id: string; ok: true } | { id: string; ok: false; error: string };

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actorUserId = session.user.id;
  const body = await req.json() as { entries: SyncEntry[] };
  const { entries } = body;

  const results: EntryResult[] = await Promise.all(
    entries.map(async (entry): Promise<EntryResult> => {
      try {
        await logDose({
          actorUserId,
          protocolId: entry.protocolId,
          scheduledDate: new Date(`${entry.scheduledDate}T00:00:00Z`),
          amount: entry.amount,
          status: entry.status,
          idempotencyKey: entry.id,
        });
        return { id: entry.id, ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'sync_error';
        return { id: entry.id, ok: false, error: message };
      }
    })
  );

  return NextResponse.json({ results });
}
