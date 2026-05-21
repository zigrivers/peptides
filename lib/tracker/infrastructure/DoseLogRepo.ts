import { Prisma, PrismaClient } from '@prisma/client';
import type { DoseLog, DoseLogStatus, DoseAmount, InjectionSite } from '../domain/types';

type PrismaClient_ = Prisma.TransactionClient | PrismaClient;

type RawDoseLog = {
  id: string;
  protocolId: string;
  userId: string;
  vialId: string | null;
  idempotencyKey: string;
  loggedAt: Date;
  scheduledDate: Date;
  amount: Prisma.JsonValue;
  status: string;
  injectionSite: Prisma.JsonValue;
  isBatchLog: boolean;
  note: string | null;
  loggedByUserId: string | null;
};

function mapDoseLog(raw: RawDoseLog): DoseLog {
  return {
    id: raw.id,
    protocolId: raw.protocolId,
    userId: raw.userId,
    vialId: raw.vialId,
    idempotencyKey: raw.idempotencyKey,
    loggedAt: raw.loggedAt,
    scheduledDate: raw.scheduledDate,
    amount: raw.amount as DoseAmount,
    status: raw.status as DoseLogStatus,
    injectionSite: raw.injectionSite as InjectionSite | null,
    isBatchLog: raw.isBatchLog,
    note: raw.note,
    loggedByUserId: raw.loggedByUserId,
  };
}

export async function createDoseLog(
  tx: Prisma.TransactionClient,
  data: {
    protocolId: string;
    userId: string;
    idempotencyKey: string;
    scheduledDate: Date;
    amount: DoseAmount;
    status: DoseLogStatus;
    injectionSite?: InjectionSite;
    note?: string;
    vialId?: string;
    loggedByUserId?: string;
  }
): Promise<DoseLog> {
  const raw = await tx.doseLog.create({
    data: {
      protocolId: data.protocolId,
      userId: data.userId,
      idempotencyKey: data.idempotencyKey,
      scheduledDate: data.scheduledDate,
      amount: data.amount as Prisma.InputJsonValue,
      status: data.status,
      injectionSite: data.injectionSite ? (data.injectionSite as Prisma.InputJsonValue) : Prisma.JsonNull,
      note: data.note ?? null,
      vialId: data.vialId ?? null,
      loggedByUserId: data.loggedByUserId ?? null,
    },
  });
  return mapDoseLog(raw as RawDoseLog);
}

export async function findDoseLogByIdempotencyKey(
  client: PrismaClient_,
  idempotencyKey: string,
  userId: string
): Promise<DoseLog | null> {
  const raw = await client.doseLog.findFirst({
    where: { idempotencyKey, userId },
  });
  return raw ? mapDoseLog(raw as RawDoseLog) : null;
}

export async function findDoseLogForDate(
  client: PrismaClient_,
  userId: string,
  protocolId: string,
  scheduledDate: Date
): Promise<DoseLog | null> {
  const raw = await client.doseLog.findFirst({
    where: { userId, protocolId, scheduledDate },
  });
  return raw ? mapDoseLog(raw as RawDoseLog) : null;
}

export async function updateDoseLog(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  updates: Partial<{
    amount: DoseAmount;
    status: DoseLogStatus;
    injectionSite: InjectionSite | null;
    note: string | null;
    vialId: string | null;
  }>
): Promise<DoseLog> {
  const data: Record<string, unknown> = {};
  if (updates.amount !== undefined) data.amount = updates.amount as Prisma.InputJsonValue;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.injectionSite !== undefined) {
    data.injectionSite = updates.injectionSite ? (updates.injectionSite as Prisma.InputJsonValue) : Prisma.JsonNull;
  }
  if (updates.note !== undefined) data.note = updates.note;
  if (updates.vialId !== undefined) data.vialId = updates.vialId;

  // updateMany allows non-unique fields (userId) in the where clause for ownership enforcement.
  const result = await tx.doseLog.updateMany({ where: { id, userId }, data });
  if (result.count === 0) throw new Error(`DoseLog not found or unauthorized: ${id}`);
  const raw = await tx.doseLog.findFirst({ where: { id, userId } });
  if (!raw) throw new Error(`DoseLog not found after update: ${id}`);
  return mapDoseLog(raw as RawDoseLog);
}

export async function countActiveVialsForCompound(
  client: PrismaClient_,
  userId: string,
  compoundId: string
): Promise<number> {
  return client.vial.count({
    where: {
      userId,
      compoundId,
      status: 'RECONSTITUTED',
      remainingMg: { gt: 0 },
    },
  });
}
