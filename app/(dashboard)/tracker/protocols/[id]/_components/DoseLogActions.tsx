'use client';

import { useState, useTransition } from 'react';
import type { DoseAmount, InjectionSite, SafetyWarning } from '@/lib/tracker/domain/types';
import { sitesEqual } from '@/lib/tracker/domain/SiteRotation';
import type { SiteWithMeta } from '@/lib/tracker/domain/SiteRotation';
import { logDoseAction } from '@/app/actions/tracker/log-dose';

type SiteData = {
  suggestion: InjectionSite | null;
  validSites: InjectionSite[];
  siteMeta: SiteWithMeta[];
  recentSites: InjectionSite[];
};

type Props = {
  protocolId: string;
  amount: DoseAmount;
  existingStatus?: 'LOGGED' | 'SKIPPED';
  existingInjectionSite?: InjectionSite | null;
  siteData?: SiteData;
};

function formatSiteLabel(site: InjectionSite): string {
  const side = site.side.charAt(0).toUpperCase() + site.side.slice(1);
  const part = site.bodyPart.charAt(0).toUpperCase() + site.bodyPart.slice(1);
  return `${side} ${part}`;
}

function SitePicker({
  siteData,
  selectedSite,
  onSelect,
}: {
  siteData: SiteData;
  selectedSite: InjectionSite | null;
  onSelect: (site: InjectionSite) => void;
}) {
  if (siteData.validSites.length === 0) return null;

  const recentHistory = siteData.recentSites.slice(0, 7);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Injection site <span className="text-destructive">*</span>
        {siteData.suggestion && (
          <span className="ml-1 text-primary">(suggested: {formatSiteLabel(siteData.suggestion)})</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {siteData.validSites.map((site) => {
          const meta = siteData.siteMeta.find((m) => sitesEqual(m.site, site));
          const isSelected = selectedSite !== null && sitesEqual(selectedSite, site);
          const isSuggested = siteData.suggestion !== null && sitesEqual(siteData.suggestion, site);

          let daysLabel = 'Never';
          if (meta?.daysSinceLastUse === 0) daysLabel = 'Today';
          else if (meta?.daysSinceLastUse === 1) daysLabel = '1 day ago';
          else if (meta?.daysSinceLastUse != null) daysLabel = `${meta.daysSinceLastUse} days ago`;

          return (
            <button
              key={`${site.bodyPart}-${site.side}`}
              type="button"
              onClick={() => onSelect(site)}
              aria-pressed={isSelected}
              className={`flex flex-col items-start px-2 py-1.5 rounded border text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none ${
                isSelected
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <span className="font-medium">
                {formatSiteLabel(site)}
                {isSuggested && !isSelected && (
                  <span className="ml-1 text-primary">★</span>
                )}
              </span>
              <span className="text-muted-foreground mt-0.5">{daysLabel}</span>
              {meta?.isRested ? (
                <span className="mt-0.5 rounded-full bg-success/15 text-success px-1 py-0.5 text-[10px] font-medium">
                  Rested
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {recentHistory.length > 0 && (
        <p className="text-[10px] text-gray-400">
          Recent: {recentHistory.map(formatSiteLabel).join(' → ')}
        </p>
      )}
    </div>
  );
}

export function DoseLogActions({ protocolId, amount, existingStatus, existingInjectionSite, siteData }: Props) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'LOGGED' | 'SKIPPED' | null>(existingStatus ?? null);
  // For existing LOGGED entries, initialize to the recorded site; fall back to suggestion for new logs.
  const [selectedSite, setSelectedSite] = useState<InjectionSite | null>(
    existingInjectionSite ?? siteData?.suggestion ?? null
  );
  const [warnings, setWarnings] = useState<SafetyWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showChangeOptions, setShowChangeOptions] = useState(false);

  const requiresSite = (siteData?.validSites.length ?? 0) > 0;
  const siteRequired = requiresSite && selectedSite === null;

  function handleLog(logStatus: 'LOGGED' | 'SKIPPED') {
    setError(null);
    if (logStatus === 'LOGGED' && siteRequired) {
      setError('Please select an injection site.');
      return;
    }
    startTransition(async () => {
      const result = await logDoseAction({
        protocolId,
        amount,
        status: logStatus,
        injectionSite: logStatus === 'LOGGED' ? (selectedSite ?? undefined) : undefined,
      });
      if (result.ok) {
        setStatus(result.doseLog.status as 'LOGGED' | 'SKIPPED');
        setWarnings(result.warnings);
        setShowChangeOptions(false);
      } else {
        setError(result.message);
      }
    });
  }

  if (status && !showChangeOptions) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${status === 'LOGGED' ? 'text-success' : 'text-muted-foreground'}`}>
            {status === 'LOGGED' ? 'Dose logged ✓' : 'Skipped'}
          </span>
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
          className="rounded-md bg-success text-success-foreground px-4 py-2 text-sm font-semibold hover:bg-success/90 disabled:opacity-60 transition-colors"
          title={siteRequired ? 'Select an injection site first' : undefined}
        >
          Log Dose
        </button>
        <button
          disabled={isPending}
          onClick={() => handleLog('SKIPPED')}
          className="rounded-md border border-border bg-card text-foreground px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60 transition-colors"
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
