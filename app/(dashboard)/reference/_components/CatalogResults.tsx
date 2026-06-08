import React from 'react';
import Link from 'next/link';
import { getCompoundCommonName } from '@/lib/reference/domain/commonName';
import { getCompoundWhyStatement } from '@/lib/reference/domain/whyStatements';
import { searchCompounds, listCompounds } from '@/lib/reference/application/CompoundService';
import type { Compound } from '@/lib/reference/domain/types';

function CompoundCard({ compound }: { compound: Compound }) {
  const isArchived = compound.status === 'ARCHIVED';
  const commonName = getCompoundCommonName(compound.name);
  const why = getCompoundWhyStatement(compound.name) || compound.mechanismOfAction || 'A specialized compound researched for its unique properties in cellular recovery, metabolic optimization, or functional enhancement.';

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`font-semibold tracking-tight ${isArchived ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
            {isArchived ? `${compound.name} (archived)` : compound.name}
          </p>
          {commonName && !isArchived && (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20 mt-1">
              {commonName}
            </span>
          )}
        </div>
        {compound.profile || compound.supplementProfile ? null : (
          <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-0.5 whitespace-nowrap dark:bg-zinc-800 dark:text-gray-300">
            Profile in progress
          </span>
        )}
      </div>
      {why && (
        <p className={`mt-1.5 text-xs leading-relaxed line-clamp-2 ${isArchived ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {why}
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

export async function CatalogResults({ query, tag }: { query: string; tag: string }) {
  const compounds =
    query || tag
      ? await searchCompounds(query, tag || undefined)
      : await listCompounds();

  if (compounds.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8 dark:text-gray-400">
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
