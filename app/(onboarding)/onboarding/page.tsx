import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOnboardingState } from '@/lib/auth/application/onboarding';
import { OnboardingWizard } from './_components/OnboardingWizard';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const state = await getOnboardingState(session.user.id);

  // Already completed — go to dashboard.
  if (!state || state.step === 'completed' || state.dismissed) {
    redirect('/dashboard');
  }

  return (
    <OnboardingWizard
      initialState={state}
      userRole={session.user.role as 'POWER_USER' | 'MANAGED_USER'}
    />
  );
}
