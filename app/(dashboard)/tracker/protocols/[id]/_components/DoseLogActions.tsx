'use client';

import React, { useState, useTransition } from 'react';
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

/**
 * SVG coordinates are mapped relative to the 200x280 viewBox scale defined in the SitePicker SVG container.
 * Unknown sites return off-screen coordinates to prevent center overlays.
 */
function getSiteCoordinates(bodyPart: string, side: 'left' | 'right'): { cx: number; cy: number } {
  switch (bodyPart) {
    case 'deltoid':
      return side === 'left' ? { cx: 142, cy: 78 } : { cx: 58, cy: 78 };
    case 'abdomen':
      return side === 'left' ? { cx: 120, cy: 135 } : { cx: 80, cy: 135 };
    case 'ventrogluteal':
      return side === 'left' ? { cx: 130, cy: 175 } : { cx: 70, cy: 175 };
    case 'thigh':
      return side === 'left' ? { cx: 115, cy: 225 } : { cx: 85, cy: 225 };
    default:
      return { cx: -100, cy: -100 };
  }
}

const ALL_POSSIBLE_SITES: InjectionSite[] = [
  { bodyPart: 'deltoid', side: 'right' },
  { bodyPart: 'deltoid', side: 'left' },
  { bodyPart: 'abdomen', side: 'right' },
  { bodyPart: 'abdomen', side: 'left' },
  { bodyPart: 'ventrogluteal', side: 'right' },
  { bodyPart: 'ventrogluteal', side: 'left' },
  { bodyPart: 'thigh', side: 'right' },
  { bodyPart: 'thigh', side: 'left' },
];

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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        {/* Visual Body Map Card */}
        <div className="w-48 sm:w-56 h-[290px] sm:h-[340px] shrink-0 border border-border bg-card rounded-lg p-3 flex flex-col items-center select-none shadow-sm">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 tracking-wider">VISUAL MAP</p>
          <svg
            viewBox="0 0 200 280"
            className="w-full h-full"
            role="group"
            aria-label="Injection site body map"
          >
            {/* Mirror Guide Labels */}
            <text x="50" y="15" className="text-[9px] font-bold fill-muted-foreground/60" textAnchor="middle">R (Right)</text>
            <text x="150" y="15" className="text-[9px] font-bold fill-muted-foreground/60" textAnchor="middle">L (Left)</text>

            {/* Head */}
            <circle cx="100" cy="40" r="14" className="fill-muted/10 stroke-border" strokeWidth="1.5" />
            
            {/* Torso/Body outline path */}
            <path
              d="M 68,70 C 68,60 132,60 132,70 L 135,115 C 135,120 131,160 131,195 L 122,275 L 105,275 L 100,205 L 95,275 L 78,275 L 69,195 C 69,160 65,120 65,115 Z"
              className="fill-muted/5 stroke-border"
              strokeWidth="1.5"
            />
            {/* Center line */}
            <line x1="100" y1="70" x2="100" y2="205" className="stroke-border/40" strokeDasharray="3 3" />

            {/* Hotspots */}
            {ALL_POSSIBLE_SITES.map((site) => {
              const { cx, cy } = getSiteCoordinates(site.bodyPart, site.side);
              const isValid = siteData.validSites.some((v) => sitesEqual(v, site));
              const isSelected = selectedSite !== null && sitesEqual(selectedSite, site);
              const isSuggested = siteData.suggestion !== null && sitesEqual(siteData.suggestion, site);
              const meta = siteData.siteMeta.find((m) => sitesEqual(m.site, site));
              const isRested = meta?.isRested ?? true;

              if (!isValid) {
                return (
                  <circle
                    key={`${site.bodyPart}-${site.side}-disabled`}
                    cx={cx}
                    cy={cy}
                    r="5"
                    className="fill-transparent stroke-border/30"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    aria-hidden="true"
                  />
                );
              }

              const siteStatusLabel = isSelected ? 'Selected' : isSuggested ? 'Suggested' : isRested ? 'Rested' : 'Recent';

              return (
                <g
                  key={`${site.bodyPart}-${site.side}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`${formatSiteLabel(site)} (${siteStatusLabel})`}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      onSelect(site);
                    }
                  }}
                  onClick={() => onSelect(site)}
                  className="outline-none group cursor-pointer"
                >
                  {/* Invisible 40px outer touch target */}
                  <circle cx={cx} cy={cy} r="20" className="fill-transparent" />
                  
                  {/* Outer pulse for suggested */}
                  {isSuggested && (
                    <circle cx={cx} cy={cy} r="14" className="fill-primary/5 stroke-primary/30 stroke-1 motion-safe:animate-pulse" />
                  )}

                  {/* Primary visual circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="9"
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                    className={`transition-all duration-200 origin-center group-focus-visible:stroke-primary group-focus-visible:stroke-[3px] group-focus-visible:scale-110 ${
                      isSelected
                        ? 'fill-primary stroke-background stroke-2 scale-110'
                        : isSuggested
                        ? 'fill-primary/10 stroke-primary stroke-2'
                        : isRested
                        ? 'fill-success/15 stroke-success stroke-2'
                        : 'fill-muted stroke-border group-hover:fill-accent group-hover:stroke-accent-foreground'
                    }`}
                  />
                  
                  {/* Suggested star icon */}
                  {isSuggested && !isSelected && (
                    <text x={cx} y={cy + 3} className="text-[9px] font-bold fill-primary select-none pointer-events-none" textAnchor="middle">★</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Text selectors list */}
        <div className="flex-1 w-full space-y-2">
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
            <p className="text-[10px] text-muted-foreground pt-1">
              Recent: {recentHistory.map(formatSiteLabel).join(' → ')}
            </p>
          )}
        </div>
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
