import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOnboardingState } from '@/lib/auth/application/onboarding';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import { getSevenDayRatingAverage, getSevenDayAdherence, hasDoseTodayForUser } from '@/lib/tracker/application/OutcomeLogService';
import { getVialsForUser, serializeVial } from '@/lib/reconstitution/application/VialService';
import { getStaleOrderCount } from '@/lib/ordering/application/OrderService';
import { utcMidnightToday } from '@/lib/shared/date';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';
import { StackOverview } from './_components/StackOverview';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const userRole = session.user.role as 'POWER_USER' | 'MANAGED_USER';

  const [onboardingState, protocols, weekInfo, ratingAvg, adherence, vials, hasDoseToday, staleOrderCount] = await Promise.all([
    getOnboardingState(userId),
    getProtocolsForUser(userId),
    getCurrentWeekInfo(userId),
    getSevenDayRatingAverage(userId),
    getSevenDayAdherence(userId),
    getVialsForUser(userId),
    hasDoseTodayForUser(userId),
    getStaleOrderCount(userId),
  ]);

  const showChecklist = onboardingState !== null && onboardingState.step !== 'completed';
  const hasActiveProtocols = protocols.some((p) => p.status === 'ACTIVE');

  const serializedVials = vials.map((v) => serializeVial(v, utcMidnightToday()));

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {staleOrderCount > 0 && (
        <Link href="/ordering/orders" className="block mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          ⚠ {staleOrderCount} order{staleOrderCount > 1 ? 's' : ''} may be stale — check your order history.
        </Link>
      )}

      {showChecklist && onboardingState && (
        <GettingStartedChecklist
          state={onboardingState}
          userRole={userRole}
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
      />
    </main>
  );
}
