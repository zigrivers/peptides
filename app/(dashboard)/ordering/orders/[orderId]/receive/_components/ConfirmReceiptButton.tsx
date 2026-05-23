'use client';

import { useFormStatus } from 'react-dom';

export function ConfirmReceiptButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-green-600 text-white px-4 py-3 text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {pending ? 'Processing…' : 'Confirm Receipt & Add to Inventory'}
    </button>
  );
}
