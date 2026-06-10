'use client';

import React, { useState } from 'react';
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
          <li key={p.id} className="rounded-lg border border-border bg-card text-card-foreground">
            {editState?.productId === p.id ? (
              <form onSubmit={handleEditSubmit} className="px-4 py-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={editState.name}
                    onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                    className="flex-1 rounded border border-border bg-background text-foreground px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    required
                  />
                  <input
                    value={editState.priceUsd}
                    onChange={(e) => setEditState({ ...editState, priceUsd: e.target.value })}
                    pattern="\d+(\.\d{1,2})?"
                    className="w-24 rounded border border-border bg-background text-foreground px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>
                {editError && <p role="alert" className="text-xs text-red-600">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={editPending}
                    className="rounded bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                  >
                    {editPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditState(null)}
                    className="rounded border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-secondary/80"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className={`text-sm font-medium ${p.inStock ? 'text-foreground' : 'text-muted-foreground'}`}>{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">${p.priceUsd}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 border font-medium ${
                      p.inStock
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30'
                        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/50'
                    }`}
                  >
                    {p.inStock ? 'In stock' : 'Archived'}
                  </span>
                  {p.inStock && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="min-h-9 inline-flex items-center rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary/80"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(p.id)}
                        disabled={archivingId === p.id}
                        className="min-h-9 inline-flex items-center rounded-md px-2 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive/80 disabled:opacity-50"
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
