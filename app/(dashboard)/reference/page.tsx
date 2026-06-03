import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { searchCompounds, listCompounds } from '@/lib/reference/application/CompoundService';
import { CatalogSearch } from './_components/CatalogSearch';
import type { Compound } from '@/lib/reference/domain/types';

function CompoundCard({ compound }: { compound: Compound }) {
  const isArchived = compound.status === 'ARCHIVED';

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${isArchived ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
          {isArchived ? `${compound.name} (archived)` : compound.name}
        </p>
        {compound.profile ? null : (
          <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5 whitespace-nowrap dark:bg-zinc-800 dark:text-gray-300">
            Profile in progress
          </span>
        )}
      </div>
      {compound.mechanismOfAction && (
        <p className={`mt-1 text-sm line-clamp-2 ${isArchived ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {compound.mechanismOfAction}
        </p>
      )}
      {compound.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {compound.tags.map((tag) => (
            <span
              key={tag}
              className={`text-xs rounded-full px-2 py-0.5 ${
                isArchived
                  ? 'bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500'
                  : 'bg-primary/5 text-primary'
              }`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </>
  );

  if (isArchived) {
    return (
      <li>
        <div className="block rounded-lg border border-gray-100 bg-gray-50 p-4 opacity-60 dark:border-zinc-800/80 dark:bg-zinc-900/40">
          {cardContent}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/reference/${compound.slug}`}
        className="block rounded-lg border border-gray-200 p-4 hover:border-primary/40 hover:shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-900/20 dark:hover:border-primary/40"
      >
        {cardContent}
      </Link>
    </li>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse" aria-label="Loading catalog">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="rounded-lg border border-gray-100 p-4 space-y-3 dark:border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-1/3 dark:bg-zinc-800" />
            <div className="h-4 bg-gray-200 rounded w-1/4 dark:bg-zinc-800" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-3/4 dark:bg-zinc-800" />
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded-full w-12 dark:bg-zinc-800" />
            <div className="h-5 bg-gray-200 rounded-full w-16 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function CatalogResults({ query, tag }: { query: string; tag: string }) {
  const compounds =
    query || tag
      ? await searchCompounds(query, tag || undefined)
      : await listCompounds();

  if (compounds.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8 dark:text-gray-400 col-span-2">
        No compounds found. Try adjusting your search.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {compounds.map((c) => (
        <CompoundCard key={c.id} compound={c} />
      ))}
    </ul>
  );
}

export default async function ReferencePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { q = '', tag = '' } = await searchParams;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Compound Catalog</h1>
      <Suspense fallback={null}>
        <CatalogSearch />
      </Suspense>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogResults query={q} tag={tag} />
      </Suspense>
    </main>
  );
}
