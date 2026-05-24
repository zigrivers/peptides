'use client';

import React, { useEffect, useState, useRef } from 'react';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'synced';

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastChecked, setLastChecked] = useState(Date.now());

  const isMountedRef = useRef(true);

  // Component level mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Online/Offline listener - uses functional state update to prevent stale closures (F-003)
  useEffect(() => {
    function updateOnlineStatus() {
      if (!navigator.onLine) {
        setStatus('offline');
      } else {
        setStatus((current) => (current === 'offline' ? 'idle' : current));
      }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initialize state on mount (F-004)
    updateOnlineStatus();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Periodic queue checker - updates lastChecked to allow sync retries on interval (F-002)
  useEffect(() => {
    let cancelled = false;

    async function checkPending() {
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const pending = await q.getPending();
        if (!cancelled) {
          setPendingCount(pending.length);
          setLastChecked(Date.now());
        }
      } catch {
        // IndexedDB not available (SSR or private browsing)
      }
    }

    checkPending();
    const interval = setInterval(checkPending, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Sync replayer - uses isMountedRef (F-005) to prevent cancelling slow requests on interval rechecks
  useEffect(() => {
    async function triggerForegroundSync() {
      if (!navigator.onLine || pendingCount === 0) return;
      if (status === 'syncing') return;

      setStatus('syncing');
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const pending = await q.getPending();

        if (!isMountedRef.current) return;

        if (!pending.length) {
          setStatus('idle');
          return;
        }

        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries: pending }),
        });

        if (!res.ok) throw new Error('sync failed');
        const { results } = (await res.json()) as {
          results: { id: string; ok: boolean }[];
        };

        if (!isMountedRef.current) return;

        await Promise.all(results.filter((r) => r.ok).map((r) => q.markSynced(r.id)));
        const remaining = await q.getPending();

        if (!isMountedRef.current) return;

        setPendingCount(remaining.length);
        if (remaining.length > 0) {
          setStatus('error');
        } else {
          setStatus('synced');
        }
      } catch {
        if (isMountedRef.current) setStatus('error');
      }
    }

    triggerForegroundSync();
  }, [pendingCount, lastChecked]);

  // Separate effect for synced-to-idle timer with proper cleanup (F-001 / F-006)
  useEffect(() => {
    if (status !== 'synced') return;

    const timer = setTimeout(() => {
      setStatus('idle');
    }, 3000);

    return () => clearTimeout(timer);
  }, [status]);

  const isVisible = status !== 'idle' || pendingCount > 0;

  if (!isVisible) return null;

  let label = '';
  let icon = null;
  let statusClasses = '';

  switch (status) {
    case 'offline':
      label = pendingCount > 0 ? `${pendingCount} pending (offline)` : 'Offline';
      icon = (
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
          />
        </svg>
      );
      statusClasses = 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400';
      break;

    case 'syncing':
      label = 'Syncing…';
      icon = (
        <svg
          className="w-3.5 h-3.5 shrink-0 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
      );
      statusClasses = 'bg-primary/10 border-primary/20 text-primary';
      break;

    case 'error':
      label = `${pendingCount} pending (sync failed)`;
      icon = (
        <svg
          className="w-3.5 h-3.5 shrink-0 animate-pulse"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      );
      statusClasses = 'bg-destructive/10 border-destructive/20 text-destructive';
      break;

    case 'synced':
      label = 'Synced';
      icon = (
        <svg
          className="w-3.5 h-3.5 shrink-0 scale-110"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      );
      statusClasses = 'bg-success/10 border-success/20 text-success';
      break;

    default:
      label = `${pendingCount} pending`;
      icon = (
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5h10.5a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0017.25 4.5H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      );
      statusClasses = 'bg-white/70 dark:bg-slate-900/70 border-border text-foreground';
  }

  return (
    <div
      role="status"
      aria-label={`PWA Sync: ${label}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 lg:px-3 text-xs font-semibold rounded-full border shadow-lg backdrop-blur-md transition-all duration-300 scale-100 opacity-100 ${statusClasses}`}
    >
      {icon}
      <span className="sm:hidden lg:inline inline">{label}</span>
    </div>
  );
}
