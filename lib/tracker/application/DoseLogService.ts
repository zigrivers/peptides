import { prisma } from '@/lib/shared/prisma';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import type { LogDoseInput, LogDoseResult, SafetyWarning, DoseLog } from '../domain/types';
import {
  createDoseLog,
  updateDoseLog,
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

  const idempotencyKey = buildIdempotencyKey(
    input.actorUserId,
    input.protocolId,
    input.scheduledDate
  );

  const existing = await findDoseLogByIdempotencyKey(prisma, idempotencyKey, input.actorUserId);

  const protocol = await findProtocolByIdForActor(prisma, input.protocolId, input.actorUserId, []);
  if (!protocol) {
    throw new Error(`Protocol not found: ${input.protocolId}`);
  }

  // Always check inventory; warnings apply to both new logs and same-day edits to LOGGED.
  const warnings: SafetyWarning[] = [];
  if (input.status === 'LOGGED') {
    const vialCount = await countActiveVialsForCompound(prisma, input.actorUserId, protocol.compoundId);
    if (vialCount === 0) {
      warnings.push({ code: 'insufficient_inventory', message: 'No reconstituted vials available for this compound.' });
    }
  }

  if (existing) {
    if (existing.status === input.status) {
      return { doseLog: existing, warnings };
    }
    // Same-calendar-day edit: update the existing log to the new status.
    const updated = await prisma.$transaction(async (tx) => {
      const log = await updateDoseLog(tx, existing.id, input.actorUserId, {
        status: input.status,
        injectionSite: input.injectionSite ?? existing.injectionSite,
        note: input.note ?? existing.note,
        vialId: input.vialId ?? existing.vialId,
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          subjectUserId: input.actorUserId,
          category: 'Protocol',
          action: input.status === 'SKIPPED' ? 'DOSE_SKIPPED' : 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          oldValues: { status: existing.status },
          newValues: { status: input.status },
        },
      });
      return log;
    });
    return { doseLog: updated, warnings };
  }

  // Use the protocol's scheduled dose amount as the authoritative amount.
  const amount = protocol.dose;

  const doseLog = await prisma.$transaction(async (tx) => {
    const log = await createDoseLog(tx, {
      protocolId: input.protocolId,
      userId: input.actorUserId,
      idempotencyKey,
      scheduledDate: toUTCDay(input.scheduledDate),
      amount,
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
          amount: amount as unknown as JsonValue,
        },
      },
    });

    return log;
  });

  return { doseLog, warnings };
}
