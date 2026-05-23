'use client';

import { useTransition } from 'react';
import { cancelOrderAction } from '../_actions';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (!confirm('Cancel this order? This cannot be undone.')) return;
        startTransition(() => cancelOrderAction(orderId));
      }}
      className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
    >
      {isPending ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}
