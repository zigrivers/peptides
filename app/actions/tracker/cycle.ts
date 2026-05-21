'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { createCycle, restartCycle } from '@/lib/tracker/application/CycleService';
import type { Cycle } from '@/lib/tracker/domain/types';

const calendarDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Invalid calendar date');

const CreateCycleSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: calendarDate,
  endDate: calendarDate.optional(),
});

const RestartCycleSchema = z.object({
  cycleId: z.string().min(1),
  newStartDate: calendarDate,
});

function parseUTCDate(iso: string): Date {
  // Zod's calendarDate validator already guarantees YYYY-MM-DD + valid calendar date.
  return new Date(`${iso}T00:00:00Z`);
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
  if (endDate && endDate <= startDate) {
    return { ok: false, error: 'invalid_input', message: 'End date must be after start date.' };
  }

  try {
    const cycle = await createCycle({ actorUserId: session.user.id, name, startDate, endDate });
    revalidatePath('/tracker/cycles');
    revalidatePath('/tracker');
    return { ok: true, cycle };
  } catch (err) {
    console.error('[createCycleAction] internal error:', err);
    return { ok: false, error: 'unknown', message: 'Could not create cycle. Please try again.' };
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
    const msg = err instanceof Error ? err.message : '';
    console.error('[restartCycleAction] internal error:', err);
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found', message: 'Cycle not found.' };
    return { ok: false, error: 'unknown', message: 'Could not restart cycle. Please try again.' };
  }
}
