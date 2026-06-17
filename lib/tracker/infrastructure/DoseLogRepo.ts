import { Prisma, PrismaClient } from '@prisma/client';
import type { DoseLog, DoseLogStatus, DoseAmount, InjectionSite } from '../domain/types';
import Decimal from 'decimal.js';

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
  loggedCost: Prisma.Decimal | null;
  loggedCurrency: string | null;
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
    loggedCost: raw.loggedCost ? new Decimal(raw.loggedCost.toString()) : null,
    loggedCurrency: raw.loggedCurrency,
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
    isBatchLog?: boolean;
    injectionSite?: InjectionSite;
    note?: string;
    vialId?: string;
    doseSlot?: number;
    loggedByUserId?: string;
    loggedCost?: Decimal | null;
    loggedCurrency?: string | null;
  }
): Promise<DoseLog> {
  const raw = await tx.doseLog.create({
    data: {
      protocolId: data.protocolId,
      userId: data.userId,
      idempotencyKey: data.idempotencyKey,
      scheduledDate: data.scheduledDate,
      doseSlot: data.doseSlot ?? 0,
      amount: data.amount as Prisma.InputJsonValue,
      status: data.status,
      injectionSite: data.injectionSite ? (data.injectionSite as Prisma.InputJsonValue) : Prisma.JsonNull,
      isBatchLog: data.isBatchLog ?? false,
      note: data.note ?? null,
      vialId: data.vialId ?? null,
      loggedByUserId: data.loggedByUserId ?? null,
      loggedCost: data.loggedCost ?? null,
      loggedCurrency: data.loggedCurrency ?? null,
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

export async function findDoseLogById(
  client: PrismaClient_,
  id: string,
  userId: string
): Promise<DoseLog | null> {
  const raw = await client.doseLog.findFirst({
    where: { id, userId },
  });
  return raw ? mapDoseLog(raw as RawDoseLog) : null;
}

export async function findDoseLogForDate(
  client: PrismaClient_,
  userId: string,
  protocolId: string,
  scheduledDate: Date,
  doseSlot = 0
): Promise<DoseLog | null> {
  const raw = await client.doseLog.findFirst({
    where: { userId, protocolId, scheduledDate, doseSlot },
  });
  return raw ? mapDoseLog(raw as RawDoseLog) : null;
}

/**
 * Bulk-fetch dose logs for the given protocols on a date, keyed by `${protocolId}:${doseSlot}`.
 * Slot-aware so twice-daily protocols (slots 0 and 1) are both visible — keying by protocolId
 * alone would collapse the two slots and hide the second dose.
 */
export async function findDoseLogsForDate(
  client: PrismaClient_,
  userId: string,
  protocolIds: string[],
  scheduledDate: Date
): Promise<Record<string, DoseLog | null>> {
  if (protocolIds.length === 0) return {};
  const rows = await client.doseLog.findMany({
    where: { userId, protocolId: { in: protocolIds }, scheduledDate },
  });
  const byProtocolSlot: Record<string, DoseLog | null> = {};
  for (const row of rows) {
    const r = row as RawDoseLog & { doseSlot?: number };
    byProtocolSlot[`${r.protocolId}:${r.doseSlot ?? 0}`] = mapDoseLog(r);
  }
  return byProtocolSlot;
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
    isBatchLog: boolean;
    loggedByUserId: string | null;
    loggedAt: Date;
    loggedCost: Decimal | null;
    loggedCurrency: string | null;
  }>
): Promise<DoseLog> {
  const data: Record<string, unknown> = {};
  if (updates.amount !== undefined) data.amount = updates.amount as Prisma.InputJsonValue;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.injectionSite !== undefined) {
    // null → Prisma.JsonNull (JSON null stored in the column, not SQL NULL/DbNull),
    // consistent with the { not: Prisma.JsonNull } filter in findRecentLogsWithSitesForCompound.
    data.injectionSite = updates.injectionSite ? (updates.injectionSite as Prisma.InputJsonValue) : Prisma.JsonNull;
  }
  if (updates.note !== undefined) data.note = updates.note;
  if (updates.vialId !== undefined) data.vialId = updates.vialId;
  if (updates.isBatchLog !== undefined) data.isBatchLog = updates.isBatchLog;
  if (updates.loggedByUserId !== undefined) data.loggedByUserId = updates.loggedByUserId;
  if (updates.loggedAt !== undefined) data.loggedAt = updates.loggedAt;
  if (updates.loggedCost !== undefined) data.loggedCost = updates.loggedCost;
  if (updates.loggedCurrency !== undefined) data.loggedCurrency = updates.loggedCurrency;

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

export async function findRecentLogsWithSitesForCompound(
  client: PrismaClient_,
  userId: string,
  compoundId: string,
  limit: number
): Promise<DoseLog[]> {
  const rows = await client.doseLog.findMany({
    where: {
      userId,
      status: 'LOGGED',
      protocol: { compoundId },
      // Filter JSON-null sites (we always write Prisma.JsonNull — never DbNull — for missing sites).
      injectionSite: { not: Prisma.JsonNull },
    },
    orderBy: [{ scheduledDate: 'desc' }, { loggedAt: 'desc' }],
    take: limit,
  });
  return rows.map((r) => mapDoseLog(r as RawDoseLog));
}

export async function validateVialOwnership(
  client: PrismaClient_,
  vialId: string,
  userId: string,
  compoundId: string
): Promise<boolean> {
  const vial = await client.vial.findFirst({ where: { id: vialId, userId, compoundId } });
  return vial !== null;
}
