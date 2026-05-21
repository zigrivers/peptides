import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { searchCompounds, listCompounds } from '@/lib/reference/application/CompoundService';
import { CatalogSearch } from './_components/CatalogSearch';
import type { Compound } from '@/lib/reference/domain/types';

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function CompoundCard({ compound }: { compound: Compound }) {
  const slug = nameToSlug(compound.name);
  const isArchived = compound.status === 'ARCHIVED';

  return (
    <li>
      <Link
        href={`/reference/${slug}`}
        className="block rounded-lg border border-gray-200 p-4 hover:border-indigo-400 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900">
            {isArchived ? `${compound.name} (archived)` : compound.name}
          </p>
          {compound.profile ? null : (
            <span className="text-xs text-gray-400 bg-gray-100 rounded px-2 py-0.5 whitespace-nowrap">
              Profile in progress
            </span>
          )}
        </div>
        {compound.mechanismOfAction && (
          <p className="mt-1 text-sm text-gray-500 line-clamp-2">
            {compound.mechanismOfAction}
          </p>
        )}
        {compound.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {compound.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </Link>
    </li>
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
      <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
        <CatalogResults query={q} tag={tag} />
      </Suspense>
    </main>
  );
}
