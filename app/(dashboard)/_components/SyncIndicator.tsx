'use client';

import { useEffect, useState } from 'react';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    function updateOnlineStatus() {
      if (!navigator.onLine) setStatus('offline');
      else if (status === 'offline') setStatus('idle');
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if (!navigator.onLine) setStatus('offline');

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [status]);

  useEffect(() => {
    let cancelled = false;

    async function checkPending() {
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const pending = await q.getPending();
        if (!cancelled) setPendingCount(pending.length);
      } catch {
        // IndexedDB not available (SSR or private browsing)
      }
    }

    checkPending();
    const interval = setInterval(checkPending, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    async function triggerForegroundSync() {
      if (!navigator.onLine || pendingCount === 0) return;
      setStatus('syncing');
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const pending = await q.getPending();
        if (!pending.length) { setStatus('idle'); return; }

        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: pending }),
        });

        if (!res.ok) throw new Error('sync failed');
        const { results } = await res.json() as { results: { id: string; ok: boolean }[] };

        await Promise.all(results.filter((r) => r.ok).map((r) => q.markSynced(r.id)));
        const remaining = await q.getPending();
        setPendingCount(remaining.length);
        setStatus(remaining.length > 0 ? 'error' : 'idle');
      } catch {
        setStatus('error');
      }
    }

    triggerForegroundSync();
  }, [pendingCount]);

  if (status === 'idle' && pendingCount === 0) return null;

  const label =
    status === 'offline' ? 'Offline'
    : status === 'syncing' ? 'Syncing…'
    : status === 'error' ? `${pendingCount} pending (sync failed)`
    : `${pendingCount} pending`;

  const colorClass =
    status === 'offline' ? 'bg-gray-400'
    : status === 'syncing' ? 'bg-amber-400 animate-pulse'
    : status === 'error' ? 'bg-red-500'
    : 'bg-amber-400';

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`inline-block h-2 w-2 rounded-full ${colorClass}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
