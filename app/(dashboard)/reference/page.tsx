import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { CatalogSearch } from './_components/CatalogSearch';
import { CatalogResults } from './_components/CatalogResults';

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
