import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getOnboardingState } from '@/lib/auth/application/onboarding';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { OnboardingWizard } from './_components/OnboardingWizard';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const state = await getOnboardingState(session.user.id);
  const orderingEnabled = !isOrderingDisabled();

  // Only redirect when the wizard is fully completed.
  // dismissed=true means the wizard was skipped but not finished;
  // users can return via the dashboard checklist "Continue Setup" link.
  // When ordering is disabled, treat a user on telegram_setup as effectively
  // completed — the only remaining step in the wizard is one they can't reach.
  if (!state || state.step === 'completed' || (!orderingEnabled && state.step === 'telegram_setup')) {
    redirect('/dashboard');
  }

  return (
    <OnboardingWizard
      initialState={state}
      userRole={session.user.role as 'POWER_USER' | 'MANAGED_USER'}
      orderingEnabled={orderingEnabled}
    />
  );
}
