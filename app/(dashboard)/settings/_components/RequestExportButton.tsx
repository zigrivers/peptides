'use client';

import { useActionState } from 'react';
import type { RequestExportActionState } from '@/app/actions/account/request-export';

interface Props {
  action: (
    prevState: RequestExportActionState | null,
    formData: FormData
  ) => Promise<RequestExportActionState>;
  userEmail: string;
}

export function RequestExportButton({ action, userEmail }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {state.success}
        </p>
      )}
      {!state?.success && (
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Preparing your export…' : 'Email me my data'}
        </button>
      )}
      {!state?.success && userEmail && (
        <p className="text-xs text-gray-500">Will be sent to {userEmail}</p>
      )}
    </form>
  );
}
