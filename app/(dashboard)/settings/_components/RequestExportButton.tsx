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
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 rounded px-3 py-2">
          {state.success}
        </p>
      )}
      {!state?.success && (
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
        >
          {isPending ? 'Preparing your export…' : 'Email me my data'}
        </button>
      )}
      {!state?.success && userEmail && (
        <p className="text-xs text-muted-foreground">Will be sent to {userEmail}</p>
      )}
    </form>
  );
}
