import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
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

function utcMidnightOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

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

  // Ownership check for any submitted protocolRatings BEFORE the audit
  // transaction so a forged protocolId triggers a clean error rather than
  // an audit-write-then-rollback.
  if (input.protocolRatings.length > 0) {
    const requested = [...new Set(input.protocolRatings.map((r) => r.protocolId))];
    const owned = await prisma.protocol.findMany({
      where: { userId, id: { in: requested } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((p) => p.id));
    const missing = requested.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      throw new Error('protocol_not_owned');
    }
  }

  return withAudit(
    (tx) =>
      OutcomeLogRepo.upsertWithRatings(
        userId,
        {
          scheduledDate: input.scheduledDate,
          overallRating: input.overallRating,
          tags: input.tags,
          note: input.note ?? null,
          protocolRatings: input.protocolRatings,
        },
        tx
      ),
    (result) => ({
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
        protocolRatingCount: input.protocolRatings.length,
      },
    })
  );
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
