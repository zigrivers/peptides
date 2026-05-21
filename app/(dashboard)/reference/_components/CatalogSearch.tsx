'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 350;

export function CatalogSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value.trim()) {
          params.set('q', value.trim());
        } else {
          params.delete('q');
        }
        router.push(`/reference?${params.toString()}`);
      }, DEBOUNCE_MS);
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
        <option value="metabolic">Metabolic</option>
      </select>
    </div>
  );
}
