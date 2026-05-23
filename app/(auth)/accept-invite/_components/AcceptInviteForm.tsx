'use client';

import { useActionState, useState } from 'react';
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
  // /login with the email pre-filled and a success message.
  if (state && !state.error) {
    router.replace(`/login?email=${encodeURIComponent(email)}&accepted=1`);
  }

  const canSubmit = acknowledged && name.trim().length > 0 && password.length >= 8 && password === confirmPassword;

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={email}
          readOnly
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
        />
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Your name</label>
        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 mt-4">
        <input
          type="checkbox"
          name="acknowledged"
          value="true"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          required
          className="mt-0.5"
        />
        <span>
          I acknowledge that my administrator configures my protocols and can view my adherence data,
          and I can request a data export or account deletion at any time.
        </span>
      </label>

      <button
        type="submit"
        disabled={isPending || !canSubmit}
        className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Creating your account…' : 'Accept invitation'}
      </button>
    </form>
  );
}
