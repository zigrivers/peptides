'use client';

import { useActionState } from 'react';
import type { ActionResult } from '../../../_actions';

interface Props {
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult | null>;
}

export function CaptureVendorReplyForm({ action }: Props) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-1">
          Wallet Address
        </label>
        <input
          id="walletAddress"
          name="walletAddress"
          type="text"
          required
          placeholder="e.g. TQn9Y2khDD2bHM4dK..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
            Amount
          </label>
          <input
            id="amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            placeholder="0.00"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="w-32">
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            defaultValue="USDT"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option>USDT</option>
            <option>BTC</option>
            <option>ETH</option>
            <option>USDC</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
      >
        Review Payment →
      </button>
    </form>
  );
}
