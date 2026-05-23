'use client';

import { useActionState } from 'react';
import type { AdminActionResult } from '../_actions';

interface Props {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult | null>;
}

export function CancelDeletionButton({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="inline">
      {state?.error && <p className="text-xs text-red-600 mb-1">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs text-gray-500 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? 'Cancelling…' : 'Cancel Deletion'}
      </button>
    </form>
  );
}
