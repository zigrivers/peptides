'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { parseStrictUTCDate, utcMidnightToday } from '@/lib/shared/date';
import { batchLogDoses } from '@/lib/tracker/application/BatchLogService';
import type { BatchLogItemResult } from '@/lib/tracker/domain/types';

const InputSchema = z.object({
  selectedProtocolIds: z.array(z.string().min(1)).optional(),
  selections: z.array(z.object({
    protocolId: z.string().min(1),
    doseSlot: z.number().int().min(0).optional(),
    injectionSite: z.object({
      bodyPart: z.string().min(1),
      side: z.enum(['left', 'right']),
    }).nullable().optional(),
  })).optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (must be YYYY-MM-DD)').optional(),
}).refine(
  (value) => (value.selectedProtocolIds?.length ?? 0) > 0 || (value.selections?.length ?? 0) > 0,
  { message: 'Select at least one dose to log.' }
);

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

  const { selectedProtocolIds, selections, scheduledDate: scheduledDateInput } = parsed.data;
  const actorUserId = session.user.id;

  const scheduledDate = scheduledDateInput
    ? parseStrictUTCDate(scheduledDateInput)
    : utcMidnightToday();

  if (!scheduledDate) {
    return { ok: false, error: 'invalid_input', message: 'Invalid scheduled date value.' };
  }

  try {
    const result = await batchLogDoses({ actorUserId, selectedProtocolIds, selections, scheduledDate });

    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true, results: result.results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: 'unknown', message: msg };
  }
}
