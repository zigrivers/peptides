'use client';

import { useActionState } from 'react';
import type { AdminActionResult } from '../_actions';

interface Props {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult | null>;
}

export function DeleteUserButton({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const needsSecondConfirm = !!state?.warning;

  return (
    <form action={formAction} className="inline">
      {state?.error && <p className="text-xs text-red-600 mb-1">{state.error}</p>}
      {state?.success && <p className="text-xs text-green-600 mb-1">{state.success}</p>}
      {needsSecondConfirm && <p className="text-xs text-red-700 mb-1">{state.warning}</p>}
      <input type="hidden" name="immediate" value="true" />
      <input type="hidden" name="secondConfirm" value={needsSecondConfirm ? 'true' : 'false'} />
      {!state?.success && (
        <button
          type="submit"
          disabled={isPending}
          className="text-xs text-red-700 font-semibold hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'Processing…' : needsSecondConfirm ? 'Confirm Delete (Irreversible)' : 'Delete Account'}
        </button>
      )}
    </form>
  );
}
