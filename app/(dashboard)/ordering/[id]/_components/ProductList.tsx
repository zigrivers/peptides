'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveVendorProductAction,
  updateVendorProductAction,
} from '@/app/actions/ordering/vendor-product';
import type { VendorProduct } from '@/lib/ordering/domain/types';

interface Props {
  products: VendorProduct[];
  vendorId: string;
}

interface EditState {
  productId: string;
  name: string;
  priceUsd: string;
}

export function ProductList({ products, vendorId }: Props) {
  const router = useRouter();
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  if (products.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">
        No products yet. Add your first product above.
      </p>
    );
  }

  async function handleArchive(productId: string) {
    setArchivingId(productId);
    setArchiveError(null);
    const result = await archiveVendorProductAction(productId, vendorId);
    if (!result.ok) {
      setArchiveError(result.error);
      setArchivingId(null);
      return;
    }
    router.refresh();
    setArchivingId(null);
  }

  function startEdit(p: VendorProduct) {
    setEditState({ productId: p.id, name: p.name, priceUsd: p.priceUsd });
    setEditError(null);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editState) return;
    setEditPending(true);
    setEditError(null);

    const result = await updateVendorProductAction(editState.productId, vendorId, {
      name: editState.name,
      priceUsd: editState.priceUsd,
    });

    if (!result.ok) {
      setEditError(result.message ?? result.error);
      setEditPending(false);
      return;
    }

    setEditState(null);
    setEditPending(false);
    router.refresh();
  }

  return (
    <>
      {archiveError && (
        <p role="alert" className="text-xs text-red-600 mb-2">{archiveError}</p>
      )}
      <ul className="space-y-2">
        {products.map((p) => (
          <li key={p.id} className="rounded-lg border border-gray-200 bg-white">
            {editState?.productId === p.id ? (
              <form onSubmit={handleEditSubmit} className="px-4 py-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={editState.name}
                    onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                    required
                  />
                  <input
                    value={editState.priceUsd}
                    onChange={(e) => setEditState({ ...editState, priceUsd: e.target.value })}
                    pattern="\d+(\.\d{1,2})?"
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>
                {editError && <p role="alert" className="text-xs text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={editPending}
                    className="rounded bg-indigo-600 text-white px-3 py-1 text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {editPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditState(null)}
                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className={`text-sm font-medium ${p.inStock ? 'text-gray-900' : 'text-gray-400'}`}>{p.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">${p.priceUsd}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      p.inStock ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.inStock ? 'In stock' : 'Archived'}
                  </span>
                  {p.inStock && (
                    <>
                      <button
                        onClick={() => startEdit(p)}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchive(p.id)}
                        disabled={archivingId === p.id}
                        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {archivingId === p.id ? 'Archiving…' : 'Archive'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
