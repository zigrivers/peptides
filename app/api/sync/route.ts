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
  const body = await req.json() as { entries?: unknown };
  const { entries } = body;

  if (!Array.isArray(entries)) {
    return NextResponse.json({ error: 'Invalid input: entries must be an array' }, { status: 400 });
  }

  const results: EntryResult[] = await Promise.all(
    (entries as unknown[]).map(async (raw): Promise<EntryResult> => {
      if (!raw || typeof raw !== 'object' || !('id' in raw)) {
        return { id: String((raw as Record<string, unknown>)?.id ?? 'unknown'), ok: false, error: 'Invalid entry format' };
      }
      const entry = raw as SyncEntry;
      try {
        await logDose({
          actorUserId,
          protocolId: entry.protocolId,
          scheduledDate: new Date(`${entry.scheduledDate}T00:00:00Z`),
          amount: entry.amount,
          status: entry.status,
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
