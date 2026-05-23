'use client';

import { useActionState, useEffect, useState } from 'react';
import type { CancelDeletionState } from '@/app/actions/account/cancel-deletion';

interface Props {
  action: (
    prev: CancelDeletionState | null,
    formData: FormData
  ) => Promise<CancelDeletionState>;
  /** ISO 8601 string — kept as a string so server-rendered HTML matches the initial client render. */
  scheduledForISO: string;
}

export function CancelDeletionBanner({ action, scheduledForISO }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  // Format the date client-side only. Rendering toLocaleString() on the
  // server vs. client can produce different strings (the server uses the
  // deployment's locale/TZ; the client uses the user's), triggering a
  // hydration mismatch. The initial server render emits the raw ISO; the
  // effect replaces it after hydration.
  const [formatted, setFormatted] = useState<string>(scheduledForISO);
  useEffect(() => {
    setFormatted(new Date(scheduledForISO).toLocaleString());
  }, [scheduledForISO]);

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
        <strong suppressHydrationWarning>{formatted}</strong>. You can cancel any time before then.
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
