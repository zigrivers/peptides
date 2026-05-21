'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { dismissOnboardingAction } from '@/app/actions/auth/onboarding';
import type { OnboardingState, PowerUserStep, ManagedUserStep } from '@/lib/auth/application/onboarding';

const POWER_USER_STEPS: { key: PowerUserStep; label: string }[] = [
  { key: 'browse_catalog', label: 'Browse the Compound Catalog' },
  { key: 'create_protocol', label: 'Create Your First Protocol' },
  { key: 'telegram_setup', label: 'Connect Telegram (Optional)' },
];

const MANAGED_USER_STEPS: { key: ManagedUserStep; label: string }[] = [
  { key: 'view_schedule', label: 'View Your Schedule' },
  { key: 'log_first_dose', label: 'Log Your First Dose' },
];

const STEP_ORDER_PU: PowerUserStep[] = ['browse_catalog', 'create_protocol', 'telegram_setup', 'completed'];
const STEP_ORDER_MU: ManagedUserStep[] = ['view_schedule', 'log_first_dose', 'completed'];

interface GettingStartedChecklistProps {
  state: OnboardingState;
  userRole: 'POWER_USER' | 'MANAGED_USER';
}

export function GettingStartedChecklist({ state, userRole }: GettingStartedChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (state.step === 'completed') return null;

  const steps = userRole === 'POWER_USER' ? POWER_USER_STEPS : MANAGED_USER_STEPS;
  const stepOrder = userRole === 'POWER_USER' ? STEP_ORDER_PU : (STEP_ORDER_MU as (PowerUserStep | ManagedUserStep)[]);
  const currentStepIndex = stepOrder.indexOf(state.step as PowerUserStep & ManagedUserStep);
  const completedCount = Math.max(0, currentStepIndex);
  const totalSteps = steps.length;

  const isStepDone = (key: string) => {
    const keyIndex = stepOrder.indexOf(key as PowerUserStep & ManagedUserStep);
    return keyIndex < currentStepIndex;
  };

  const handleContinue = () => {
    router.push('/onboarding');
  };

  const handleDismiss = () => {
    startTransition(async () => {
      await dismissOnboardingAction();
    });
  };

  return (
    <section aria-label="Getting Started" className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Getting Started</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {completedCount} of {totalSteps} steps completed
          </p>
        </div>
        {!state.dismissed && (
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isPending}
            aria-label="Dismiss Getting Started checklist"
            className="text-gray-400 hover:text-gray-600 text-xs disabled:opacity-50"
          >
            ✕
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4" aria-hidden="true">
        <div
          className="bg-indigo-600 h-1.5 rounded-full transition-all"
          style={{ width: `${(completedCount / totalSteps) * 100}%` }}
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
