'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { updateProtocol } from '@/lib/tracker/application/ProtocolService';
import { revalidatePath } from 'next/cache';

const DoseAmountSchema = z.object({
  amount: z.string().min(1),
  unit: z.enum(['mcg', 'mg', 'IU', 'mL']),
});

const ScheduleSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('Daily') }),
  z.object({ frequency: z.literal('EOD') }),
  z.object({
    frequency: z.literal('SpecificDaysOfWeek'),
    daysOfWeek: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).min(1),
  }),
  z.object({
    frequency: z.literal('CustomInterval'),
    intervalDays: z.number().int().min(1),
  }),
]);

const InputSchema = z.object({
  protocolId: z.string().uuid(),
  compoundId: z.string().min(1).optional(),
  dose: DoseAmountSchema.optional(),
  schedule: ScheduleSchema.optional(),
  administrationRoute: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type UpdateProtocolError =
  | 'unauthorized'
  | 'not_found'
  | 'validation_error'
  | 'dose_validation_error'
  | 'system_error';

export type UpdateProtocolResult =
  | { ok: true; protocolId: string }
  | { ok: false; error: UpdateProtocolError; message?: string };

export async function updateProtocolAction(
  rawInput: unknown
): Promise<UpdateProtocolResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: parsed.error.message };
  }

  try {
    const protocol = await updateProtocol({
      actorUserId: session.user.id,
      ...parsed.data,
    });
    revalidatePath('/tracker');
    revalidatePath('/regimen');
    revalidatePath('/dashboard');
    revalidatePath(`/tracker/protocols/${protocol.id}`);
    return { ok: true, protocolId: protocol.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found' };
    if (/dose/i.test(msg)) return { ok: false, error: 'dose_validation_error', message: msg };
    console.error('[updateProtocolAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
