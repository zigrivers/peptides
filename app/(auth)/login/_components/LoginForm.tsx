'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth/login';

interface Props {
  initialEmail?: string;
  callbackUrl?: string;
}

export function LoginForm({ initialEmail = '', callbackUrl }: Props) {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900 dark:text-red-400 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={initialEmail}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-md border border-gray-300 dark:border-border dark:bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-md border border-gray-300 dark:border-border dark:bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
