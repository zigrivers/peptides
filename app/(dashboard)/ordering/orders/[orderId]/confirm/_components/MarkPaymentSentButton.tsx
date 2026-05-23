'use client';

import { useState, useTransition } from 'react';
import { markPaymentSentAction } from '../../../_actions';

interface Props {
  orderId: string;
  hasPriorDiff: boolean;
}

export function MarkPaymentSentButton({ orderId, hasPriorDiff }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = hasPriorDiff
    ? 'I have compared the addresses and verified this is the correct wallet'
    : "I have verified the wallet address and amount from the vendor's current reply";

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await markPaymentSentAction(orderId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4 pt-2">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-700">{label}</span>
      </label>

      <button
        type="button"
        disabled={!acknowledged || isPending}
        onClick={handleSubmit}
        className="w-full rounded-md bg-indigo-600 text-white px-4 py-3 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? 'Processing…' : 'Mark Payment Sent'}
      </button>
    </div>
  );
}
