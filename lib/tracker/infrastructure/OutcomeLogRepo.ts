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
    // Atomic upsert against the unique (userId, scheduledDate) index so
    // two concurrent submissions for the same day collapse into a single
    // idempotent update rather than one of them throwing P2002. We use a
    // separate `findFirst` purely to decide which audit action to emit;
    // the data write is the upsert. If a race causes the audit branch to
    // disagree with the actual SQL outcome, the worst case is a single
    // mis-labelled OUTCOME_LOGGED-vs-OUTCOME_UPDATED audit row — data
    // integrity is preserved.
    const existingForAudit = await client.outcomeLog.findFirst({
      where: { userId, scheduledDate: input.scheduledDate },
      select: { id: true },
    });

    const upserted = await client.outcomeLog.upsert({
      where: {
        userId_scheduledDate: { userId, scheduledDate: input.scheduledDate },
      },
      create: {
        userId,
        scheduledDate: input.scheduledDate,
        overallRating: input.overallRating,
        tags: input.tags,
        note: input.note,
      },
      update: {
        overallRating: input.overallRating,
        tags: input.tags,
        note: input.note,
      },
      select: { id: true, userId: true },
    });

    // Defense-in-depth: the upsert is keyed on (userId, scheduledDate),
    // so the returned row's userId MUST equal the actor. A mismatch would
    // indicate something has gone wrong upstream.
    if (upserted.userId !== userId) {
      throw new Error('outcome_not_owned_by_actor');
    }

    // Replace ProtocolRatings — delete-then-insert. The deleteMany is
    // scoped through a relation filter on the parent's userId so a
    // tampered outcomeLogId can't cross-delete another user's ratings.
    await client.protocolRating.deleteMany({
      where: { outcomeLogId: upserted.id, outcomeLog: { is: { userId } } },
    });
    if (input.protocolRatings.length > 0) {
      await client.protocolRating.createMany({
        data: input.protocolRatings.map((r) => ({
          outcomeLogId: upserted.id,
          protocolId: r.protocolId,
          rating: r.rating,
        })),
      });
    }
    return { id: upserted.id, created: existingForAudit === null };
  },
};
