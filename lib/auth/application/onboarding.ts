import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';

export type PowerUserStep = 'browse_catalog' | 'create_protocol' | 'telegram_setup' | 'completed';
export type ManagedUserStep = 'view_schedule' | 'log_first_dose' | 'completed';

export interface OnboardingState {
  step: PowerUserStep | ManagedUserStep;
  completedAt?: string;
  dismissed: boolean;
}

export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingState: true, role: true },
  });
  if (!user) return null;
  if (user.onboardingState) return user.onboardingState as unknown as OnboardingState;
  // Default initial state by role
  const initialStep: PowerUserStep | ManagedUserStep =
    user.role === 'MANAGED_USER' ? 'view_schedule' : 'browse_catalog';
  return { step: initialStep, dismissed: false };
}

export async function advanceOnboardingStep(
  userId: string,
  nextStep: PowerUserStep | ManagedUserStep
): Promise<void> {
  const state =
    nextStep === 'completed'
      ? { step: 'completed' as const, completedAt: new Date().toISOString(), dismissed: false }
      : { step: nextStep, dismissed: false };

  await withAudit(
    async (tx) => {
      await (tx as { user: typeof prisma['user'] }).user.update({
        where: { id: userId },
        data: { onboardingState: state },
      });
    },
    {
      actorUserId: userId,
      category: 'Auth' as const,
      action: 'ONBOARDING_STEP_ADVANCED' as const,
      resourceId: userId,
      resourceType: 'User',
      metadata: { step: nextStep },
    }
  );
}

export async function dismissOnboarding(userId: string): Promise<void> {
  const current = await getOnboardingState(userId);
  const state = { ...(current ?? { step: 'completed' as const, dismissed: true }), dismissed: true };

  await withAudit(
    async (tx) => {
      await (tx as { user: typeof prisma['user'] }).user.update({
        where: { id: userId },
        data: { onboardingState: state },
      });
    },
    {
      actorUserId: userId,
      category: 'Auth' as const,
      action: 'ONBOARDING_DISMISSED' as const,
      resourceId: userId,
      resourceType: 'User',
    }
  );
}
