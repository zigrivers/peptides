import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';
import { utcMidnightOf as utcMidnightOfShared } from '@/lib/shared/date';
import { OutcomeLogRepo, type OutcomeRow } from '../infrastructure/OutcomeLogRepo';
import { outcomeUpsertSchema } from '../domain/outcomeValidation';

export interface AdherenceResult {
  logged: number;
  total: number;
  percent: number;
}

// scheduledDate is stored at UTC midnight by convention (see lessons.md, 2026-05-21).
// All calendar-date boundaries use UTC midnight to align with stored values.
function utcMidnightDaysAgo(days: number, now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
}

// Local alias kept for in-module call sites — implementation lives in
// `lib/shared/date.ts` so the dashboard and other consumers share the rule.
const utcMidnightOf = utcMidnightOfShared;

export async function getSevenDayRatingAverage(userId: string): Promise<number | null> {
  const now = new Date();
  const since = utcMidnightDaysAgo(6, now); // today + 6 preceding days = 7 days inclusive
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  const logs = await prisma.outcomeLog.findMany({
    where: {
      userId,
      scheduledDate: { gte: since, lt: tomorrow },
    },
    select: { overallRating: true },
  });

  if (logs.length === 0) return null;
  const sum = logs.reduce((acc, l) => acc + l.overallRating, 0);
  return sum / logs.length;
}

export async function getSevenDayAdherence(userId: string): Promise<AdherenceResult> {
  const now = new Date();
  const since = utcMidnightDaysAgo(6, now); // today + 6 preceding days = 7 days inclusive
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  // todayMidnight separates past PENDING (missed) from today's not-yet-acted-on PENDING
  const todayMidnight = utcMidnightDaysAgo(0, now);

  const logs = await prisma.doseLog.findMany({
    where: {
      userId,
      OR: [
        { scheduledDate: { gte: since, lt: tomorrow }, status: { in: ['LOGGED', 'SKIPPED'] } },
        { scheduledDate: { gte: since, lt: todayMidnight }, status: 'PENDING' },
      ],
    },
    select: { status: true },
  });

  const total = logs.length;
  const logged = logs.filter((l) => l.status === 'LOGGED').length;
  const percent = total === 0 ? 0 : (logged / total) * 100;

  return { logged, total, percent };
}

export async function hasDoseTodayForUser(userId: string): Promise<boolean> {
  const now = new Date();
  const todayMidnight = utcMidnightDaysAgo(0, now);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const log = await prisma.doseLog.findFirst({
    where: {
      userId,
      scheduledDate: { gte: todayMidnight, lt: tomorrow },
    },
    select: { id: true },
  });
  return log !== null;
}

// ---------------------------------------------------------------------------
// Task 5.3 — Outcome logging + correlation timeline (US-TRK-06 + US-TRK-07)
// ---------------------------------------------------------------------------

export interface UpsertOutcomeInput {
  scheduledDate: Date;
  overallRating: number;
  tags: string[];
  note?: string | null;
  protocolRatings?: { protocolId: string; rating: number }[];
}

export async function getOutcomeForDate(
  userId: string,
  scheduledDate: Date
): Promise<OutcomeRow | null> {
  return OutcomeLogRepo.findForDate(userId, utcMidnightOf(scheduledDate));
}

