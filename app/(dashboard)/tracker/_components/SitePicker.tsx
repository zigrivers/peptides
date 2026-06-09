'use client';

import React from 'react';
import type { InjectionSite } from '@/lib/tracker/domain/types';
import type { SiteWithMeta } from '@/lib/tracker/domain/SiteRotation';
import { sitesEqual, sitesEqualLegacy } from '@/lib/tracker/domain/SiteRotation';

function strictSitesEqual(a: InjectionSite | null, b: InjectionSite | null): boolean {
  if (!a || !b) return false;
  return sitesEqual(a, b);
}

export type SiteData = {
  suggestion: InjectionSite | null;
  validSites: InjectionSite[];
  siteMeta: SiteWithMeta[];
  recentSites: InjectionSite[];
};

interface SitePickerProps {
  siteData: SiteData;
  selectedSite: InjectionSite | null;
  onSelect: (site: InjectionSite) => void;
}

export function formatSiteLabel(site: InjectionSite): string {
  const side = site.side.charAt(0).toUpperCase() + site.side.slice(1);
  if (site.bodyPart === 'abdomen-upper') {
    return `${side} Upper Abdomen`;
  }
  if (site.bodyPart === 'abdomen-lower') {
    return `${side} Lower Abdomen`;
  }
  if (site.bodyPart === 'abdomen') {
    return `${side} Abdomen`;
  }
  const part = site.bodyPart.charAt(0).toUpperCase() + site.bodyPart.slice(1);
  return `${side} ${part}`;
}

export function formatSiteUseAge(daysSinceLastUse: number | null | undefined): string {
  if (daysSinceLastUse === null || daysSinceLastUse === undefined) return 'Never';
  if (daysSinceLastUse === 0) return 'Today';
  if (daysSinceLastUse === 1) return 'Yesterday';
  return `${daysSinceLastUse} days ago`;
}

export function formatSiteUseAgeForSentence(daysSinceLastUse: number | null | undefined): string {
  const label = formatSiteUseAge(daysSinceLastUse);
  if (label === 'Today') return 'today';
  if (label === 'Yesterday') return 'yesterday';
  if (label === 'Never') return 'recently';
  return label;
}

