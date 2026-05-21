'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { advanceOnboardingStep, dismissOnboarding, getOnboardingState } from '@/lib/auth/application/onboarding';

const POWER_USER_STEPS = ['browse_catalog', 'create_protocol', 'telegram_setup', 'completed'] as const;
const MANAGED_USER_STEPS = ['view_schedule', 'log_first_dose', 'completed'] as const;

const NextStepSchema = z.union([
  z.enum(POWER_USER_STEPS),
  z.enum(MANAGED_USER_STEPS),
]);

export type OnboardingActionResult = { ok: true } | { ok: false; error: string };

export async function getOnboardingStateAction() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getOnboardingState(session.user.id);
}

export async function advanceOnboardingAction(nextStep: unknown): Promise<OnboardingActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = NextStepSchema.safeParse(nextStep);
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  const allowedSteps: readonly string[] =
    session.user.role === 'POWER_USER' ? POWER_USER_STEPS : MANAGED_USER_STEPS;
  if (!allowedSteps.includes(parsed.data)) return { ok: false, error: 'validation_error' };

  try {
    await advanceOnboardingStep(session.user.id, parsed.data);
    // Invalidate the dashboard RSC cache so the checklist disappears immediately
    // when the user is redirected back after completing onboarding.
    revalidatePath('/dashboard');
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