export async function upsertOutcome(
  userId: string,
  rawInput: UpsertOutcomeInput
): Promise<{ id: string; created: boolean }> {
  // Normalise scheduledDate to UTC midnight before validation so the unique
  // constraint matches the stored shape (Prisma DateTime + @db.Date).
  const input = outcomeUpsertSchema.parse({
    ...rawInput,
    scheduledDate: utcMidnightOf(rawInput.scheduledDate),
    note: rawInput.note ?? null,
    protocolRatings: rawInput.protocolRatings ?? [],
  });

  // Dedupe protocolRatings by protocolId — last write wins. A malformed
  // client payload with duplicate IDs would otherwise trip a Prisma
  // createMany constraint (no @@unique exists on outcomeLogId+protocolId yet,
  // but duplicate audit rows + the user's mental model are violated all the
  // same).
  const dedupedRatings = Array.from(
    new Map(input.protocolRatings.map((r) => [r.protocolId, r])).values()
  );

  // Snapshot of the user's currently-active protocol IDs. The repo uses this
  // to scope the rating replacement: only ratings tied to ACTIVE protocols
  // are subject to delete-then-insert; ratings for protocols that have since
  // been paused/deactivated are preserved as historical evidence. The
  // submitted ratings are validated to be a subset of this set so a stale
  // form or forged request can't slip in a non-active rating.
  const activeOwned = await prisma.protocol.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  const activeProtocolIds = activeOwned.map((p) => p.id);
  const activeSet = new Set(activeProtocolIds);

  if (dedupedRatings.length > 0) {
    const missing = dedupedRatings
      .map((r) => r.protocolId)
      .filter((id) => !activeSet.has(id));
    if (missing.length > 0) {
      throw new Error('protocol_not_owned');
    }
  }

  // Manual $transaction so we can emit the OUTCOME_LOGGED/OUTCOME_UPDATED
  // aggregate audit plus one PROTOCOL_RATED audit per submitted rating —
  // all atomically with the upsert + ratings write.
  return prisma.$transaction(async (tx) => {
    const result = await OutcomeLogRepo.upsertWithRatings(
      userId,
      {
        scheduledDate: input.scheduledDate,
        overallRating: input.overallRating,
        tags: input.tags,
        note: input.note ?? null,
        protocolRatings: dedupedRatings,
        activeProtocolIds,
      },
      tx
    );

    await PrismaAuditRepo.create(tx, {
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Protocol',
      action: result.created ? 'OUTCOME_LOGGED' : 'OUTCOME_UPDATED',
      resourceId: result.id,
      resourceType: 'OutcomeLog',
      metadata: {
        scheduledDate: input.scheduledDate.toISOString(),
        overallRating: input.overallRating,
        tagCount: input.tags.length,
        protocolRatingCount: dedupedRatings.length,
      },
    });

    for (const rating of dedupedRatings) {
      await PrismaAuditRepo.create(tx, {
        actorUserId: userId,
        subjectUserId: userId,
        category: 'Protocol',
        action: 'PROTOCOL_RATED',
        resourceId: rating.protocolId,
        resourceType: 'Protocol',
        metadata: {
          outcomeLogId: result.id,
          scheduledDate: input.scheduledDate.toISOString(),
          rating: rating.rating,
        },
      });
    }

    return result;
  });
}

export interface TimelineBucket {
  date: string; // YYYY-MM-DD
  doseEvents: number;
  outcomeRating: number | null;
}

export async function getTimelineSeries(
  userId: string,
  days: number
): Promise<TimelineBucket[]> {
  if (days <= 0) return [];
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const since = utcMidnightDaysAgo(days - 1, now);

  const [doses, outcomes] = await Promise.all([
    prisma.doseLog.findMany({
      where: {
        userId,
        status: 'LOGGED',
        scheduledDate: { gte: since, lt: tomorrow },
      },
      select: { scheduledDate: true },
    }),
    OutcomeLogRepo.listInRange(userId, since, tomorrow),
  ]);

  const dosesByDay = new Map<string, number>();
  for (const d of doses) {
    const key = d.scheduledDate.toISOString().slice(0, 10);
    dosesByDay.set(key, (dosesByDay.get(key) ?? 0) + 1);
  }
  const outcomesByDay = new Map<string, number>();
  for (const o of outcomes) {
    outcomesByDay.set(o.scheduledDate.toISOString().slice(0, 10), o.overallRating);
  }

  const buckets: TimelineBucket[] = [];
  for (let i = 0; i < days; i++) {
    const date = utcMidnightDaysAgo(days - 1 - i, now);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      doseEvents: dosesByDay.get(key) ?? 0,
      outcomeRating: outcomesByDay.get(key) ?? null,
    });
  }
  return buckets;
}

export interface CorrelationStats {
  averageOnDosedDays: number | null;
  averageOnNotDosedDays: number | null;
  dosedDays: number;
  notDosedDays: number;
  outcomeDays: number;
}

export async function getCorrelationStats(
  userId: string,
  days: number
): Promise<CorrelationStats> {
  const series = await getTimelineSeries(userId, days);
  let dosedSum = 0;
  let dosedDays = 0;
  let notDosedSum = 0;
  let notDosedDays = 0;
  let outcomeDays = 0;
  for (const bucket of series) {
    if (bucket.outcomeRating === null) continue;
    outcomeDays += 1;
    if (bucket.doseEvents > 0) {
      dosedSum += bucket.outcomeRating;
      dosedDays += 1;
    } else {
      notDosedSum += bucket.outcomeRating;
      notDosedDays += 1;
    }
  }
  return {
    averageOnDosedDays: dosedDays === 0 ? null : dosedSum / dosedDays,
    averageOnNotDosedDays: notDosedDays === 0 ? null : notDosedSum / notDosedDays,
    dosedDays,
    notDosedDays,
    outcomeDays,
  };
}

export async function getTopTagSuggestions(userId: string, limit = 3): Promise<string[]> {
  const now = new Date();
  const since = utcMidnightDaysAgo(13, now);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return OutcomeLogRepo.topTagsLastNDays(userId, since, tomorrow, limit);
}

