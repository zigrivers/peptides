'use client';

import { useActionState } from 'react';
import type { CancelDeletionState } from '@/app/actions/account/cancel-deletion';

interface Props {
  action: (
    prev: CancelDeletionState | null,
    formData: FormData
  ) => Promise<CancelDeletionState>;
  scheduledFor: Date;
}

export function CancelDeletionBanner({ action, scheduledFor }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  if (state?.success) {
    return (
      <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-800">
        {state.success}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900 mb-1">Deletion pending</h2>
      <p className="text-sm text-amber-900">
        Your account is scheduled to be permanently deleted on{' '}
        <strong>{scheduledFor.toLocaleString()}</strong>. You can cancel any time before then.
      </p>
      {state?.error && (
        <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}
      <form action={formAction} className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {pending ? 'Cancelling…' : 'Cancel deletion'}
        </button>
      </form>
    </div>
  );
}
