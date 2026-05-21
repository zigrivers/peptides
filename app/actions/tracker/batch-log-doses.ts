'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { batchLogDoses } from '@/lib/tracker/application/BatchLogService';
import type { BatchLogItemResult } from '@/lib/tracker/domain/types';

const InputSchema = z.object({
  selectedProtocolIds: z.array(z.string().min(1)).min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type BatchLogActionResult =
  | { ok: true; results: BatchLogItemResult[] }
  | { ok: false; error: string; message: string };

export async function batchLogDosesAction(input: unknown): Promise<BatchLogActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { selectedProtocolIds, scheduledDate: scheduledDateStr } = parsed.data;
  const actorUserId = session.user.id;

  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDateStr)!.map(Number);
  const scheduledDate = new Date(Date.UTC(y, m - 1, d));
  if (
    isNaN(scheduledDate.getTime()) ||
    scheduledDate.getUTCFullYear() !== y ||
    scheduledDate.getUTCMonth() + 1 !== m ||
    scheduledDate.getUTCDate() !== d
  ) {
    return { ok: false, error: 'invalid_date', message: 'scheduledDate is not a valid calendar date.' };
  }

  try {
    const result = await batchLogDoses({ actorUserId, selectedProtocolIds, scheduledDate });

    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true, results: result.results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: 'unknown', message: msg };
  }
}
