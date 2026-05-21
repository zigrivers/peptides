'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { createCycle, restartCycle } from '@/lib/tracker/application/CycleService';
import type { Cycle } from '@/lib/tracker/domain/types';

const CreateCycleSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const RestartCycleSchema = z.object({
  cycleId: z.string().min(1),
  newStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function parseUTCDate(iso: string): Date {
  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)!.map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

type CreateResult = { ok: true; cycle: Cycle } | { ok: false; error: string; message: string };
type RestartResult = { ok: true; newCycle: Cycle } | { ok: false; error: string; message: string };

export async function createCycleAction(input: unknown): Promise<CreateResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };

  const parsed = CreateCycleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const { name, startDate: startDateStr, endDate: endDateStr } = parsed.data;
  const startDate = parseUTCDate(startDateStr);
  const endDate = endDateStr ? parseUTCDate(endDateStr) : undefined;

  try {
    const cycle = await createCycle({ actorUserId: session.user.id, name, startDate, endDate });
    revalidatePath('/tracker/cycles');
    revalidatePath('/tracker');
    return { ok: true, cycle };
  } catch (err) {
    return { ok: false, error: 'unknown', message: err instanceof Error ? err.message : 'Unknown error.' };
  }
}

export async function restartCycleAction(input: unknown): Promise<RestartResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };

  const parsed = RestartCycleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const { cycleId, newStartDate: newStartDateStr } = parsed.data;
  const newStartDate = parseUTCDate(newStartDateStr);

  try {
    const { newCycle } = await restartCycle({ actorUserId: session.user.id, cycleId, newStartDate });
    revalidatePath('/tracker/cycles');
    revalidatePath('/tracker');
    return { ok: true, newCycle };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error.';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found', message: msg };
    return { ok: false, error: 'unknown', message: msg };
  }
}
