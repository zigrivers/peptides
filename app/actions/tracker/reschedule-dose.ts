'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { getManagedUserIds } from '@/lib/tracker/application/ProtocolService';
import { findProtocolByIdForActor } from '@/lib/tracker/infrastructure/ProtocolRepo';
import { createDoseLog } from '@/lib/tracker/infrastructure/DoseLogRepo';
import { isScheduledOn } from '@/lib/tracker/domain/ScheduleGenerator';
import { parseSchedule } from '@/lib/tracker/domain/validation';
import { parseStrictUTCDate } from '@/lib/shared/date';
import type { DoseAmount } from '@/lib/tracker/domain/types';

const InputSchema = z.object({
  doseLogId: z.string().optional(),
  protocolId: z.string().min(1),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid source date format').optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid target date format'),
  doseSlot: z.number().int().min(0).optional().default(0),
});

type RescheduleDoseResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

function buildIdempotencyKey(userId: string, protocolId: string, scheduledDate: Date, doseSlot: number): string {
  const dateStr = scheduledDate.toISOString().slice(0, 10);
  return `${userId}:${protocolId}:${dateStr}:${doseSlot}`;
}

export async function rescheduleDoseAction(input: unknown): Promise<RescheduleDoseResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { doseLogId, protocolId, sourceDate: rawSourceDate, targetDate: rawTargetDate, doseSlot } = parsed.data;
  const actorUserId = session.user.id;

  const targetDate = parseStrictUTCDate(rawTargetDate);
  if (!targetDate) {
    return { ok: false, error: 'invalid_input', message: 'Invalid target date value.' };
  }
  const sourceDate = rawSourceDate ? parseStrictUTCDate(rawSourceDate) : null;
  if (rawSourceDate && !sourceDate) {
    return { ok: false, error: 'invalid_input', message: 'Invalid source date value.' };
  }

  try {
    // Resolve protocol and verify ownership scoping
    const managedIds = await getManagedUserIds(actorUserId);
    const protocol = await findProtocolByIdForActor(prisma, protocolId, actorUserId, managedIds);
    if (!protocol) {
      return { ok: false, error: 'protocol_not_found', message: 'Protocol not found.' };
    }
    if (protocol.status !== 'ACTIVE') {
      return { ok: false, error: 'protocol_not_active', message: 'Protocol is not active.' };
    }
    const subjectUserId = protocol.userId;

    // Check if targetDate has an existing DoseLog
    const targetLog = await prisma.doseLog.findFirst({
      where: { userId: subjectUserId, protocolId, scheduledDate: targetDate, doseSlot },
    });

    // Check if protocol is scheduled on targetDate
    const schedule = parseSchedule(protocol.schedule);
    const isVirtualScheduledOnTarget = isScheduledOn(schedule, protocol.startDate, protocol.endDate, targetDate);

    // Target Conflict Check:
    // Block if:
    // 1. targetLog exists with status LOGGED, SKIPPED, or PENDING
    // 2. OR targetLog does not exist but it is virtual scheduled on targetDate
    // (Exemption: targetLog has status 'RESCHEDULED' — we delete it and override)
    let hasConflict = false;
    if (targetLog) {
      if (['LOGGED', 'SKIPPED', 'PENDING'].includes(targetLog.status)) {
        hasConflict = true;
      }
    } else if (isVirtualScheduledOnTarget) {
      hasConflict = true;
    }

    if (hasConflict) {
      return { ok: false, error: 'reschedule_target_date_conflict', message: 'A dose is already scheduled or logged on the target date.' };
    }

    // Source Date Validation for Virtual Doses
    if (!doseLogId) {
      if (!sourceDate) {
        return { ok: false, error: 'invalid_input', message: 'sourceDate is required when rescheduling a virtual scheduled dose.' };
      }
      const isVirtualScheduledOnSource = isScheduledOn(schedule, protocol.startDate, protocol.endDate, sourceDate);
      if (!isVirtualScheduledOnSource) {
        return { ok: false, error: 'invalid_source_date', message: 'The source date is not a scheduled occurrence for this protocol.' };
      }
      const sourceLog = await prisma.doseLog.findFirst({
        where: { userId: subjectUserId, protocolId, scheduledDate: sourceDate, doseSlot },
      });
      if (sourceLog) {
        return { ok: false, error: 'source_date_not_empty', message: 'A dose log already exists on the source date.' };
      }
    }

    let affectedLogId = doseLogId || '';
    let derivedOriginalDate = sourceDate;

    await prisma.$transaction(async (tx) => {
      // 1. Delete move-back exception if exists, strictly scoped (F-001)
      if (targetLog && targetLog.status === 'RESCHEDULED') {
        await tx.doseLog.deleteMany({
          where: { id: targetLog.id, userId: subjectUserId, protocolId, doseSlot, status: 'RESCHEDULED' },
        });
      }

      if (doseLogId) {
        // 2. Fetch the DoseLog inside transaction and verify protocolId mismatch (F-002)
        const logToMove = await tx.doseLog.findFirst({
          where: { id: doseLogId, userId: subjectUserId },
        });
        if (!logToMove) {
          throw new Error('dose_log_not_found');
        }
        if (logToMove.protocolId !== protocolId) {
          throw new Error('protocol_mismatch');
        }

        derivedOriginalDate = logToMove.scheduledDate;

        // Update DoseLog scheduledDate and idempotencyKey (rebuilt with the dose slot
        // so it matches the canonical `${userId}:${protocolId}:${date}:${slot}` format).
        const newIdempotencyKey = buildIdempotencyKey(subjectUserId, protocolId, targetDate, doseSlot);
        const updateResult = await tx.doseLog.updateMany({
          where: { id: doseLogId, userId: subjectUserId, protocolId },
          data: {
            scheduledDate: targetDate,
            idempotencyKey: newIdempotencyKey,
          },
        });
        if (updateResult.count !== 1) {
          throw new Error('update_failed');
        }

        // If the original date was a virtual scheduled date, ensure a RESCHEDULED status DoseLog is created/preserved
        const isVirtualScheduledOnOriginal = isScheduledOn(schedule, protocol.startDate, protocol.endDate, derivedOriginalDate);
        if (isVirtualScheduledOnOriginal) {
          const hasLogOnOriginal = await tx.doseLog.findFirst({
            where: { userId: subjectUserId, protocolId, scheduledDate: derivedOriginalDate, doseSlot },
          });
          if (!hasLogOnOriginal) {
            const originalIdempotencyKey = buildIdempotencyKey(subjectUserId, protocolId, derivedOriginalDate, doseSlot);
            await createDoseLog(tx, {
              protocolId,
              userId: subjectUserId,
              idempotencyKey: originalIdempotencyKey,
              scheduledDate: derivedOriginalDate,
              doseSlot,
              amount: protocol.dose as unknown as DoseAmount,
              status: 'RESCHEDULED',
            });
          }
        }
      } else if (sourceDate) {
        // 3. Rescheduling a virtual scheduled dose (no doseLogId exists yet)
        const sourceIdempotencyKey = buildIdempotencyKey(subjectUserId, protocolId, sourceDate, doseSlot);
        await createDoseLog(tx, {
          protocolId,
          userId: subjectUserId,
          idempotencyKey: sourceIdempotencyKey,
          scheduledDate: sourceDate,
          doseSlot,
          amount: protocol.dose as unknown as DoseAmount,
          status: 'RESCHEDULED',
        });

        const targetIdempotencyKey = buildIdempotencyKey(subjectUserId, protocolId, targetDate, doseSlot);
        const newLog = await createDoseLog(tx, {
          protocolId,
          userId: subjectUserId,
          idempotencyKey: targetIdempotencyKey,
          scheduledDate: targetDate,
          doseSlot,
          amount: protocol.dose as unknown as DoseAmount,
          status: 'PENDING',
        });
        affectedLogId = newLog.id;
      }

      // Write audit event inside transaction
      await tx.auditEvent.create({
        data: {
          actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: 'DOSE_RESCHEDULED',
          resourceId: affectedLogId,
          resourceType: 'DoseLog',
          newValues: {
            protocolId,
            sourceDate: derivedOriginalDate?.toISOString(),
            targetDate: targetDate.toISOString(),
            doseLogId: affectedLogId,
          },
        },
      });
    });

    revalidatePath(`/tracker/protocols/${protocolId}`);
    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'dose_log_not_found') {
      return { ok: false, error: 'dose_log_not_found', message: 'Dose log not found or unauthorized.' };
    }
    if (msg === 'protocol_mismatch') {
      return { ok: false, error: 'protocol_mismatch', message: 'Dose log does not belong to the specified protocol.' };
    }
    return { ok: false, error: 'unknown', message: msg };
  }
}
