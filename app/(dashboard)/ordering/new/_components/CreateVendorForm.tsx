'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createVendorAction } from '@/app/actions/ordering/vendor';
import { VENDOR_CURRENCIES } from '@/lib/ordering/domain/types';

export function CreateVendorForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const result = await createVendorAction({
      name: data.get('name'),
      telegramUsername: data.get('telegramUsername'),
      preferredCurrency: data.get('preferredCurrency'),
      messageTemplate: data.get('messageTemplate') || undefined,
    });

    if (!result.ok) {
      setError(result.message ?? result.error);
      setPending(false);
      return;
    }

    router.push(`/ordering/${result.data.vendorId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Vendor Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. QSC"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="telegramUsername" className="block text-sm font-medium text-gray-700 mb-1">
          Telegram Username
        </label>
        <input
          id="telegramUsername"
          name="telegramUsername"
          type="text"
          required
          placeholder="e.g. qsc_vendor"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="preferredCurrency" className="block text-sm font-medium text-gray-700 mb-1">
          Preferred Currency
        </label>
        <select
          id="preferredCurrency"
          name="preferredCurrency"
          defaultValue="USDT"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          {VENDOR_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="messageTemplate" className="block text-sm font-medium text-gray-700 mb-1">
          Message Template <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="messageTemplate"
          name="messageTemplate"
          rows={4}
          placeholder="Hi, I'd like to order: {lineItems}"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <p className="text-xs text-gray-400 mt-1">Use <code>{'{lineItems}'}</code> as a placeholder for the order details.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Saving…' : 'Add Vendor'}
      </button>
    </form>
  );
}
