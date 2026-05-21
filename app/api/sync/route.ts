import { z } from 'zod';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logDose } from '@/lib/tracker/application/DoseLogService';

const syncEntrySchema = z.object({
  id: z.string(),
  protocolId: z.string(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.object({
    amount: z.string(),
    unit: z.enum(['mcg', 'mg', 'IU', 'mL']),
  }),
  status: z.enum(['LOGGED', 'SKIPPED']),
});

type SyncEntry = z.infer<typeof syncEntrySchema>;
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
    entries.map(async (raw): Promise<EntryResult> => {
      const parsed = syncEntrySchema.safeParse(raw);
      if (!parsed.success) {
        const id = raw && typeof raw === 'object' && 'id' in raw ? String((raw as Record<string, unknown>).id) : 'unknown';
        return { id, ok: false, error: 'Invalid entry format' };
      }
      const entry: SyncEntry = parsed.data;
      try {
        await logDose({
          actorUserId,
          protocolId: entry.protocolId,
          scheduledDate: new Date(`${entry.scheduledDate}T00:00:00Z`),
          amount: entry.amount,
          status: entry.status,
        });
        return { id: String(entry.id), ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'sync_error';
        return { id: String(entry.id), ok: false, error: message };
      }
    })
  );

  return NextResponse.json({ results });
}
