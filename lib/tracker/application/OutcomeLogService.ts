import { prisma } from '@/lib/shared/prisma';

export interface AdherenceResult {
  logged: number;
  total: number;
  percent: number;
}

export async function getSevenDayRatingAverage(userId: string): Promise<number | null> {
  const since = new Date(Date.now() - 7 * 86400_000);

  const logs = await prisma.outcomeLog.findMany({
    where: {
      userId,
      scheduledDate: { gte: since },
    },
    select: { overallRating: true },
  });

  if (logs.length === 0) return null;
  const sum = logs.reduce((acc, l) => acc + l.overallRating, 0);
  return sum / logs.length;
}

export async function getSevenDayAdherence(userId: string): Promise<AdherenceResult> {
  const since = new Date(Date.now() - 7 * 86400_000);

  const logs = await prisma.doseLog.findMany({
    where: {
      userId,
      scheduledDate: { gte: since },
      status: { in: ['LOGGED', 'SKIPPED'] },
    },
    select: { status: true },
  });

  const total = logs.length;
  const logged = logs.filter((l) => l.status === 'LOGGED').length;
  const percent = total === 0 ? 0 : (logged / total) * 100;

  return { logged, total, percent };
}
