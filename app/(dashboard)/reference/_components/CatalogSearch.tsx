'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function CatalogSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = e.target.value.trim();
      if (q) {
        params.set('q', q);
      } else {
        params.delete('q');
      }
      router.push(`/reference?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleTagChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      const tag = e.target.value;
      if (tag) {
        params.set('tag', tag);
      } else {
        params.delete('tag');
      }
      router.push(`/reference?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex gap-3 mb-6">
      <input
        type="search"
        placeholder="Search compounds…"
        defaultValue={searchParams.get('q') ?? ''}
        onChange={handleChange}
        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="Search compounds"
      />
      <select
        defaultValue={searchParams.get('tag') ?? ''}
        onChange={handleTagChange}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="Filter by category"
      >
        <option value="">All categories</option>
        <option value="healing">Healing</option>
        <option value="recovery">Recovery</option>
        <option value="weight-loss">Weight Loss</option>
        <option value="longevity">Longevity</option>
        <option value="cognitive">Cognitive</option>
        <option value="skin">Skin</option>
      </select>
    </div>
  );
}
