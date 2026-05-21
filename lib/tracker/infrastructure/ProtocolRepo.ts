import { Prisma, PrismaClient } from '@prisma/client';
import type { Protocol } from '../domain/types';

type PrismaProtocol = {
  id: string;
  userId: string;
  compoundId: string;
  cycleId: string | null;
  dose: Prisma.JsonValue;
  schedule: Prisma.JsonValue;
  administrationRoute: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
};

function mapProtocol(raw: PrismaProtocol): Protocol {
  return {
    id: raw.id,
    userId: raw.userId,
    compoundId: raw.compoundId,
    cycleId: raw.cycleId,
    dose: raw.dose as Protocol['dose'],
    schedule: raw.schedule as Protocol['schedule'],
    administrationRoute: raw.administrationRoute,
    status: raw.status as Protocol['status'],
    startDate: raw.startDate,
    endDate: raw.endDate,
    notes: raw.notes,
  };
}

export async function createProtocolRecord(
  tx: Prisma.TransactionClient,
  data: {
    userId: string;
    compoundId: string;
    cycleId?: string;
    dose: Protocol['dose'];
    schedule: Protocol['schedule'];
    administrationRoute: string;
    startDate: Date;
    endDate?: Date;
    notes?: string;
  }
): Promise<Protocol> {
  const raw = await tx.protocol.create({
    data: {
      userId: data.userId,
      compoundId: data.compoundId,
      cycleId: data.cycleId ?? null,
      dose: data.dose as Prisma.InputJsonValue,
      schedule: data.schedule as Prisma.InputJsonValue,
      administrationRoute: data.administrationRoute,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      notes: data.notes ?? null,
      status: 'ACTIVE',
    },
  });
  return mapProtocol(raw);
}

export async function updateProtocolRecord(
  tx: Prisma.TransactionClient,
  protocolId: string,
  ownerId: string,
  updates: Partial<{
    compoundId: string;
    dose: Protocol['dose'];
    schedule: Protocol['schedule'];
    administrationRoute: string;
    startDate: Date;
    endDate: Date | null;
    notes: string | null;
  }>
): Promise<Protocol> {
  const data: Record<string, unknown> = {};
  if (updates.compoundId !== undefined) data.compoundId = updates.compoundId;
  if (updates.dose !== undefined) data.dose = updates.dose as Prisma.InputJsonValue;
  if (updates.schedule !== undefined) data.schedule = updates.schedule as Prisma.InputJsonValue;
  if (updates.administrationRoute !== undefined) data.administrationRoute = updates.administrationRoute;
  if (updates.startDate !== undefined) data.startDate = updates.startDate;
  if (updates.endDate !== undefined) data.endDate = updates.endDate;
  if (updates.notes !== undefined) data.notes = updates.notes;

  const raw = await tx.protocol.update({
    // userId clause ensures the UPDATE itself is userId-scoped (CLAUDE.md)
    where: { id: protocolId, userId: ownerId },
    data,
  });
  return mapProtocol(raw);
}

/**
 * Find a protocol by id where the owner is either the actor themselves OR
 * a managed user of the actor. This supports the power-user edit use case
 * where actorUserId !== protocol.userId (managed user protocol).
 */
export async function findProtocolByIdForActor(
  tx: Prisma.TransactionClient,
  protocolId: string,
  actorUserId: string,
  managedUserIds: string[]
): Promise<Protocol | null> {
  const allowedUserIds = [actorUserId, ...managedUserIds];
  const raw = await tx.protocol.findFirst({
    where: {
      id: protocolId,
      userId: { in: allowedUserIds },
    },
  });
  return raw ? mapProtocol(raw) : null;
}

export async function listProtocolsForUser(
  client: PrismaClient,
  userId: string
): Promise<Protocol[]> {
  const rows = await client.protocol.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
  });
  return rows.map(mapProtocol);
}
