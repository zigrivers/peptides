'use client';

import { useState, useActionState } from 'react';
import { markPaymentSentAction } from '../../../_actions';
import type { ActionResult } from '../../../_actions';

interface Props {
  orderId: string;
  hasPriorDiff: boolean;
}

export function MarkPaymentSentButton({ orderId, hasPriorDiff }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const boundAction = markPaymentSentAction.bind(null, orderId);
  const [state, formAction, isPending] = useActionState<ActionResult | null, FormData>(boundAction, null);

  const label = hasPriorDiff
    ? 'I have compared the addresses and verified this is the correct wallet'
    : "I have verified the wallet address and amount from the vendor's current reply";

  return (
    <form action={formAction} className="space-y-4 pt-2">
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary bg-background"
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </label>

    {/* Server-validated acknowledgement — checkbox state mirrored as form field */}
    <input type="hidden" name="acknowledged" value={acknowledged ? 'true' : 'false'} />

    <button
      type="submit"
      disabled={!acknowledged || isPending}
      className="w-full rounded-md bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {isPending ? 'Processing…' : 'Mark Payment Sent'}
      </button>
    </form>
  );
}
