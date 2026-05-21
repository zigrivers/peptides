'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { archiveVendorProductAction } from '@/app/actions/ordering/vendor-product';
import type { VendorProduct } from '@/lib/ordering/domain/types';

interface Props {
  products: VendorProduct[];
  vendorId: string;
}

export function ProductList({ products, vendorId }: Props) {
  const router = useRouter();
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

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

  return (
    <>
      {archiveError && (
        <p role="alert" className="text-xs text-red-600 mb-2">{archiveError}</p>
      )}
      <ul className="space-y-2">
      {products.map((p) => (
        <li key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-900">{p.name}</p>
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
              <button
                onClick={() => handleArchive(p.id)}
                disabled={archivingId === p.id}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {archivingId === p.id ? 'Archiving…' : 'Archive'}
              </button>
            )}
          </div>
        </li>
      ))}
      </ul>
    </>
  );
}
