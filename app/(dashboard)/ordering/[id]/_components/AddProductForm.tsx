'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createVendorProductAction } from '@/app/actions/ordering/vendor-product';

interface Props {
  vendorId: string;
  compounds: { id: string; name: string }[];
}

export function AddProductForm({ vendorId, compounds }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const result = await createVendorProductAction({
      vendorId,
      compoundId: data.get('compoundId'),
      name: data.get('name'),
      priceUsd: data.get('priceUsd'),
      inStock: true,
    });

    if (!result.ok) {
      setError(result.message ?? result.error);
      setPending(false);
      return;
    }

    form.reset();
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors"
      >
        + Add Product
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800">New Product</h3>

      <div>
        <label htmlFor="compoundId" className="block text-xs font-medium text-gray-600 mb-1">Compound</label>
        <select
          id="compoundId"
          name="compoundId"
          required
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Select compound…</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. BPC-157 5mg"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="priceUsd" className="block text-xs font-medium text-gray-600 mb-1">Price (USD)</label>
        <input
          id="priceUsd"
          name="priceUsd"
          type="text"
          required
          pattern="\d+(\.\d{1,2})?"
          placeholder="45.00"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
