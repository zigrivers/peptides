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

/**
 * Render a hydration-safe UTC representation of an ISO timestamp.
 * `YYYY-MM-DD HH:MM UTC` is stable across server (any TZ) and client.
 */
function utcDisplay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function CancelDeletionBanner({ action, scheduledForISO }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  // Render a stable UTC string on the server and initial client render so
  // hydration never mismatches. After hydration, useEffect replaces it
  // with the user's local-time format. No raw ISO flash.
  const [formatted, setFormatted] = useState<string>(() => utcDisplay(scheduledForISO));
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
