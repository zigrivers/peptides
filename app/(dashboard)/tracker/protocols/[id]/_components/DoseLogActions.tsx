'use client';

import React, { useState, useTransition } from 'react';
import type { DoseAmount, InjectionSite, SafetyWarning } from '@/lib/tracker/domain/types';
import { sitesEqualLegacy } from '@/lib/tracker/domain/SiteRotation';
import { logDoseAction } from '@/app/actions/tracker/log-dose';

import { SitePicker } from '../../../_components/SitePicker';
import type { SiteData } from '../../../_components/SitePicker';

type Props = {
  protocolId: string;
  amount: DoseAmount;
  existingStatus?: 'LOGGED' | 'SKIPPED';
  existingInjectionSite?: InjectionSite | null;
  siteData?: SiteData;
};

export function DoseLogActions({ protocolId, amount, existingStatus, existingInjectionSite, siteData }: Props) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'LOGGED' | 'SKIPPED' | null>(existingStatus ?? null);
  const [optimisticStatus, setOptimisticStatus] = React.useOptimistic(
    status,
    (_, newStatus: 'LOGGED' | 'SKIPPED' | null) => newStatus
  );
  const [selectedSite, setSelectedSite] = useState<InjectionSite | null>(() => {
    const site = existingInjectionSite ?? siteData?.suggestion ?? null;
    if (site && site.bodyPart === 'abdomen') {
      return { ...site, bodyPart: 'abdomen-lower' };
    }
    return site;
  });
  const [warnings, setWarnings] = useState<SafetyWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showChangeOptions, setShowChangeOptions] = useState(false);
  const [isOfflinePending, setIsOfflinePending] = useState(false);

  const requiresSite = (siteData?.validSites.length ?? 0) > 0;
  const siteRequired = requiresSite && selectedSite === null;
  const lastUsedSite = siteData?.recentSites?.[0] ?? null;
  const isConflict = selectedSite !== null && lastUsedSite !== null && sitesEqualLegacy(selectedSite, lastUsedSite);

  function handleLog(logStatus: 'LOGGED' | 'SKIPPED') {
    setError(null);
    if (logStatus === 'LOGGED' && siteRequired) {
      setError('Please select an injection site.');
      return;
    }

    const isCurrentlyOffline = typeof window !== 'undefined' && !navigator.onLine;

    const performOfflineEnqueue = async () => {
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const dateStr = new Date().toISOString().split('T')[0];
        const res = await q.enqueue({
          protocolId,
          scheduledDate: dateStr,
          deviceId: 'web-client',
          amount,
          status: logStatus,
          injectionSite: logStatus === 'LOGGED' ? (selectedSite ?? undefined) : undefined,
        });
        if (res.ok) {
          setStatus(logStatus);
          setIsOfflinePending(true);
          setShowChangeOptions(false);
          window.dispatchEvent(new Event('offline-sync-queue-updated'));
        } else {
          setError(res.error || 'Failed to queue dose offline.');
        }
      } catch (e) {
        console.error('[offlineEnqueue] error:', e);
        setError('Failed to queue dose offline.');
      }
    };

    if (isCurrentlyOffline) {
      startTransition(async () => {
        setOptimisticStatus(logStatus);
        await performOfflineEnqueue();
      });
      return;
    }

    startTransition(async () => {
      // Instantly set the optimistic state (MMR F-002)
      setOptimisticStatus(logStatus);
      try {
        const result = await logDoseAction({
          protocolId,
          amount,
          status: logStatus,
          injectionSite: logStatus === 'LOGGED' ? (selectedSite ?? undefined) : undefined,
        });
        if (result.ok) {
          setStatus(result.doseLog.status as 'LOGGED' | 'SKIPPED');
          setWarnings(result.warnings);
          setIsOfflinePending(false);
          setShowChangeOptions(false);
        } else {
          setError(result.message);
          // Rollback occurs automatically since state is not updated
        }
      } catch (err) {
        console.error('[handleLog] server action error:', err);
        const isNetworkErr = err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));
        if (isNetworkErr) {
          await performOfflineEnqueue();
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      }
    });
  }

  if (optimisticStatus && !showChangeOptions) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${optimisticStatus === 'LOGGED' ? 'text-success' : 'text-muted-foreground'}`}>
            {optimisticStatus === 'LOGGED' ? 'Dose logged ✓' : 'Skipped'}
          </span>
          {isOfflinePending && (
            <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400 px-2 py-0.5 rounded-full font-semibold">
              Pending Sync
            </span>
          )}
          <button
            onClick={() => setShowChangeOptions(true)}
            className="text-xs text-primary hover:underline"
          >
            Change
          </button>
        </div>
        {warnings.map((w) => (
          <p key={w.code} className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-2 py-1">
            {w.message}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}
      {isConflict && (
        <div role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2 animate-[fadeIn_0.2s_ease-out]">
          <span className="mt-0.5 shrink-0 font-bold">&#9888;</span>
          <span>
            <strong>Rotation Alert:</strong> This site was used for your last dose. We highly recommend rotating to a rested site (marked in green/teal) to prevent scar tissue build-up or lipodystrophy.
          </span>
        </div>
      )}
      {siteData && (
        <SitePicker
          siteData={siteData}
          selectedSite={selectedSite}
          onSelect={setSelectedSite}
        />
      )}
      <div className="flex gap-2">
        <button
          disabled={isPending || (siteRequired)}
          onClick={() => handleLog('LOGGED')}
          className="rounded-md bg-success text-success-foreground px-4 py-2 text-sm font-semibold hover:bg-success/90 disabled:opacity-60 transition-colors btn-tactile"
          title={siteRequired ? 'Select an injection site first' : undefined}
        >
          Log Dose
        </button>
        <button
          disabled={isPending}
          onClick={() => handleLog('SKIPPED')}
          className="rounded-md border border-border bg-card text-foreground px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60 transition-colors btn-tactile"
        >
          Skip
        </button>
        {showChangeOptions && (
          <button
            onClick={() => setShowChangeOptions(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
      {warnings.map((w) => (
        <p key={w.code} className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-2 py-1">
          {w.message}
        </p>
      ))}
    </div>
  );
}
