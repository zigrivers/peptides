'use client';

import { useActionState } from 'react';
import { signIn } from 'next-auth/react';
import { loginAction } from '@/app/actions/auth/login';

interface Props {
  initialEmail?: string;
  callbackUrl?: string;
}

export function LoginForm({ initialEmail = '', callbackUrl }: Props) {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="space-y-5">
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

      {/* Glassmorphic Divider */}
      <div className="relative flex items-center justify-center my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/60"></div>
        </div>
        <span className="relative px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-card">
          Or continue with
        </span>
      </div>

      {/* Premium Google Button */}
      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl: callbackUrl || '/dashboard' })}
        className="w-full flex items-center justify-center gap-3 py-3 border border-border bg-background/40 hover:bg-background/60 text-sm font-semibold rounded-xl transition-all duration-200 dark:bg-card/25 hover:border-primary/20 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </button>
    </div>
  );
}

