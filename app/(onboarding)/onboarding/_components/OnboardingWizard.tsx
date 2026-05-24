'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { advanceOnboardingAction, dismissOnboardingAction } from '@/app/actions/auth/onboarding';
import type { OnboardingState, PowerUserStep, ManagedUserStep } from '@/lib/auth/application/onboarding';

interface WizardStep {
  key: PowerUserStep | ManagedUserStep;
  title: string;
  description: string;
  cta: string;
}

const POWER_USER_STEPS_ALL: WizardStep[] = [
  {
    key: 'browse_catalog',
    title: 'Browse the Compound Catalog',
    description:
      'Explore compounds, dosing ranges, mechanism of action, and community stacking notes. The catalog is your reference while building protocols.',
    cta: 'Continue',
  },
  {
    key: 'create_protocol',
    title: 'Create Your First Protocol',
    description:
      'Set up a dosing schedule for a compound. Choose dose amount, frequency (daily, EOD, or custom days), start date, and administration route.',
    cta: 'Continue',
  },
  {
    key: 'telegram_setup',
    title: 'Connect Telegram (Optional)',
    description:
      'Link your Telegram account to automate vendor ordering directly from the app. You can skip this and set it up later in Settings.',
    cta: 'Finish Setup',
  },
];

const MANAGED_USER_STEPS: WizardStep[] = [
  {
    key: 'view_schedule',
    title: 'View Your Schedule',
    description:
      "Your protocol manager has configured a dosing schedule for you. Your dashboard shows what's due each day — tap a dose to log it.",
    cta: 'Continue',
  },
  {
    key: 'log_first_dose',
    title: 'Log Your First Dose',
    description:
      "When you take a dose, tap 'Log' next to it on the dashboard. Keeping your logs current helps your manager track your adherence.",
    cta: 'Finish Setup',
  },
];

interface OnboardingWizardProps {
  initialState: OnboardingState;
  userRole: 'POWER_USER' | 'MANAGED_USER';
  /**
   * When false, the Telegram step is removed from the power-user wizard
   * (per ADR-015 / US-ORD-08). The previous step's CTA becomes "Finish Setup"
   * because it is now the last step.
   */
  orderingEnabled: boolean;
}

export function OnboardingWizard({ initialState, userRole, orderingEnabled }: OnboardingWizardProps) {
  const router = useRouter();
  // Filter out Telegram step when ordering is disabled, and re-label the
  // (now last) step's CTA so the final action says "Finish Setup".
  const powerUserSteps: WizardStep[] = orderingEnabled
    ? POWER_USER_STEPS_ALL
    : POWER_USER_STEPS_ALL
        .filter((s) => s.key !== 'telegram_setup')
        .map((s, i, arr) => (i === arr.length - 1 ? { ...s, cta: 'Finish Setup' } : s));
  const steps = userRole === 'POWER_USER' ? powerUserSteps : MANAGED_USER_STEPS;

  const initialIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === initialState.step)
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentStep = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;
  const totalSteps = steps.length;

  const handleNext = () => {
    setError(null);
    startTransition(async () => {
      const nextKey = isLastStep
        ? 'completed'
        : (steps[currentIndex + 1].key as PowerUserStep | ManagedUserStep);
      const result = await advanceOnboardingAction(nextKey);
      if (!result.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }
      if (nextKey === 'completed') {
        router.push('/dashboard');
      } else {
        setCurrentIndex((i) => i + 1);
      }
    });
  };

  const handleDismiss = () => {
    setError(null);
    startTransition(async () => {
      const result = await dismissOnboardingAction();
      if (!result.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }
      router.push('/dashboard');
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <p className="text-sm font-medium text-primary mb-1">Getting Started</p>
          <h1 className="text-xl font-semibold text-gray-900">
            {userRole === 'POWER_USER' ? 'Set up your tracker' : 'Welcome to your dashboard'}
          </h1>
        </div>

        {/* Step indicators */}
        <div className="px-6 py-4">
          <ol aria-label="Setup progress" className="flex items-center gap-2 mb-6">
            {steps.map((step, i) => {
              const isCompleted = i < currentIndex;
              const isCurrent = i === currentIndex;
              return (
                <li key={step.key} className="flex items-center gap-2" aria-current={isCurrent ? 'step' : undefined}>
                  <span
                    className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                      isCompleted
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                          ? 'bg-primary/10 text-primary ring-2 ring-primary'
                          : 'bg-gray-100 text-gray-400',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {isCompleted ? '✓' : i + 1}
                  </span>
                  <span className="sr-only">
                    Step {i + 1}: {step.title}
                    {isCurrent ? ' (current)' : isCompleted ? ' (completed)' : ''}
                  </span>
                  {i < steps.length - 1 && (
                    <span
                      className={['flex-1 h-0.5', isCompleted ? 'bg-primary' : 'bg-gray-200'].join(' ')}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {/* Step content */}
          <div className="mb-6" aria-live="polite">
            <p className="text-xs text-gray-500 mb-1">
              Step {currentIndex + 1} of {totalSteps}
            </p>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{currentStep.title}</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{currentStep.description}</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 mb-4">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary rounded"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={isPending}
              className="px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {isPending ? 'Saving…' : currentStep.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
