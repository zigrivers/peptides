import { prisma } from '@/lib/shared/prisma';

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
