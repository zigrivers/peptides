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
        <p className={`font-medium ${isArchived ? 'text-gray-400' : 'text-gray-900'}`}>
          {isArchived ? `${compound.name} (archived)` : compound.name}
        </p>
        {compound.profile ? null : (
          <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5 whitespace-nowrap">
            Profile in progress
          </span>
        )}
      </div>
      {compound.mechanismOfAction && (
        <p className={`mt-1 text-sm line-clamp-2 ${isArchived ? 'text-gray-400' : 'text-gray-500'}`}>
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
                  ? 'bg-gray-100 text-gray-400'
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
        <div className="block rounded-lg border border-gray-100 bg-gray-50 p-4 opacity-60">
          {cardContent}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/reference/${compound.slug}`}
        className="block rounded-lg border border-gray-200 p-4 hover:border-primary/40 hover:shadow-sm transition-all"
      >
        {cardContent}
      </Link>
    </li>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-label="Loading catalog">
      {[1, 2, 3].map((n) => (
        <div key={n} className="rounded-lg border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-1/4" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded-full w-12" />
            <div className="h-5 bg-gray-200 rounded-full w-16" />
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
      <p className="text-sm text-gray-500 text-center py-8">
        No compounds found. Try adjusting your search.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
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
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Compound Catalog</h1>
      <Suspense fallback={null}>
        <CatalogSearch />
      </Suspense>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogResults query={q} tag={tag} />
      </Suspense>
    </main>
  );
}
