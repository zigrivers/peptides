'use client';

import { useActionState, useState } from 'react';
import type { AdminActionResult } from '../_actions';

interface Props {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult | null>;
  userEmail: string;
}

export function DeleteUserButton({ action, userEmail }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [typed, setTyped] = useState('');
  const matches = typed === userEmail;

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {state?.error && <p className="text-xs text-red-600 mb-1">{state.error}</p>}
      {state?.success && <p className="text-xs text-green-600 mb-1">{state.success}</p>}
      {!state?.success && (
        <>
          <input
            type="email"
            name="confirmEmail"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Type ${userEmail} to confirm`}
            className="text-xs border border-gray-300 rounded px-2 py-1 w-56"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={isPending || !matches}
            className="text-xs text-red-700 font-semibold hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Scheduling…' : 'Schedule Deletion'}
          </button>
        </>
      )}
    </form>
  );
}
