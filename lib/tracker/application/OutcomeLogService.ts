import { prisma } from '@/lib/shared/prisma';

export interface AdherenceResult {
  logged: number;
  total: number;
  percent: number;
}

function utcMidnightDaysAgo(days: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - days));
}

export async function getSevenDayRatingAverage(userId: string): Promise<number | null> {
  const since = utcMidnightDaysAgo(7);
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1));

  const logs = await prisma.outcomeLog.findMany({
    where: {
      userId,
      scheduledDate: { gte: since, lt: today },
    },
    select: { overallRating: true },
  });

  if (logs.length === 0) return null;
  const sum = logs.reduce((acc, l) => acc + l.overallRating, 0);
  return sum / logs.length;
}

export async function getSevenDayAdherence(userId: string): Promise<AdherenceResult> {
  const since = utcMidnightDaysAgo(7);
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1));

  const logs = await prisma.doseLog.findMany({
    where: {
      userId,
      scheduledDate: { gte: since, lt: today },
      status: { in: ['LOGGED', 'SKIPPED'] },
    },
    select: { status: true },
  });

  const total = logs.length;
  const logged = logs.filter((l) => l.status === 'LOGGED').length;
  const percent = total === 0 ? 0 : (logged / total) * 100;

  return { logged, total, percent };
}