export async function getOutcomeLogsRange(userId: string, since: Date) {
  return prisma.outcomeLog.findMany({
    where: { userId, scheduledDate: { gte: since } },
    orderBy: { scheduledDate: 'asc' },
  });
}

export interface WellbeingSentimentInsightsData {
  averageRating: number | null;
  tagFrequencies: { tag: string; count: number; avgRating: number }[];
  notesSummary: { date: string; rating: number; note: string }[];
  compoundCorrelations: {
    compoundName: string;
    averageRatingOnDosedDays: number | null;
    averageRatingOnNotDosedDays: number | null;
    dosedDaysCount: number;
    notDosedDaysCount: number;
  }[];
}

export async function getWellbeingSentimentInsights(userId: string): Promise<WellbeingSentimentInsightsData> {
  const since180 = new Date();
  since180.setUTCDate(since180.getUTCDate() - 180);

  // Optimized database queries selecting only necessary columns covered by index
  const [outcomes, doses, protocols] = await Promise.all([
    prisma.outcomeLog.findMany({
      where: { userId, scheduledDate: { gte: since180 } },
      select: { overallRating: true, tags: true, note: true, scheduledDate: true },
      orderBy: { scheduledDate: 'desc' },
    }),
    prisma.doseLog.findMany({
      where: { userId, status: 'LOGGED', scheduledDate: { gte: since180 } },
      select: { protocolId: true, scheduledDate: true },
    }),
    prisma.protocol.findMany({
      where: { userId },
      select: {
        id: true,
        compound: {
          select: { name: true },
        },
      },
    }),
  ]);

  // Resolve protocol IDs to compound names
  const protocolCompoundMap = new Map<string, string>();
  for (const p of protocols) {
    if (p.compound?.name) {
      protocolCompoundMap.set(p.id, p.compound.name);
    }
  }

  // Group dose events by logical UTC date string
  const dosesByDate = new Map<string, Set<string>>();
  for (const d of doses) {
    const dateStr = d.scheduledDate.toISOString().split('T')[0];
    const compoundName = protocolCompoundMap.get(d.protocolId);
    if (compoundName) {
      let set = dosesByDate.get(dateStr);
      if (!set) {
        set = new Set<string>();
        dosesByDate.set(dateStr, set);
      }
      set.add(compoundName);
    }
  }

  // Calculate tag frequencies, average rating, and extract recent notes
  const tagStats = new Map<string, { count: number; sumRating: number }>();
  let totalRatingSum = 0;
  const recentNotes: { date: string; rating: number; note: string }[] = [];

  for (const o of outcomes) {
    totalRatingSum += o.overallRating;

    if (o.note && o.note.trim() && recentNotes.length < 5) {
      recentNotes.push({
        date: o.scheduledDate.toISOString().split('T')[0],
        rating: o.overallRating,
        note: o.note,
      });
    }

    for (const tag of o.tags) {
      const stats = tagStats.get(tag) || { count: 0, sumRating: 0 };
      stats.count++;
      stats.sumRating += o.overallRating;
      tagStats.set(tag, stats);
    }
  }

  const averageRating = outcomes.length > 0 ? totalRatingSum / outcomes.length : null;

  const tagFrequencies = Array.from(tagStats.entries())
    .map(([tag, stats]) => ({
      tag,
      count: stats.count,
      avgRating: stats.sumRating / stats.count,
    }))
    .sort((a, b) => b.count - a.count);

  // Compute correlation stats for each compound the user has a protocol for
  const compoundNames = Array.from(new Set(protocolCompoundMap.values()));
  const compoundCorrelations = compoundNames.map((compoundName) => {
    let dosedSum = 0;
    let dosedCount = 0;
    let notDosedSum = 0;
    let notDosedCount = 0;

    for (const o of outcomes) {
      const dateStr = o.scheduledDate.toISOString().split('T')[0];
      const dosedSet = dosesByDate.get(dateStr);
      const wasDosed = dosedSet ? dosedSet.has(compoundName) : false;

      if (wasDosed) {
        dosedSum += o.overallRating;
        dosedCount++;
      } else {
        notDosedSum += o.overallRating;
        notDosedCount++;
      }
    }

    return {
      compoundName,
      averageRatingOnDosedDays: dosedCount > 0 ? dosedSum / dosedCount : null,
      averageRatingOnNotDosedDays: notDosedCount > 0 ? notDosedSum / notDosedCount : null,
      dosedDaysCount: dosedCount,
      notDosedDaysCount: notDosedCount,
    };
  });

  return {
    averageRating,
    tagFrequencies,
    notesSummary: recentNotes,
    compoundCorrelations,
  };
}


