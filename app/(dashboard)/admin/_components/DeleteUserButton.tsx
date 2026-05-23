'use client';

import { useActionState } from 'react';
import type { AdminActionResult } from '../_actions';

interface Props {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult | null>;
}

export function DeleteUserButton({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="inline">
      {state?.error && <p className="text-xs text-red-600 mb-1">{state.error}</p>}
      {state?.success && <p className="text-xs text-green-600 mb-1">{state.success}</p>}
      <input type="hidden" name="immediate" value="false" />
      {!state?.success && (
        <button
          type="submit"
          disabled={isPending}
          className="text-xs text-red-700 font-semibold hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? 'Processing…' : 'Schedule Deletion'}
        </button>
      )}
    </form>
  );
}
