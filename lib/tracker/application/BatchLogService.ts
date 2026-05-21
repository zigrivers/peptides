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
  findDoseLogsForDate,
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

  // Bulk dose log lookup — 1 query instead of N
  const protocolIds = dueProtocols.map((p) => p.id);
  const logsByProtocol = await findDoseLogsForDate(prisma, actorUserId, protocolIds, todayUTC);

  // Vial counts — 1 query per unique compound instead of 1 per protocol
  const uniqueCompoundIds = [...new Set(dueProtocols.map((p) => p.compoundId))];
  const vialCountByCompound: Record<string, number> = {};
  await Promise.all(
    uniqueCompoundIds.map(async (compoundId) => {
      vialCountByCompound[compoundId] = await countActiveVialsForCompound(prisma, actorUserId, compoundId);
    })
  );

  return dueProtocols.map((protocol) => {
    const existingLog = logsByProtocol[protocol.id] ?? null;
    const availableVials = vialCountByCompound[protocol.compoundId] ?? 0;
    return { protocol, existingLog, availableVials, isAvailable: availableVials > 0 };
  });
}

async function logOneInBatch(
  actorUserId: string,
  managedIds: string[],
  protocolId: string,
  scheduledDate: Date,
  vialCountCache: Record<string, number>
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
  // Use compound-level cache to avoid repeated queries when multiple protocols share a compound.
  if (!(protocol.compoundId in vialCountCache)) {
    vialCountCache[protocol.compoundId] = await countActiveVialsForCompound(prisma, subjectUserId, protocol.compoundId);
  }
  const vialCount = vialCountCache[protocol.compoundId];
  if (vialCount === 0) {
    throw new Error('insufficient_inventory: No reconstituted vials available for this compound');
  }

  const warnings: SafetyWarning[] = [];
  const amount = protocol.dose;

  // SKIPPED → LOGGED same-day edit via updateDoseLog
  if (existing?.status === 'SKIPPED') {
    const updated = await prisma.$transaction(async (tx) => {
      const log = await updateDoseLog(tx, existing.id, subjectUserId, {
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
          oldValues: { status: 'SKIPPED' },
          newValues: {
            protocolId,
            scheduledDate: scheduledDate.toISOString(),
            status: 'LOGGED',
            isBatchLog: true,
            loggedByUserId: actorUserId,
          },
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
      if (winner) {
        if (winner.status === 'LOGGED') return { doseLog: winner, warnings };
        // Race: concurrent request wrote a SKIPPED log — update it to LOGGED to match batch intent.
        const updated = await prisma.$transaction(async (tx) => {
          const log = await updateDoseLog(tx, winner.id, subjectUserId, {
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
              oldValues: { status: 'SKIPPED' },
              newValues: { protocolId, scheduledDate: scheduledDate.toISOString(), status: 'LOGGED', isBatchLog: true },
            },
          });
          return log;
        });
        return { doseLog: updated, warnings };
      }
    }
    throw err;
  }
}

export async function batchLogDoses(input: BatchLogInput): Promise<BatchLogResult> {
  const managedIds = await getManagedUserIds(input.actorUserId);
  const scheduledDate = toUTCDay(input.scheduledDate);
  const vialCountCache: Record<string, number> = {};

  const results: BatchLogItemResult[] = [];

  for (const protocolId of input.selectedProtocolIds) {
    try {
      const { doseLog, warnings } = await logOneInBatch(
        input.actorUserId,
        managedIds,
        protocolId,
        scheduledDate,
        vialCountCache
      );
      results.push({ ok: true, protocolId, doseLog, warnings });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      results.push({ ok: false, protocolId, error });
    }
  }

  return { results };
}