export function getSiteCoordinates(bodyPart: string, side: 'left' | 'right'): { cx: number; cy: number } {
  switch (bodyPart) {
    case 'deltoid':
      return side === 'left' ? { cx: 142, cy: 78 } : { cx: 58, cy: 78 };
    case 'abdomen-upper':
      return side === 'left' ? { cx: 120, cy: 120 } : { cx: 80, cy: 120 };
    case 'abdomen-lower':
      return side === 'left' ? { cx: 120, cy: 145 } : { cx: 80, cy: 145 };
    case 'abdomen': // legacy fallback
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
  { bodyPart: 'abdomen-upper', side: 'right' },
  { bodyPart: 'abdomen-upper', side: 'left' },
  { bodyPart: 'abdomen-lower', side: 'right' },
  { bodyPart: 'abdomen-lower', side: 'left' },
  { bodyPart: 'ventrogluteal', side: 'right' },
  { bodyPart: 'ventrogluteal', side: 'left' },
  { bodyPart: 'thigh', side: 'right' },
  { bodyPart: 'thigh', side: 'left' },
];

export function SitePicker({ siteData, selectedSite, onSelect }: SitePickerProps) {
  if (siteData.validSites.length === 0) return null;

  const canonicalSelected = selectedSite
    ? {
        ...selectedSite,
        bodyPart: selectedSite.bodyPart === 'abdomen' ? 'abdomen-lower' : selectedSite.bodyPart,
      }
    : null;

  const lastUsedSite = siteData.recentSites[0] ?? null;
  const isConflict = canonicalSelected !== null && lastUsedSite !== null && sitesEqualLegacy(canonicalSelected, lastUsedSite);

  const recentHistory = siteData.recentSites.slice(0, 7);
  const recentDosesForPath = siteData.recentSites.slice(0, 4);

  // Map coordinates for pathway
  const pathPoints = recentDosesForPath
    .map((site) => getSiteCoordinates(site.bodyPart, site.side))
    .filter((pt) => pt.cx !== -100);

  // Construct curved or chronological connecting lines (oldest to newest)
  let pathD = '';
  if (pathPoints.length >= 2) {
    const chronologicalPoints = [...pathPoints].reverse();
    pathD = chronologicalPoints.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.cx} ${pt.cy}`).join(' ');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        {/* Visual Body Map Card */}
        <div className="w-48 sm:w-56 h-[290px] sm:h-[340px] shrink-0 border border-border bg-card rounded-lg p-3 flex flex-col items-center select-none shadow-sm relative">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 tracking-wider">VISUAL MAP</p>
          <svg
            viewBox="0 0 200 280"
            className="w-full h-full"
            role="group"
            aria-label="Injection site body map"
          >
            <defs>
              <style>{`
                @keyframes pulse-ring {
                  0% { transform: scale(0.95); opacity: 0.8; }
                  50% { transform: scale(1.3); opacity: 0.2; }
                  100% { transform: scale(0.95); opacity: 0.8; }
                }
                .hotspot-pulse {
                  animation: pulse-ring 2s infinite ease-in-out;
                  transform-origin: center;
                  transform-box: fill-box;
                }
                .body-hotspot:hover .hotspot-ring {
                  animation: pulse-ring 1.2s infinite ease-in-out;
                  opacity: 1;
                }
              `}</style>
            </defs>

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

            {/* Chronological Pathway Connecting Lines */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                className="stroke-primary/45 stroke-[2] animate-flow-path"
                strokeDasharray="4 3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Hotspots */}
            {ALL_POSSIBLE_SITES.map((site) => {
              const { cx, cy } = getSiteCoordinates(site.bodyPart, site.side);
              const isValid = siteData.validSites.some((v) => sitesEqualLegacy(v, site));
              const isSelected = strictSitesEqual(canonicalSelected, site);
              const isSuggested = siteData.suggestion !== null && sitesEqualLegacy(siteData.suggestion, site);
              const meta = siteData.siteMeta.find((m) => sitesEqualLegacy(m.site, site));
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

              const isThisSiteConflict = isSelected && isConflict;

              // Heatmap color interpolation
              const days = meta?.daysSinceLastUse !== null && meta?.daysSinceLastUse !== undefined
                ? Math.min(14, meta.daysSinceLastUse)
                : 14;

              let hue = 142; // default green
              if (days < 7) {
                hue = 15 + (days / 7) * 95;
              } else if (days < 14) {
                hue = 110 + ((days - 7) / 7) * 32;
              }

              const heatmapFill = `hsla(${hue}, 70%, 45%, 0.15)`;
              const heatmapStroke = `hsl(${hue}, 65%, 40%)`;

              const siteStatusLabel = isThisSiteConflict
                ? 'Rotation Conflict'
                : isSelected
                ? 'Selected'
                : isSuggested
                ? 'Suggested'
                : isRested
                ? 'Rested'
                : 'Recent';

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
                  className="outline-none group/hotspot cursor-pointer body-hotspot"
                >
                  {/* Invisible 40px outer touch target */}
                  <circle cx={cx} cy={cy} r="20" className="fill-transparent" />
                  
                  {/* Outer pulse for suggested */}
                  {isSuggested && (
                    <circle cx={cx} cy={cy} r="14" className="fill-primary/5 stroke-primary/30 stroke-1 hotspot-pulse" />
                  )}
                  {/* Hover ring (active on group hover) */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="14"
                    className="fill-transparent stroke-primary/0 stroke-1 group-hover/hotspot:stroke-primary/30 group-hover/hotspot:fill-primary/5 hotspot-ring transition-all duration-300 origin-center"
                    style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
                  />

                  {/* Primary visual circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="9"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      ...(!isSelected && !isSuggested ? { fill: heatmapFill, stroke: heatmapStroke, strokeWidth: 2 } : {})
                    }}
                    className={`transition-all duration-200 origin-center group-focus-visible:stroke-primary group-focus-visible:stroke-[3px] group-focus-visible:scale-110 ${
                      isThisSiteConflict
                        ? 'fill-destructive/30 stroke-destructive stroke-2 scale-110 animate-[pulse_1.5s_infinite]'
                        : isSelected
                        ? 'fill-primary stroke-background stroke-2 scale-110'
                        : isSuggested
                        ? 'fill-primary/10 stroke-primary stroke-2'
                        : 'group-hover:opacity-85'
                    }`}
                  />
                  
                  {/* Suggested star icon */}
                  {isSuggested && !isSelected && (
                    <text x={cx} y={cy + 3} className="text-[9px] font-bold fill-primary select-none pointer-events-none" textAnchor="middle">★</text>
                  )}
                </g>
              );
            })}

            {/* Historical Sequence Badges */}
            {pathPoints.map((pt, idx) => {
              return (
                <g key={`sequence-badge-${idx}`} className="select-none pointer-events-none">
                  <circle
                    cx={pt.cx + 8}
                    cy={pt.cy - 8}
                    r="5.5"
                    className="fill-card stroke-primary/40 shadow-sm"
                    strokeWidth="0.75"
                  />
                  <text
                    x={pt.cx + 8}
                    y={pt.cy - 5.5}
                    className="text-[7.5px] font-bold fill-primary font-sans"
                    textAnchor="middle"
                  >
                    {idx + 1}
                  </text>
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
              const meta = siteData.siteMeta.find((m) => sitesEqualLegacy(m.site, site));
              const isSelected = strictSitesEqual(canonicalSelected, site);
              const isSuggested = siteData.suggestion !== null && sitesEqualLegacy(siteData.suggestion, site);
              const isThisSiteConflict = isSelected && isConflict;

              const daysLabel = formatSiteUseAge(meta?.daysSinceLastUse);

              return (
                <button
                  key={`${site.bodyPart}-${site.side}`}
                  type="button"
                  onClick={() => onSelect(site)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-start px-2 py-1.5 rounded border text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none ${
                    isThisSiteConflict
                      ? 'border-destructive bg-destructive/10 text-destructive font-semibold'
                      : isSelected
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <span className="font-medium">
                    {formatSiteLabel(site)}
                    {isSuggested && !isSelected && (
                      <span className="ml-1 text-primary">★</span>
                    )}
                    {isThisSiteConflict && (
                      <span className="ml-1 text-destructive font-bold">&#9888;</span>
                    )}
                  </span>
                  <span className="text-muted-foreground mt-0.5">{daysLabel}</span>
                  {meta?.isRested ? (
                    <span className="mt-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1 py-0.5 text-[10px] font-medium">
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
