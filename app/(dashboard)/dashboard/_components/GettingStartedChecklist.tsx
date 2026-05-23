'use client';

import { useRouter } from 'next/navigation';
import type { OnboardingState, PowerUserStep, ManagedUserStep } from '@/lib/auth/application/onboarding';

const POWER_USER_STEPS_ALL: { key: PowerUserStep; label: string }[] = [
  { key: 'browse_catalog', label: 'Browse the Compound Catalog' },
  { key: 'create_protocol', label: 'Create Your First Protocol' },
  { key: 'telegram_setup', label: 'Connect Telegram (Optional)' },
];

const MANAGED_USER_STEPS: { key: ManagedUserStep; label: string }[] = [
  { key: 'view_schedule', label: 'View Your Schedule' },
  { key: 'log_first_dose', label: 'Log Your First Dose' },
];

const STEP_ORDER_PU_ALL: (PowerUserStep | ManagedUserStep)[] = [
  'browse_catalog', 'create_protocol', 'telegram_setup', 'completed',
];
const STEP_ORDER_MU: (PowerUserStep | ManagedUserStep)[] = [
  'view_schedule', 'log_first_dose', 'completed',
];

interface GettingStartedChecklistProps {
  state: OnboardingState;
  userRole: 'POWER_USER' | 'MANAGED_USER';
  /**
   * When false, the Telegram-connect step is hidden from the power-user
   * checklist (per ADR-015 / US-ORD-08: DISABLE_ORDERING flag). The dashboard
   * server component reads the flag and passes it down.
   */
  orderingEnabled: boolean;
}

// The checklist persists on the dashboard until all steps are completed,
// per UX spec §2.3: "Getting Started checklist persists on dashboard until 100% complete".
// It is intentionally not dismissible — only completing all steps hides it.
export function GettingStartedChecklist({ state, userRole, orderingEnabled }: GettingStartedChecklistProps) {
  const router = useRouter();

  if (state.step === 'completed') return null;
  // When ordering is disabled, treat telegram_setup as effectively completed —
  // the checklist hides rather than dangling a step the user can't act on.
  if (!orderingEnabled && state.step === 'telegram_setup') return null;

  const powerUserSteps = orderingEnabled
    ? POWER_USER_STEPS_ALL
    : POWER_USER_STEPS_ALL.filter((s) => s.key !== 'telegram_setup');
  const stepOrderPU = orderingEnabled
    ? STEP_ORDER_PU_ALL
    : STEP_ORDER_PU_ALL.filter((s) => s !== 'telegram_setup');

  const steps = userRole === 'POWER_USER' ? powerUserSteps : MANAGED_USER_STEPS;
  const stepOrder = userRole === 'POWER_USER' ? stepOrderPU : STEP_ORDER_MU;
  const currentStepIndex = stepOrder.indexOf(state.step as PowerUserStep | ManagedUserStep);
  const completedCount = Math.max(0, currentStepIndex);
  const totalSteps = steps.length;

  const isStepDone = (key: string) => {
    const keyIndex = stepOrder.indexOf(key as PowerUserStep | ManagedUserStep);
    return keyIndex < currentStepIndex;
  };

  const handleContinue = () => {
    router.push('/onboarding');
  };

  return (
    <section aria-label="Getting Started" className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Getting Started</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {completedCount} of {totalSteps} steps completed
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4" aria-hidden="true">
        <div
          className="bg-indigo-600 h-1.5 rounded-full transition-all"
          style={{ width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%` }}
        />
      </div>

      {/* Steps list */}
      <ul className="space-y-2 mb-4">
        {steps.map((step) => {
          const done = isStepDone(step.key);
          const isCurrent = step.key === state.step;
          return (
            <li key={step.key} className="flex items-center gap-2.5">
              <span
                className={[
                  'w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0',
                  done ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400',
                ].join(' ')}
                aria-hidden="true"
              >
                {done ? '✓' : ''}
              </span>
              <span
                className={[
                  'text-sm',
                  done ? 'text-gray-400 line-through' : isCurrent ? 'text-gray-900 font-medium' : 'text-gray-500',
                ].join(' ')}
              >
                {step.label}
              </span>
              {isCurrent && (
                <span className="ml-auto text-xs text-indigo-600 font-medium">Current</span>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Continue Setup
      </button>
    </section>
  );
}
