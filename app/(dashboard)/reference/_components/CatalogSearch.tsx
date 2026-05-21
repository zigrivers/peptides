'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { CATALOG_TAGS } from '@/lib/reference/domain/tags';

const DEBOUNCE_MS = 350;

export function CatalogSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
        {CATALOG_TAGS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  );
}
