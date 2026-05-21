import { prisma } from '@/lib/shared/prisma';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import type { LogDoseInput, LogDoseResult, SafetyWarning, DoseLog } from '../domain/types';
import {
  createDoseLog,
  findDoseLogByIdempotencyKey,
  findDoseLogForDate,
  countActiveVialsForCompound,
} from '../infrastructure/DoseLogRepo';
import { findProtocolByIdForActor } from '../infrastructure/ProtocolRepo';

function buildIdempotencyKey(userId: string, protocolId: string, scheduledDate: Date): string {
  const dateStr = scheduledDate.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${userId}:${protocolId}:${dateStr}`;
}

function toUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isFutureCalendarDay(scheduledDate: Date): boolean {
  const now = new Date();
  const todayUTC = toUTCDay(now);
  const targetUTC = toUTCDay(scheduledDate);
  return targetUTC > todayUTC;
}

export async function getTodaysDoseLog(userId: string, protocolId: string): Promise<DoseLog | null> {
  const now = new Date();
  const todayUTC = toUTCDay(now);
  return findDoseLogForDate(prisma, userId, protocolId, todayUTC);
}

export async function logDose(input: LogDoseInput): Promise<LogDoseResult> {
  if (isFutureCalendarDay(input.scheduledDate)) {
    throw new Error('dose_log_too_late: Cannot log a dose for a future date');
  }

  const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey(
    input.actorUserId,
    input.protocolId,
    input.scheduledDate
  );

  const existing = await findDoseLogByIdempotencyKey(prisma, idempotencyKey, input.actorUserId);
  if (existing) {
    return { doseLog: existing, warnings: [] };
  }

  const protocol = await findProtocolByIdForActor(prisma, input.protocolId, input.actorUserId, []);
  if (!protocol) {
    throw new Error(`Protocol not found: ${input.protocolId}`);
  }

  const warnings: SafetyWarning[] = [];
  const vialCount = await countActiveVialsForCompound(prisma, input.actorUserId, protocol.compoundId);
  if (vialCount === 0) {
    warnings.push({ code: 'insufficient_inventory', message: 'No reconstituted vials available for this compound.' });
  }

  const doseLog = await prisma.$transaction(async (tx) => {
    const log = await createDoseLog(tx, {
      protocolId: input.protocolId,
      userId: input.actorUserId,
      idempotencyKey,
      scheduledDate: toUTCDay(input.scheduledDate),
      amount: input.amount,
      status: input.status,
      injectionSite: input.injectionSite,
      note: input.note,
      vialId: input.vialId,
      loggedByUserId: input.actorUserId,
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: input.actorUserId,
        category: 'Protocol',
        action: input.status === 'SKIPPED' ? 'DOSE_SKIPPED' : 'DOSE_LOGGED',
        resourceId: log.id,
        resourceType: 'DoseLog',
        newValues: {
          protocolId: input.protocolId,
          scheduledDate: log.scheduledDate.toISOString(),
          status: input.status,
          amount: input.amount as unknown as JsonValue,
        },
      },
    });

    return log;
  });

  return { doseLog, warnings };
}
