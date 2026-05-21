import { prisma } from '@/lib/shared/prisma';
import type {
  BatchDueItem,
  BatchLogInput,
  BatchLogItemResult,
  BatchLogResult,
  DoseLog,
  SafetyWarning,
} from '../domain/types';
import { listProtocolsForUser, findProtocolByIdForActor } from '../infrastructure/ProtocolRepo';
import {
  findDoseLogByIdempotencyKey,
  findDoseLogForDate,
  countActiveVialsForCompound,
  createDoseLog,
  updateDoseLog,
} from '../infrastructure/DoseLogRepo';
import { getManagedUserIds } from './ProtocolService';
import { isScheduledOn } from '../domain/ScheduleGenerator';
import { Prisma } from '@prisma/client';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';

function toUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildIdempotencyKey(userId: string, protocolId: string, scheduledDate: Date): string {
  return `${userId}:${protocolId}:${scheduledDate.toISOString().slice(0, 10)}`;
}

// Batch log is scoped to the actor's own protocols. Managed users' doses are logged
// individually via the per-protocol log action — the batch flow is a personal daily ritual.
export async function getDueTodayForBatch(actorUserId: string): Promise<BatchDueItem[]> {
  const now = new Date();
  const todayUTC = toUTCDay(now);

  const allProtocols = await listProtocolsForUser(prisma, actorUserId);
  // Explicit ownership filter in addition to listProtocolsForUser's WHERE clause.
  const dueProtocols = allProtocols.filter(
    (p) =>
      p.userId === actorUserId &&
      p.status === 'ACTIVE' &&
      isScheduledOn(p.schedule, p.startDate, p.endDate, todayUTC)
  );

  const items = await Promise.all(
    dueProtocols.map(async (protocol) => {
      const [existingLog, availableVials] = await Promise.all([
        findDoseLogForDate(prisma, protocol.userId, protocol.id, todayUTC),
        countActiveVialsForCompound(prisma, actorUserId, protocol.compoundId),
      ]);
      return {
        protocol,
        existingLog,
        availableVials,
        isAvailable: availableVials > 0,
      };
    })
  );

  return items;
}

async function logOneInBatch(
  actorUserId: string,
  managedIds: string[],
  protocolId: string,
  scheduledDate: Date
): Promise<{ doseLog: DoseLog; warnings: SafetyWarning[] }> {
  const protocol = await findProtocolByIdForActor(prisma, protocolId, actorUserId, managedIds);
  if (!protocol) throw new Error(`Protocol not found: ${protocolId}`);
  // Batch flow is scoped to the actor's own protocols — reject managed-user protocols.
  if (protocol.userId !== actorUserId) {
    throw new Error(`batch_scope_violation: Protocol ${protocolId} is not owned by the actor`);
  }
  if (protocol.status !== 'ACTIVE') throw new Error(`Protocol is not active: ${protocolId}`);
  if (!isScheduledOn(protocol.schedule, protocol.startDate, protocol.endDate, scheduledDate)) {
    throw new Error(`no_dose_scheduled: No dose scheduled for this protocol on ${scheduledDate.toISOString().slice(0, 10)}`);
  }

  const subjectUserId = protocol.userId; // always === actorUserId in batch flow
  const idempotencyKey = buildIdempotencyKey(subjectUserId, protocolId, scheduledDate);
  const existing = await findDoseLogByIdempotencyKey(prisma, idempotencyKey, subjectUserId);

  // Already LOGGED → idempotent early return; no vial check needed.
  if (existing?.status === 'LOGGED') {
    return { doseLog: existing, warnings: [] };
  }

  // Block batch log when no vials available — do not create a LOGGED dose without inventory.
  const vialCount = await countActiveVialsForCompound(prisma, subjectUserId, protocol.compoundId);
  if (vialCount === 0) {
    throw new Error('insufficient_inventory: No reconstituted vials available for this compound');
  }

  const warnings: SafetyWarning[] = [];
  const amount = protocol.dose;

  // SKIPPED → LOGGED same-day edit via updateDoseLog
  if (existing?.status === 'SKIPPED') {
    const updated = await prisma.$transaction(async (tx) => {
      const log = await updateDoseLog(tx, existing.id, subjectUserId, { status: 'LOGGED' });
      await tx.auditEvent.create({
        data: {
          actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          oldValues: { status: 'SKIPPED' },
          newValues: { status: 'LOGGED', isBatchLog: true },
        },
      });
      return log;
    });
    return { doseLog: updated, warnings };
  }

  try {
    const doseLog = await prisma.$transaction(async (tx) => {
      const log = await createDoseLog(tx, {
        protocolId,
        userId: subjectUserId,
        idempotencyKey,
        scheduledDate: toUTCDay(scheduledDate),
        amount,
        status: 'LOGGED',
        isBatchLog: true,
        loggedByUserId: actorUserId,
      });

      await tx.auditEvent.create({
        data: {
          actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          newValues: {
            protocolId,
            scheduledDate: log.scheduledDate.toISOString(),
            status: 'LOGGED',
            isBatchLog: true,
            amount: amount as unknown as JsonValue,
          },
        },
      });

      return log;
    });

    return { doseLog, warnings };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await findDoseLogForDate(prisma, subjectUserId, protocolId, toUTCDay(scheduledDate));
      if (winner) return { doseLog: winner, warnings };
    }
    throw err;
  }
}

export async function batchLogDoses(input: BatchLogInput): Promise<BatchLogResult> {
  const managedIds = await getManagedUserIds(input.actorUserId);
  const scheduledDate = toUTCDay(input.scheduledDate);

  const results: BatchLogItemResult[] = [];

  for (const protocolId of input.selectedProtocolIds) {
    try {
      const { doseLog, warnings } = await logOneInBatch(
        input.actorUserId,
        managedIds,
        protocolId,
        scheduledDate
      );
      results.push({ ok: true, protocolId, doseLog, warnings });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      results.push({ ok: false, protocolId, error });
    }
  }

  return { results };
}
