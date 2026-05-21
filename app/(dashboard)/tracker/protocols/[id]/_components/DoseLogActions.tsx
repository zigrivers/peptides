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
};

type Props = {
  protocolId: string;
  amount: DoseAmount;
  existingStatus?: 'LOGGED' | 'SKIPPED';
  existingInjectionSite?: InjectionSite | null;
  siteData?: SiteData;
};

// Compute today's UTC date at call time so it stays fresh even if the tab is left open past midnight.
function todayUTCISO(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600">
        Injection site
        {siteData.suggestion && (
          <span className="ml-1 text-indigo-600">(suggested: {formatSiteLabel(siteData.suggestion)})</span>
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
              className={`flex flex-col items-start px-2 py-1.5 rounded border text-left text-xs transition-colors ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="font-medium">
                {formatSiteLabel(site)}
                {isSuggested && !isSelected && (
                  <span className="ml-1 text-indigo-500">★</span>
                )}
              </span>
              <span className="text-gray-400 mt-0.5">{daysLabel}</span>
              {meta?.isRested ? (
                <span className="mt-0.5 rounded-full bg-green-100 text-green-700 px-1 py-0.5 text-[10px] font-medium">
                  Rested
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
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

  function handleLog(logStatus: 'LOGGED' | 'SKIPPED') {
    setError(null);
    const scheduledDate = todayUTCISO();
    startTransition(async () => {
      const result = await logDoseAction({
        protocolId,
        scheduledDate,
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
          <span className={`text-sm font-medium ${status === 'LOGGED' ? 'text-green-700' : 'text-gray-500'}`}>
            {status === 'LOGGED' ? 'Dose logged ✓' : 'Skipped'}
          </span>
          <button
            onClick={() => setShowChangeOptions(true)}
            className="text-xs text-indigo-600 hover:underline"
          >
            Change
          </button>
        </div>
        {warnings.map((w) => (
          <p key={w.code} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
            {w.message}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-700">{error}</p>
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
          disabled={isPending}
          onClick={() => handleLog('LOGGED')}
          className="rounded-md bg-green-600 text-white px-4 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
        >
          Log Dose
        </button>
        <button
          disabled={isPending}
          onClick={() => handleLog('SKIPPED')}
          className="rounded-md border border-gray-300 text-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          Skip
        </button>
        {showChangeOptions && (
          <button
            onClick={() => setShowChangeOptions(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        )}
      </div>
      {warnings.map((w) => (
        <p key={w.code} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          {w.message}
        </p>
      ))}
    </div>
  );
}
