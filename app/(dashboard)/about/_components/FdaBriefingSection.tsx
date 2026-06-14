'use client';

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { refreshFdaBriefingAction } from '@/app/actions/about/refresh-fda-briefing';
import type { FdaBriefingResult } from '@/lib/research/domain/types';

interface Props {
  initial: (FdaBriefingResult & { updatedAt: string }) | null;
  canRefresh: boolean;
}

export function FdaBriefingSection({ initial, canRefresh }: Props) {
  const [briefing, setBriefing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRefresh() {
    setBusy(true); setError(null);
    try {
      const res = await refreshFdaBriefingAction();
      if (res.ok) setBriefing({ ...res.briefing, updatedAt: res.updatedAt });
      else setError(res.error === 'unavailable' ? 'Local model unavailable.' : 'Refresh failed.');
    } catch {
      setError('Refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">FDA &amp; peptides: latest</h2>
        {canRefresh && (
          <button type="button" onClick={onRefresh} disabled={busy} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary disabled:opacity-50 inline-flex items-center gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!briefing ? (
        <p className="text-sm text-muted-foreground">No briefing yet{canRefresh ? ' — click Refresh to generate one.' : '.'}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Updated {new Date(briefing.updatedAt).toLocaleDateString()}</p>
          <p className="text-sm text-gray-700 dark:text-gray-200">{briefing.summary}</p>
          <ul className="space-y-2">
            {briefing.findings.map((f, i) => (
              <li key={i} className="text-sm">
                {f.point}
                <span className="mt-1 flex flex-wrap gap-2">
                  {f.sourceUrls.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">source <Link2 className="h-3 w-3" /></a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {briefing.sourcesUsed.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Sources</h3>
              <ul className="mt-1 flex flex-wrap gap-2">
                {briefing.sourcesUsed.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">{s.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Unverified — not medical advice.</p>
        </div>
      )}
    </section>
  );
}
