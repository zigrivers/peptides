import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOnboardingState } from '@/lib/auth/application/onboarding';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import {
  getSevenDayRatingAverage,
  getSevenDayAdherence,
  hasDoseTodayForUser,
  getOutcomeLogsRange,
  getWellbeingSentimentInsights,
} from '@/lib/tracker/application/OutcomeLogService';
import { getDoseLogsRange } from '@/lib/tracker/application/DoseLogService';
import { getCompoundsMinimal } from '@/lib/reference/infrastructure/CompoundRepo';
import { getVialsForUser, serializeVial } from '@/lib/reconstitution/application/VialService';
import { getStaleOrderCount } from '@/lib/ordering/application/OrderService';
import { getDueTodayForBatch } from '@/lib/tracker/application/BatchLogService';
import { utcMidnightToday } from '@/lib/shared/date';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { prisma } from '@/lib/shared/prisma';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';
import { StackOverview } from './_components/StackOverview';
import { InteractiveAnalytics } from './_components/InteractiveAnalytics';
import { WellbeingSentimentInsights } from './_components/WellbeingSentimentInsights';
import { calculateStreak } from '@/lib/tracker/domain/streak';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const userRole = session.user.role as 'POWER_USER' | 'MANAGED_USER';

  const orderingEnabled = !isOrderingDisabled();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const streakLimitDays = 365;
  const streakSince = new Date();
  streakSince.setUTCDate(streakSince.getUTCDate() - streakLimitDays);

  const [
    onboardingState,
    protocols,
    weekInfo,
    ratingAvg,
    adherence,
    vials,
    hasDoseToday,
    staleOrderCount,
    allDoseLogs,
    outcomeLogs,
    compoundsList,
    sentimentInsights,
    dueToday,
    userSettings,
  ] = await Promise.all([
    getOnboardingState(userId),
    getProtocolsForUser(userId),
    getCurrentWeekInfo(userId),
    getSevenDayRatingAverage(userId),
    getSevenDayAdherence(userId),
    getVialsForUser(userId),
    hasDoseTodayForUser(userId),
    orderingEnabled ? getStaleOrderCount(userId) : Promise.resolve(0),
    getDoseLogsRange(userId, streakSince),
    getOutcomeLogsRange(userId, thirtyDaysAgo),
    getCompoundsMinimal(),
    getWellbeingSentimentInsights(userId),
    getDueTodayForBatch(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { syringeStandard: true },
    }),
  ]);

  const showChecklist = onboardingState !== null && onboardingState.step !== 'completed';
  const hasActiveProtocols = protocols.some((p) => p.status === 'ACTIVE');

  const syringeStandard = userSettings?.syringeStandard ?? 'U100';
  const serializedVials = vials.map((v) => serializeVial(v, utcMidnightToday(), protocols, syringeStandard));

  const compoundsListMap = Object.fromEntries(
    compoundsList.map((c) => [c.id, { name: c.name, slug: c.slug }])
  );

  const protocolCompoundsMap = Object.fromEntries(
    protocols.map((p) => {
      const comp = compoundsListMap[p.compoundId] ?? { name: 'Compound', slug: 'unknown' };
      return [p.id, comp];
    })
  );

  // Filter 365-day logs in-memory to get the last 30 days for chart display
  const doseLogs = allDoseLogs.filter(
    (log) => new Date(log.scheduledDate).getTime() >= thirtyDaysAgo.getTime()
  );

  const serializedDoseLogs = doseLogs.map((log) => {
    const slug = protocolCompoundsMap[log.protocolId]?.slug;
    if (!slug) {
      console.warn(`[DashboardPage] Missing protocol reference for dose log ${log.id}`);
    }
    return {
      id: log.id,
      protocolId: log.protocolId,
      compoundId: slug ?? 'unknown',
      scheduledDate: log.scheduledDate.toISOString(),
      amount: log.amount,
      status: log.status,
    };
  });

  const serializedOutcomeLogs = outcomeLogs.map((log) => ({
    id: log.id,
    scheduledDate: log.scheduledDate.toISOString(),
    overallRating: log.overallRating,
    tags: log.tags,
    note: log.note,
  }));

  // Calculate logical UTC calendar streak
  const loggedDates = allDoseLogs
    .filter((log) => log.status === 'LOGGED')
    .map((log) => log.scheduledDate.toISOString().split('T')[0]);
  const streak = calculateStreak(loggedDates);

  const todayScheduledCount = dueToday.length;
  const todayLogsCount = dueToday.filter(
    (item) => item.existingLog !== null && item.existingLog.status === 'LOGGED'
  ).length;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 animate-page-enter">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-6">Dashboard</h1>

      {orderingEnabled && staleOrderCount > 0 && (
        <Link href="/ordering/orders" className="block mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          ⚠ {staleOrderCount} order{staleOrderCount > 1 ? 's' : ''} may be stale — check your order history.
        </Link>
      )}

      {showChecklist && onboardingState && (
        <GettingStartedChecklist
          state={onboardingState}
          userRole={userRole}
          orderingEnabled={orderingEnabled}
        />
      )}

      <StackOverview
        weekInfo={weekInfo}
        vials={serializedVials}
        ratingAvg={ratingAvg}
        adherence={adherence}
        hasActiveProtocols={hasActiveProtocols}
        hasDoseToday={hasDoseToday}
        userRole={userRole}
        fetchedAt={new Date().toISOString()}
        streak={streak}
      />

      <WellbeingSentimentInsights insights={sentimentInsights} />

      <InteractiveAnalytics
        doseLogs={serializedDoseLogs}
        outcomeLogs={serializedOutcomeLogs}
        compounds={protocolCompoundsMap}
        todayScheduledCount={todayScheduledCount}
        todayLogsCount={todayLogsCount}
      />
    </main>
  );
}
