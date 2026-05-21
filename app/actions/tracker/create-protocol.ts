'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createProtocol, isAuthorizedSubject } from '@/lib/tracker/application/ProtocolService';
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
  subjectUserId: z.string().uuid(),
  compoundId: z.string().min(1),
  cycleId: z.string().uuid().optional(),
  dose: DoseAmountSchema,
  schedule: ScheduleSchema,
  administrationRoute: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export type CreateProtocolError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'dose_validation_error'
  | 'system_error';

export type CreateProtocolResult =
  | { ok: true; protocolId: string }
  | { ok: false; error: CreateProtocolError; message?: string };

export async function createProtocolAction(
  rawInput: unknown
): Promise<CreateProtocolResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error', message: parsed.error.message };
  }

  // Verify the actor is allowed to create protocols for subjectUserId:
  // allowed if assigning to themselves, or if subjectUserId is one of their managed users.
  const authorized = await isAuthorizedSubject(session.user.id, parsed.data.subjectUserId);
  if (!authorized) return { ok: false, error: 'forbidden' };

  try {
    const protocol = await createProtocol({
      actorUserId: session.user.id,
      subjectUserId: parsed.data.subjectUserId,
      compoundId: parsed.data.compoundId,
      cycleId: parsed.data.cycleId,
      dose: parsed.data.dose,
      schedule: parsed.data.schedule,
      administrationRoute: parsed.data.administrationRoute,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      notes: parsed.data.notes,
    });
    revalidatePath('/tracker');
    revalidatePath('/dashboard');
    return { ok: true, protocolId: protocol.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/compound|dose/i.test(msg)) {
      return { ok: false, error: 'dose_validation_error', message: msg };
    }
    console.error('[createProtocolAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
