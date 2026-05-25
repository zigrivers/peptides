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
    <form action={formAction} className="space-y-5">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state?.error && (
        <p className="text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
          className="w-full rounded-xl border border-input bg-background/40 px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-card/25 placeholder:text-muted-foreground/40"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-xl border border-input bg-background/40 px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-card/25 placeholder:text-muted-foreground/40"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 mt-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 active:scale-[0.99]"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
