import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import {
  getOutcomeForDate,
  getTimelineSeries,
  getCorrelationStats,
  getTopTagSuggestions,
} from '@/lib/tracker/application/OutcomeLogService';
import { prisma } from '@/lib/shared/prisma';
import { utcMidnightToday } from '@/lib/shared/date';
import { logOutcomeAction } from '@/app/actions/tracker/log-outcome';
import { OutcomeForm } from './_components/OutcomeForm';
import { CorrelationTimeline } from './_components/CorrelationTimeline';
import { CorrelationStats } from './_components/CorrelationStats';

interface PageProps {
  searchParams: Promise<{ window?: string }>;
}

export default async function OutcomesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;
  const params = await searchParams;
  const windowDays = params.window === '90' ? 90 : 30;
  const today = utcMidnightToday();

  const [todayOutcome, protocolRows, suggestedTags, timeline, stats] = await Promise.all([
    getOutcomeForDate(userId, today),
    prisma.protocol.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, compound: { select: { name: true } } },
      orderBy: { startDate: 'desc' },
    }),
    getTopTagSuggestions(userId),
    getTimelineSeries(userId, windowDays),
    getCorrelationStats(userId, windowDays),
  ]);

  const activeProtocols = protocolRows.map((p) => ({
    id: p.id,
    name: p.compound.name,
  }));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Outcomes</h1>
        <p className="text-sm text-gray-600">
          Log how you felt and see how your dosing patterns correlate with your daily ratings.
        </p>
      </header>

      <section aria-labelledby="log-outcome-heading" className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 id="log-outcome-heading" className="text-sm font-semibold text-gray-900 mb-3">
          Today&apos;s outcome
        </h2>
        <OutcomeForm
          action={logOutcomeAction}
          scheduledDateISO={today.toISOString().slice(0, 10)}
          suggestedTags={suggestedTags}
          activeProtocols={activeProtocols}
          existingOutcome={
            todayOutcome
              ? {
                  overallRating: todayOutcome.overallRating,
                  tags: todayOutcome.tags,
                  note: todayOutcome.note,
                  protocolRatings: todayOutcome.protocolRatings.map((r) => ({
                    protocolId: r.protocolId,
                    rating: r.rating,
                  })),
                }
              : null
          }
        />
      </section>

      <section aria-labelledby="correlation-heading" className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="correlation-heading" className="text-sm font-semibold text-gray-900">
            Dose × outcome correlation
          </h2>
          <nav className="flex items-center gap-1 text-xs">
            <Link
              className={`inline-flex min-h-9 items-center rounded-md px-2 ${windowDays === 30 ? 'font-semibold text-indigo-600 bg-indigo-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              href="/tracker/outcomes?window=30"
            >
              30 days
            </Link>
            <Link
              className={`inline-flex min-h-9 items-center rounded-md px-2 ${windowDays === 90 ? 'font-semibold text-indigo-600 bg-indigo-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              href="/tracker/outcomes?window=90"
            >
              90 days
            </Link>
          </nav>
        </div>
        <CorrelationStats stats={stats} />
        <CorrelationTimeline buckets={timeline} />
      </section>
    </main>
  );
}
