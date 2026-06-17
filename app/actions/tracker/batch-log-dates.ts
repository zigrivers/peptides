'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { logDose } from '@/lib/tracker/application/DoseLogService';
import { getManagedUserIds } from '@/lib/tracker/application/ProtocolService';
import { findProtocolByIdForActor } from '@/lib/tracker/infrastructure/ProtocolRepo';
import { getDoseSlots } from '@/lib/tracker/domain/doseSlots';
import { parseStrictUTCDate } from '@/lib/shared/date';
import type { DoseAmount } from '@/lib/tracker/domain/types';

const InjectionSiteSchema = z.object({
  bodyPart: z.string().min(1),
  side: z.enum(['left', 'right']),
});

const InputSchema = z.object({
  protocolId: z.string().min(1),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (must be YYYY-MM-DD)')).min(1),
  status: z.enum(['LOGGED', 'SKIPPED']),
  injectionSite: InjectionSiteSchema.optional(),
  note: z.string().max(1000).optional(),
});

type BatchLogDatesResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

export async function batchLogDatesAction(input: unknown): Promise<BatchLogDatesResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { protocolId, dates: rawDates, status, injectionSite, note } = parsed.data;
  const actorUserId = session.user.id;

  const dates: Date[] = [];
  for (const dateStr of rawDates) {
    const d = parseStrictUTCDate(dateStr);
    if (!d) {
      return { ok: false, error: 'invalid_input', message: 'Invalid calendar date.' };
    }
    dates.push(d);
  }

  try {
    // Resolve protocol and verify ownership scoping first
    const managedIds = await getManagedUserIds(actorUserId);
    const protocol = await findProtocolByIdForActor(prisma, protocolId, actorUserId, managedIds);
    if (!protocol) {
      return { ok: false, error: 'protocol_not_found', message: 'Protocol not found.' };
    }
    if (protocol.status !== 'ACTIVE') {
      return { ok: false, error: 'protocol_not_active', message: 'Protocol is not active.' };
    }

    // Each scheduled day may carry more than one dose slot (twice-daily protocols have slots
    // 0 and 1); once-daily protocols have a single slot 0. Log every slot for every date so a
    // twice-daily protocol records both doses per day rather than only the first.
    const slots = getDoseSlots(protocol.schedule);

    // Run batch log inside transaction using transaction propagation
    await prisma.$transaction(async (tx) => {
      for (const date of dates) {
        for (const slot of slots) {
          await logDose({
            actorUserId,
            protocolId,
            scheduledDate: date,
            doseSlot: slot.slot,
            amount: protocol.dose as unknown as DoseAmount,
            status,
            injectionSite,
            note,
            requireInjectionSite: false, // Disable required injection site check for batch actions
          }, tx);
        }
      }
    });

    revalidatePath(`/tracker/protocols/${protocolId}`);
    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (/dose_log_too_late/i.test(msg)) {
      return { ok: false, error: 'dose_log_too_late', message: 'Cannot log a dose for a future date.' };
    }
    if (/dose_log_off_schedule/i.test(msg)) {
      return { ok: false, error: 'dose_log_off_schedule', message: 'Cannot log a dose for an off-schedule date.' };
    }
    if (/vial_not_found/i.test(msg)) {
      return { ok: false, error: 'vial_not_found', message: 'Vial does not belong to this user.' };
    }
    return { ok: false, error: 'unknown', message: msg };
  }
}
