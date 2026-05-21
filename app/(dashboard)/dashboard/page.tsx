import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOnboardingState } from '@/lib/auth/application/onboarding';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import { getSevenDayRatingAverage, getSevenDayAdherence } from '@/lib/tracker/application/OutcomeLogService';
import { getVialsForUser } from '@/lib/reconstitution/application/VialService';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';
import { StackOverview } from './_components/StackOverview';
import type { SerializedVial } from '@/app/(dashboard)/reconstitution/_components/VialInventory';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const userRole = session.user.role as 'POWER_USER' | 'MANAGED_USER';

  const [onboardingState, protocols, weekInfo, ratingAvg, adherence, vials] = await Promise.all([
    getOnboardingState(userId),
    getProtocolsForUser(userId),
    getCurrentWeekInfo(userId),
    getSevenDayRatingAverage(userId),
    getSevenDayAdherence(userId),
    getVialsForUser(userId),
  ]);

  const showChecklist = onboardingState !== null && onboardingState.step !== 'completed';
  const hasActiveProtocols = protocols.some((p) => p.status === 'ACTIVE');

  const serializedVials: SerializedVial[] = vials.map((v) => ({
    id: v.id,
    compoundName: v.compoundName,
    totalMg: v.totalMg.toFixed(3),
    bacWaterMl: v.bacWaterMl ? v.bacWaterMl.toFixed(3) : null,
    remainingMg: v.remainingMg.toFixed(3),
    status: v.status,
    expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
    badges: v.badges,
  }));

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

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
        userRole={userRole}
        fetchedAt={new Date().toISOString()}
      />
    </main>
  );
}
