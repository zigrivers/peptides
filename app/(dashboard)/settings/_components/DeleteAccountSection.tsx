'use client';

import { useActionState, useState } from 'react';
import type { ScheduleDeletionState } from '@/app/actions/account/schedule-deletion';

interface Props {
  scheduleAction: (
    prev: ScheduleDeletionState | null,
    formData: FormData
  ) => Promise<ScheduleDeletionState>;
  immediateAction: (
    prev: ScheduleDeletionState | null,
    formData: FormData
  ) => Promise<ScheduleDeletionState>;
  userEmail: string;
}

type Stage = 'idle' | 'chooseMode' | 'delayed' | 'immediate';

export function DeleteAccountSection({ scheduleAction, immediateAction, userEmail }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [delayedState, delayedFormAction, delayedPending] = useActionState(scheduleAction, null);
  const [immediateState, immediateFormAction, immediatePending] = useActionState(
    immediateAction,
    null
  );

  if (delayedState?.success || immediateState?.success) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
        {delayedState?.success ?? immediateState?.success}
      </div>
    );
  }

  if (stage === 'idle') {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-3">
          Permanently delete your account, protocols, doses, vials, orders, and history. We&apos;ll email you a complete JSON export first.
        </p>
        <button
          type="button"
          onClick={() => setStage('chooseMode')}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Delete my account
        </button>
      </div>
    );
  }

  if (stage === 'chooseMode') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-900">When should we delete it?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStage('delayed')}
            className="rounded-md border border-gray-300 bg-white px-4 py-3 text-left text-sm hover:bg-gray-50"
          >
            <strong className="block text-gray-900">In 48 hours</strong>
            <span className="text-xs text-gray-600">Recommended. Sign back in any time within the window to cancel.</span>
          </button>
          <button
            type="button"
            onClick={() => setStage('immediate')}
            className="rounded-md border border-red-300 bg-white px-4 py-3 text-left text-sm hover:bg-red-50"
          >
            <strong className="block text-red-700">Right now</strong>
            <span className="text-xs text-gray-600">Irreversible. Requires a second confirmation.</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setStage('idle')}
          className="text-xs text-gray-500 underline"
        >
          Never mind
        </button>
      </div>
    );
  }

  if (stage === 'delayed') {
    return (
      <form action={delayedFormAction} className="space-y-3">
        <p className="text-sm text-gray-700">
          We will email your data export, then schedule deletion 48 hours from now. To confirm,
          type your email address below.
        </p>
        <input
          type="email"
          name="confirmEmail"
          required
          autoComplete="off"
          placeholder={userEmail}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {delayedState?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {delayedState.error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={delayedPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {delayedPending ? 'Scheduling…' : 'Schedule deletion in 48 hours'}
          </button>
          <button
            type="button"
            onClick={() => setStage('chooseMode')}
            className="text-sm text-gray-600 underline"
          >
            Back
          </button>
        </div>
      </form>
    );
  }

  // stage === 'immediate'
  return (
    <form action={immediateFormAction} className="space-y-3">
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
        This will permanently delete your account immediately. We&apos;ll send your data export first, but the deletion cannot be undone.
      </p>
      <input
        type="email"
        name="confirmEmail"
        required
        autoComplete="off"
        placeholder={userEmail}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
      />
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" name="acknowledged" required className="mt-0.5" />
        <span>
          I understand this is irreversible and I want to delete my account now.
        </span>
      </label>
      {immediateState?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {immediateState.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={immediatePending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {immediatePending ? 'Deleting…' : 'Delete account now'}
        </button>
        <button
          type="button"
          onClick={() => setStage('chooseMode')}
          className="text-sm text-gray-600 underline"
        >
          Back
        </button>
      </div>
    </form>
  );
}
