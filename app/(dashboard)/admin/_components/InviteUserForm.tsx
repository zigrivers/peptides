'use client';

import { useActionState, useEffect, useRef } from 'react';
import { inviteUserAction } from '../_actions';

export function InviteUserForm() {
  const [state, formAction, isPending] = useActionState(inviteUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground p-5 shadow-sm space-y-4 transition-all duration-300 hover:border-primary/30">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Invite Managed User</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Send a registration link with a 72-hour expiration to invite a new managed user.
        </p>
      </div>

      <form ref={formRef} action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-1">
          <label htmlFor="email" className="sr-only">Email Address</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="email@example.com"
            disabled={isPending}
            required
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          {state?.error && (
            <p className="text-xs font-medium text-red-500 animate-slide-up" role="alert">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="text-xs font-medium text-green-500 animate-slide-up" role="alert">
              {state.success}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-95 duration-150 whitespace-nowrap"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-primary-foreground" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Inviting…
            </span>
          ) : (
            'Send Invite'
          )}
        </button>
      </form>
    </div>
  );
}
