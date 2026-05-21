import { Prisma, PrismaClient } from '@prisma/client';
import type { Cycle, CycleStatus } from '../domain/types';

type PrismaClient_ = Prisma.TransactionClient | PrismaClient;

type RawCycle = {
  id: string;
  userId: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
};

function mapCycle(raw: RawCycle): Cycle {
  return {
    id: raw.id,
    userId: raw.userId,
    name: raw.name,
    startDate: raw.startDate,
    endDate: raw.endDate,
    status: raw.status as CycleStatus,
  };
}

export async function createCycle(
  client: PrismaClient_,
  data: { userId: string; name: string; startDate: Date; endDate?: Date }
): Promise<Cycle> {
  const raw = await client.cycle.create({
    data: {
      userId: data.userId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      status: 'ACTIVE',
    },
  });
  return mapCycle(raw as RawCycle);
}

export async function findCycleById(
  client: PrismaClient_,
  id: string,
  userId: string
): Promise<Cycle | null> {
  const raw = await client.cycle.findFirst({ where: { id, userId } });
  return raw ? mapCycle(raw as RawCycle) : null;
}

export async function findActiveCycleForUser(
  client: PrismaClient_,
  userId: string,
  today: Date
): Promise<Cycle | null> {
  // Normalize to UTC midnight so endDate (stored as UTC midnight) is compared to the start of
  // the calendar day, not the current time-of-day — prevents cycle disappearing mid-day.
  const utcMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const raw = await client.cycle.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      startDate: { lte: utcMidnight },
      OR: [{ endDate: null }, { endDate: { gte: utcMidnight } }],
    },
    orderBy: { startDate: 'desc' },
  });
  return raw ? mapCycle(raw as RawCycle) : null;
}

export async function findCyclesForUser(
  client: PrismaClient_,
  userId: string
): Promise<Cycle[]> {
  const rows = await client.cycle.findMany({
    where: { userId },
    orderBy: { startDate: 'desc' },
  });
  return rows.map((r) => mapCycle(r as RawCycle));
}
