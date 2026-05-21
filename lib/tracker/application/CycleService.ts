import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type { Cycle, CreateCycleInput, RestartCycleInput, CycleWeekInfo } from '../domain/types';
import { createCycle as repoCreateCycle, findCycleById, findActiveCycleForUser, findCyclesForUser } from '../infrastructure/CycleRepo';

function toUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function computeWeekNumber(startDate: Date, today: Date): number {
  const startUTC = toUTCDay(startDate);
  const todayUTC = toUTCDay(today);
  const elapsedMs = todayUTC.getTime() - startUTC.getTime();
  // Clamp to 0 so future-dated cycles (shouldn't be shown, but defensive) never return negative weeks.
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  return Math.floor(elapsedDays / 7) + 1;
}

function computeTotalWeeks(startDate: Date, endDate: Date): number {
  const startUTC = toUTCDay(startDate);
  const endUTC = toUTCDay(endDate);
  const totalDays = Math.floor((endUTC.getTime() - startUTC.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.ceil(totalDays / 7);
}

export async function createCycle(input: CreateCycleInput): Promise<Cycle> {
  return prisma.$transaction(async (tx) => {
    const cycle = await repoCreateCycle(tx, {
      userId: input.actorUserId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: input.actorUserId,
        category: 'Protocol',
        action: 'CYCLE_CREATED',
        resourceId: cycle.id,
        resourceType: 'Cycle',
        newValues: {
          name: cycle.name,
          startDate: cycle.startDate.toISOString(),
          endDate: cycle.endDate?.toISOString() ?? null,
        },
      },
    });

    return cycle;
  });
}

export async function getCyclesForUser(userId: string): Promise<Cycle[]> {
  return findCyclesForUser(prisma, userId);
}

export async function getCycleById(userId: string, cycleId: string): Promise<Cycle | null> {
  return findCycleById(prisma, cycleId, userId);
}

export async function getCurrentWeekInfo(userId: string): Promise<CycleWeekInfo | null> {
  const today = new Date();
  const cycle = await findActiveCycleForUser(prisma, userId, today);
  if (!cycle) return null;

  const weekNumber = computeWeekNumber(cycle.startDate, today);
  const totalWeeks = cycle.endDate ? computeTotalWeeks(cycle.startDate, cycle.endDate) : null;

  return { cycleId: cycle.id, cycleName: cycle.name, weekNumber, totalWeeks };
}

export async function restartCycle(input: RestartCycleInput): Promise<{ newCycle: Cycle; clonedProtocols: { id: string }[] }> {
  return prisma.$transaction(async (tx) => {
    const oldCycle = await findCycleById(tx, input.cycleId, input.actorUserId);
    if (!oldCycle) throw new Error(`cycle_not_found: ${input.cycleId}`);

    // Preserve the original cycle's planned duration in the new cycle.
    const durationMs = oldCycle.endDate
      ? oldCycle.endDate.getTime() - oldCycle.startDate.getTime()
      : null;
    const newCycleEndDate = durationMs !== null
      ? new Date(input.newStartDate.getTime() + durationMs)
      : undefined;

    // Offset to apply to protocol endDates (same shift as cycle startDate).
    const startOffsetMs = input.newStartDate.getTime() - oldCycle.startDate.getTime();

    // Snapshot all non-deactivated protocols — includes COMPLETED ones from short-duration regimens
    // that finished early within the cycle but should still be part of the restarted cycle.
    const isActiveCycle = oldCycle.status === 'ACTIVE';
    const protocols = await tx.protocol.findMany({
      where: { cycleId: input.cycleId, userId: input.actorUserId, status: { not: 'DEACTIVATED' } },
    });

    // Complete active items only when the cycle is still running.
    if (isActiveCycle) {
      await tx.protocol.updateMany({
        where: { cycleId: input.cycleId, userId: input.actorUserId, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'COMPLETED' },
      });
      await tx.cycle.updateMany({
        where: { id: input.cycleId, userId: input.actorUserId },
        data: { status: 'COMPLETED' },
      });
    }

    // Create the new cycle preserving the original planned duration.
    const newCycle = await repoCreateCycle(tx, {
      userId: input.actorUserId,
      name: oldCycle.name,
      startDate: input.newStartDate,
      endDate: newCycleEndDate,
    });

    // Clone each protocol, shifting both start and end dates by the same offset.
    const clonedProtocols: { id: string }[] = [];
    for (const p of protocols) {
      const protoStartDate = new Date((p.startDate as Date).getTime() + startOffsetMs);
      const protoEndDate = p.endDate ? new Date((p.endDate as Date).getTime() + startOffsetMs) : null;
      const clone = await tx.protocol.create({
        data: {
          userId: p.userId,
          compoundId: p.compoundId,
          cycleId: newCycle.id,
          dose: p.dose as Prisma.InputJsonValue,
          schedule: p.schedule as Prisma.InputJsonValue,
          administrationRoute: p.administrationRoute,
          startDate: protoStartDate,
          endDate: protoEndDate,
          notes: p.notes,
          status: 'ACTIVE',
        },
      });
      clonedProtocols.push({ id: clone.id });
    }

    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        subjectUserId: input.actorUserId,
        category: 'Protocol',
        action: 'CYCLE_RESTARTED',
        resourceId: newCycle.id,
        resourceType: 'Cycle',
        oldValues: { cycleId: input.cycleId },
        newValues: { newCycleId: newCycle.id, newStartDate: input.newStartDate.toISOString() },
      },
    });

    return { newCycle, clonedProtocols };
  });
}
