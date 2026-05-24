'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AcceptInviteActionState } from '@/app/actions/auth/accept-invite';

interface Props {
  action: (
    prevState: AcceptInviteActionState | null,
    formData: FormData
  ) => Promise<AcceptInviteActionState>;
  email: string;
}

export function AcceptInviteForm({ action, email }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // On success the action returns {} (no error, no warning). Navigate to
  // /login with the email pre-filled and a success marker. useEffect runs
  // after render so router.replace doesn't trigger a "Cannot update a
  // component while rendering" warning.
  useEffect(() => {
    if (state && !state.error) {
      router.replace(`/login?email=${encodeURIComponent(email)}&accepted=1`);
    }
  }, [state, router, email]);

  const canSubmit = acknowledged && name.trim().length > 0 && password.length >= 8 && password === confirmPassword;

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          className="w-full rounded-md border border-gray-200 bg-gray-50 dark:bg-muted dark:border-border px-3 py-2.5 text-sm text-gray-700 dark:text-slate-300 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">Your name</label>
        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="w-full rounded-md border border-gray-300 dark:border-border dark:bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">
          Password <span className="text-xs text-gray-400">(at least 8 characters)</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full rounded-md border border-gray-300 dark:border-border dark:bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full rounded-md border border-gray-300 dark:border-border dark:bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-muted-foreground mt-4 cursor-pointer p-1.5 hover:bg-gray-50 dark:hover:bg-muted/30 transition-colors rounded">
        <input
          type="checkbox"
          name="acknowledged"
          value="true"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          required
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        />
        <span>
          I acknowledge that my administrator configures my protocols and can view my adherence data,
          and I can request a data export or account deletion at any time.
        </span>
      </label>

      <button
        type="submit"
        disabled={isPending || !canSubmit}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {isPending ? 'Creating your account…' : 'Accept invitation'}
      </button>
    </form>
  );
}
