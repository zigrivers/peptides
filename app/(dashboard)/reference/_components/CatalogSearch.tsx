'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { CATALOG_TAGS } from '@/lib/reference/domain/tags';
import { ChevronDown } from 'lucide-react';

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
        router.replace(`/reference?${params.toString()}`, { scroll: false });
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row">
      <input
        type="search"
        placeholder="Search compounds…"
        defaultValue={searchParams.get('q') ?? ''}
        onChange={handleChange}
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        aria-label="Search compounds"
      />
      <div className="relative w-full sm:min-w-[160px] sm:w-auto">
        <select
          defaultValue={searchParams.get('tag') ?? ''}
          onChange={handleTagChange}
          className="w-full appearance-none rounded-md border border-input bg-background pl-3 pr-10 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by category"
        >
          <option value="" className="bg-background text-foreground">All categories</option>
          {CATALOG_TAGS.map(({ value, label }) => (
            <option key={value} value={value} className="bg-background text-foreground">{label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
