'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  initiateTelegramLinkAction,
  completeTelegramLinkAction,
  completeTelegramLinkWithPasswordAction,
  unlinkTelegramAction,
} from '@/app/actions/ordering/telegram-auth';

interface Props {
  linked: boolean;
}

type Step = 'idle' | 'phone' | 'code' | 'password';

export function TelegramSetupForm({ linked }: Props) {
  const router = useRouter();
  // isLinked is derived from the server prop but managed locally so the UI updates
  // immediately on success without waiting for router.refresh() to propagate.
  const [isLinked, setIsLinked] = useState(linked);
  const [step, setStep] = useState<Step>('idle');
  const [phone, setPhone] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [flowId, setFlowId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await initiateTelegramLinkAction({ phone });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? result.error);
      return;
    }
    setPhoneCodeHash(result.data.phoneCodeHash);
    setFlowId(result.data.flowId);
    setStep('code');
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await completeTelegramLinkAction({ phone, phoneCodeHash, code, flowId });
    setPending(false);
    if (!result.ok) {
      if (result.error === 'password_required' && result.flowId) {
        setFlowId(result.flowId);
        setStep('password');
        return;
      }
      setError(result.message ?? result.error);
      return;
    }
    setIsLinked(true);
    setStep('idle');
    router.refresh();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await completeTelegramLinkWithPasswordAction({ password, flowId });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? result.error);
      return;
    }
    setIsLinked(true);
    setStep('idle');
    router.refresh();
  }

  async function handleUnlink() {
    if (!confirm('Disconnect your Telegram account? Orders will require manual copy-paste.')) return;
    setPending(true);
    setError(null);
    const result = await unlinkTelegramAction();
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? result.error);
      return;
    }
    setIsLinked(false);
    router.refresh();
  }

  if (isLinked) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">Telegram linked</p>
            <p className="text-xs text-green-600 mt-0.5">Orders can be sent automatically via your account.</p>
          </div>
          <button
            onClick={handleUnlink}
            disabled={pending}
            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {pending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === 'idle') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600 mb-3">
          Link your Telegram account to send orders automatically. You can always compose and copy
          messages manually — the fallback is always available.
        </p>
        <button
          onClick={() => setStep('phone')}
          className="rounded bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
        >
          Link Telegram Account
        </button>
      </div>
    );
  }

  if (step === 'phone') {
    return (
      <form onSubmit={handlePhoneSubmit} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">Enter your phone number</p>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551234567"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? 'Sending code…' : 'Send Code'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('idle'); setError(null); }}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={handleCodeSubmit} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">Enter the code sent to {phone}</p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="12345"
          inputMode="numeric"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? 'Verifying…' : 'Verify Code'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setCode(''); setError(null); }}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handlePasswordSubmit} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <p className="text-sm font-medium text-gray-900">Two-step verification required</p>
      <p className="text-xs text-gray-500">Enter your Telegram 2FA password.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="2FA password"
        required
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? 'Verifying…' : 'Confirm Password'}
        </button>
        <button
          type="button"
          onClick={() => { setStep('code'); setPassword(''); setError(null); }}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Back
        </button>
      </div>
    </form>
  );
}
