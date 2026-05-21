'use server';

import { auth } from '@/lib/auth';
import { advanceOnboardingStep, dismissOnboarding, getOnboardingState } from '@/lib/auth/application/onboarding';
import type { PowerUserStep, ManagedUserStep } from '@/lib/auth/application/onboarding';

export type OnboardingActionResult = { ok: true } | { ok: false; error: string };

export async function getOnboardingStateAction() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getOnboardingState(session.user.id);
}

export async function advanceOnboardingAction(
  nextStep: PowerUserStep | ManagedUserStep
): Promise<OnboardingActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  try {
    await advanceOnboardingStep(session.user.id, nextStep);
    return { ok: true };
  } catch (err) {
    console.error('[advanceOnboardingAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}

export async function dismissOnboardingAction(): Promise<OnboardingActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  try {
    await dismissOnboarding(session.user.id);
    return { ok: true };
  } catch (err) {
    console.error('[dismissOnboardingAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}
