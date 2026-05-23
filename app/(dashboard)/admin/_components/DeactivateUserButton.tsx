'use client';

import { useActionState } from 'react';
import type { AdminActionResult } from '../_actions';

interface Props {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult | null>;
}

export function DeactivateUserButton({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const needsConfirm = !!state?.warning;

  return (
    <form action={formAction} className="inline">
      {state?.error && (
        <p className="text-xs text-red-600 mb-1">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-green-600 mb-1">{state.success}</p>
      )}
      {needsConfirm && (
        <p className="text-xs text-amber-700 mb-1">{state.warning}</p>
      )}
      <input type="hidden" name="confirmed" value={needsConfirm ? 'true' : 'false'} />
      <button
        type="submit"
        disabled={isPending || !!state?.success}
        className="text-xs text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? 'Processing…' : state?.success ? 'Deactivated' : needsConfirm ? 'Confirm Deactivate' : 'Deactivate'}
      </button>
    </form>
  );
}
