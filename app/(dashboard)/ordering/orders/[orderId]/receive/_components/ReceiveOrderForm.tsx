'use client';

import { useActionState } from 'react';
import type { ActionResult } from '../../../_actions';

interface Props {
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult | null>;
}

export function ReceiveOrderForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction}>
      {state?.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-green-600 text-white px-4 py-3 text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? 'Processing…' : 'Confirm Receipt & Add to Inventory'}
      </button>
    </form>
  );
}
