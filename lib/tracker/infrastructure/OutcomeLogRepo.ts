import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';

type TxOrPrisma = Prisma.TransactionClient | typeof prisma;

export interface OutcomeRow {
  id: string;
  userId: string;
  scheduledDate: Date;
  overallRating: number;
  tags: string[];
  note: string | null;
  loggedAt: Date;
  protocolRatings: { id: string; protocolId: string; rating: number }[];
}

export const OutcomeLogRepo = {
  async findForDate(
    userId: string,
    scheduledDate: Date,
    client: TxOrPrisma = prisma
  ): Promise<OutcomeRow | null> {
    const row = await client.outcomeLog.findFirst({
      where: { userId, scheduledDate },
      include: { protocolRatings: true },
    });
    return row;
  },

  async listInRange(
    userId: string,
    fromUTCMidnight: Date,
    toUTCMidnight: Date,
    client: TxOrPrisma = prisma
  ): Promise<OutcomeRow[]> {
    return client.outcomeLog.findMany({
      where: { userId, scheduledDate: { gte: fromUTCMidnight, lt: toUTCMidnight } },
      include: { protocolRatings: true },
      orderBy: { scheduledDate: 'asc' },
    });
  },

  async topTagsLastNDays(
    userId: string,
    fromUTCMidnight: Date,
    toUTCMidnight: Date,
    limit: number,
    client: TxOrPrisma = prisma
  ): Promise<string[]> {
    const logs = await client.outcomeLog.findMany({
      where: { userId, scheduledDate: { gte: fromUTCMidnight, lt: toUTCMidnight } },
      select: { tags: true },
    });
    const counts = new Map<string, number>();
    for (const log of logs) {
      for (const tag of log.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([tag]) => tag);
  },

  async upsertWithRatings(
    userId: string,
    input: {
      scheduledDate: Date;
      overallRating: number;
      tags: string[];
      note: string | null;
      protocolRatings: { protocolId: string; rating: number }[];
    },
    client: Prisma.TransactionClient
  ): Promise<{ id: string; created: boolean }> {
    const existing = await client.outcomeLog.findFirst({
      where: { userId, scheduledDate: input.scheduledDate },
      select: { id: true },
    });

    if (!existing) {
      const created = await client.outcomeLog.create({
        data: {
          userId,
          scheduledDate: input.scheduledDate,
          overallRating: input.overallRating,
          tags: input.tags,
          note: input.note,
          protocolRatings: {
            create: input.protocolRatings.map((r) => ({
              protocolId: r.protocolId,
              rating: r.rating,
            })),
          },
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    }

    // Update: replace protocolRatings (delete-then-insert) so the new set
    // exactly matches the input. Both writes are inside the same transaction.
    await client.outcomeLog.updateMany({
      where: { id: existing.id, userId },
      data: {
        overallRating: input.overallRating,
        tags: input.tags,
        note: input.note,
      },
    });
    await client.protocolRating.deleteMany({ where: { outcomeLogId: existing.id } });
    if (input.protocolRatings.length > 0) {
      await client.protocolRating.createMany({
        data: input.protocolRatings.map((r) => ({
          outcomeLogId: existing.id,
          protocolId: r.protocolId,
          rating: r.rating,
        })),
      });
    }
    return { id: existing.id, created: false };
  },
};
