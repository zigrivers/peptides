import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOnboardingState } from '@/lib/auth/application/onboarding';
import { GettingStartedChecklist } from './_components/GettingStartedChecklist';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const onboardingState = await getOnboardingState(session.user.id);
  const showChecklist =
    onboardingState !== null &&
    onboardingState.step !== 'completed';

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {showChecklist && onboardingState && (
        <GettingStartedChecklist
          state={onboardingState}
          userRole={session.user.role as 'POWER_USER' | 'MANAGED_USER'}
        />
      )}

      {/* Tracker, Protocols, etc. — implementation in Wave 2 tasks */}
      <p className="text-sm text-gray-500">Your protocols and dose logs will appear here.</p>
    </main>
  );
}
