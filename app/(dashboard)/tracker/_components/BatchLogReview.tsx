'use client';

import { useState, useTransition, useEffect } from 'react';
import type { Protocol, DoseLog, InjectionSite, SafetyWarning } from '@/lib/tracker/domain/types';
import type { DoseUnitsDisplay } from '@/lib/reconstitution/domain/doseUnits';
import { batchLogDosesAction } from '@/app/actions/tracker/batch-log-doses';
import { formatSiteLabel } from './SitePicker';

interface SerializedProtocol extends Omit<Protocol, 'startDate' | 'endDate'> {
  startDate: string;
  endDate: string | null;
}

interface SerializedDoseLog extends Omit<DoseLog, 'loggedAt' | 'scheduledDate' | 'loggedCost'> {
  loggedAt: string;
  scheduledDate: string;
  loggedCost: string | null;
}

type SerializedSiteSuggestion = {
  suggestion: InjectionSite | null;
  validSites: InjectionSite[];
  siteMeta: Array<{
    site: InjectionSite;
    lastUsed: string | null;
    daysSinceLastUse: number | null;
    isRested: boolean;
  }>;
  recentSites: InjectionSite[];
};

interface SerializedBatchDueItem {
  protocol: SerializedProtocol;
  doseSlot: number;
  slotLabel: string;
  existingLog: SerializedDoseLog | null;
  availableVials: number;
  isAvailable: boolean;
  safetyWarnings?: SafetyWarning[];
  doseUnits: DoseUnitsDisplay | null;
  siteSuggestion?: SerializedSiteSuggestion | null;
}

type Props = {
  items: SerializedBatchDueItem[];
  compoundNames: Record<string, string>; // compoundId → name
  variant?: 'default' | 'sidebar';
};


type ItemState = 'pending' | 'logged' | 'skipped' | 'failed';

// Items are keyed per (protocol, slot) so twice-daily protocols track each dose independently.
function itemKey(item: { protocol: { id: string }; doseSlot: number }): string {
  return `${item.protocol.id}:${item.doseSlot}`;
}

function siteValue(site: InjectionSite): string {
  return `${site.side}|${site.bodyPart}`;
}

function sitesEqual(a: InjectionSite | null | undefined, b: InjectionSite | null | undefined): boolean {
  return Boolean(a && b && a.side === b.side && a.bodyPart === b.bodyPart);
}

function normalizeSite(site: InjectionSite | null | undefined): InjectionSite | null {
  if (!site) return null;
  return {
    ...site,
    bodyPart: site.bodyPart === 'abdomen' ? 'abdomen-lower' : site.bodyPart,
  };
}

function findSiteByValue(validSites: InjectionSite[], value: string): InjectionSite | null {
  const [side, bodyPart] = value.split('|');
  if ((side !== 'left' && side !== 'right') || !bodyPart) return null;
  return validSites.find((site) => site.side === side && site.bodyPart === bodyPart) ?? null;
}

function getRecommendedSite(item: SerializedBatchDueItem): InjectionSite | null {
  return item.siteSuggestion?.suggestion ?? item.siteSuggestion?.validSites[0] ?? null;
}

function getInitialSite(item: SerializedBatchDueItem): InjectionSite | null {
  const existingSite = normalizeSite(item.existingLog?.injectionSite);
  const validSites = item.siteSuggestion?.validSites ?? [];
  if (existingSite && (validSites.length === 0 || validSites.some((site) => sitesEqual(site, existingSite)))) {
    return existingSite;
  }
  return getRecommendedSite(item);
}

function buildInitialSiteSelections(items: SerializedBatchDueItem[]): Record<string, InjectionSite | null> {
  const selections: Record<string, InjectionSite | null> = {};
  items.forEach((item) => {
    selections[itemKey(item)] = getInitialSite(item);
  });
  return selections;
}

export function BatchLogReview({ items, compoundNames, variant = 'default' }: Props) {
  const isSidebar = variant === 'sidebar';
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectedSites, setSelectedSites] = useState<Record<string, InjectionSite | null>>(
    () => buildInitialSiteSelections(items)
  );
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() => {
    const s: Record<string, ItemState> = {};
    items.forEach((i) => {
      s[itemKey(i)] = !i.existingLog
        ? 'pending'
        : i.existingLog.status === 'LOGGED'
          ? 'logged'
          : 'skipped';
    });
    return s;
  });
  const [warnings, setWarnings] = useState<Record<string, SafetyWarning[]>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItemStates((prevStates) => {
      const nextStates: Record<string, ItemState> = {};
      items.forEach((i) => {
        const key = itemKey(i);
        if (prevStates[key] === 'failed' && !i.existingLog) {
          nextStates[key] = 'failed';
        } else {
          nextStates[key] = !i.existingLog
            ? 'pending'
            : i.existingLog.status === 'LOGGED'
              ? 'logged'
              : 'skipped';
        }
      });
      return nextStates;
    });

    setSelected((prev) => {
      const next = new Set<string>();
      items.forEach((i) => {
        const key = itemKey(i);
        if (i.isAvailable && !i.existingLog && prev.has(key)) {
          next.add(key);
        }
      });
      return next;
    });

    setSelectedSites((prev) => {
      const next: Record<string, InjectionSite | null> = {};
      items.forEach((item) => {
        const key = itemKey(item);
        const validSites = item.siteSuggestion?.validSites ?? [];
        const previous = prev[key];
        const previousStillValid = previous && (validSites.length === 0 || validSites.some((site) => sitesEqual(site, previous)));
        next[key] = previousStillValid ? previous : getInitialSite(item);
      });
      return next;
    });
  }, [items]);

  function toggleItem(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function updateSelectedSite(key: string, site: InjectionSite | null) {
    setSelectedSites((prev) => ({
      ...prev,
      [key]: site,
    }));
  }

  function handleConfirm() {
    const selectedKeys = Array.from(selected);
    if (selectedKeys.length === 0) return;
    setError(null);

    const itemsByKey = new Map(items.map((item) => [itemKey(item), item]));
    const selections = selectedKeys.flatMap((key) => {
      const item = itemsByKey.get(key);
      if (!item) return [];
      return [{
        protocolId: item.protocol.id,
        doseSlot: item.doseSlot,
        injectionSite: selectedSites[key] ?? getRecommendedSite(item),
      }];
    });
    if (selections.length === 0) return;

    startTransition(async () => {
      const result = await batchLogDosesAction({ selections });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      const nextStates = { ...itemStates };
      const nextWarnings = { ...warnings };

      result.results.forEach((r) => {
        const key = `${r.protocolId}:${r.doseSlot}`;
        if (r.ok) {
          nextStates[key] = 'logged';
          nextWarnings[key] = r.warnings;
        } else {
          nextStates[key] = 'failed';
        }
      });

      setItemStates(nextStates);
      setWarnings(nextWarnings);

      // Remove successfully logged slots from the selected set so the Confirm
      // button count stays accurate if the user retries after partial failures.
      setSelected((prev) => {
        const next = new Set(prev);
        result.results.forEach((r) => { if (r.ok) next.delete(`${r.protocolId}:${r.doseSlot}`); });
        return next;
      });

      const allDone = items.every((i) => nextStates[itemKey(i)] === 'logged' || nextStates[itemKey(i)] === 'skipped');
      if (allDone) setDone(true);
    });
  }

  const pendingCount = items.filter((i) => itemStates[itemKey(i)] === 'pending').length;
  const skippedCount = items.filter((i) => itemStates[itemKey(i)] === 'skipped').length;
  const failedCount = items.filter((i) => itemStates[itemKey(i)] === 'failed').length;
  const loggedCount = items.filter((i) => itemStates[itemKey(i)] === 'logged').length;
  const completeCount = loggedCount;
  const readyCount = items.filter((i) => itemStates[itemKey(i)] === 'pending' && i.isAvailable).length;
  const unavailableCount = items.filter((i) => itemStates[itemKey(i)] === 'pending' && !i.isAvailable).length;
  const panelClassName = `rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-900 dark:bg-gray-950 ${
    isSidebar ? 'p-4' : 'p-5'
  }`;
  const completeLabel = isSidebar
    ? `${completeCount}/${items.length} complete`
    : `${completeCount} of ${items.length} complete`;
  const selectedLabel = isSidebar ? `${selected.size} selected` : selected.size;
  const actionLabel = isSidebar
    ? `Log Selected (${selected.size})`
    : `Log ${selected.size} Selected`;

  if (items.length === 0) {
    return (
      <section
        role="region"
        aria-labelledby="today-dose-plan-heading"
        className={panelClassName}
      >
        <div className={isSidebar ? 'space-y-3' : 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Today</p>
            <h2 id="today-dose-plan-heading" className="mt-1 text-lg font-bold text-gray-950 dark:text-gray-100">
              Today&apos;s Dose Plan
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {isSidebar ? 'Review upcoming regimen days in the calendar.' : 'Use the calendar below to review upcoming regimen days.'}
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 dark:border-gray-800 dark:text-gray-300">
            {isSidebar ? 'No doses today' : 'No Doses Scheduled Today'}
          </div>
        </div>
      </section>
    );
  }

  if (done || (pendingCount === 0 && skippedCount === 0 && failedCount === 0 && items.length > 0)) {
    return (
      <section
        role="region"
        aria-labelledby="today-dose-plan-heading"
        className={`rounded-xl border border-success/20 bg-success/5 text-center ${isSidebar ? 'p-4' : 'p-5'}`}
      >
        <h2 id="today-dose-plan-heading" className="text-lg font-bold text-success">
          Today&apos;s Dose Plan
        </h2>
        <p className="mt-1 text-sm font-medium text-success">
          {isSidebar ? `${loggedCount}/${items.length} logged today` : `Today: ${loggedCount}/${items.length} complete`}
        </p>
      </section>
    );
  }

  return (
    <section
      role="region"
      aria-labelledby="today-dose-plan-heading"
      className={panelClassName}
    >
      <div className={isSidebar ? 'space-y-3' : 'flex flex-col gap-4 md:flex-row md:items-start md:justify-between'}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Today</p>
          <h2 id="today-dose-plan-heading" className="mt-1 text-lg font-bold text-gray-950 text-pretty dark:text-gray-100">
            Today&apos;s Dose Plan
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {readyCount > 0
              ? isSidebar
                ? `${readyCount} ready to log`
                : `${readyCount} dose${readyCount === 1 ? '' : 's'} ready to log`
              : 'Review the remaining dose states before closing out today'}
          </p>
        </div>
        <div className={isSidebar ? 'grid grid-cols-2 gap-2 text-left' : 'grid grid-cols-2 gap-2 text-center sm:flex sm:text-left'}>
          <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
            {!isSidebar && <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Complete</p>}
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {completeLabel}
            </p>
          </div>
          <div className="rounded-lg bg-primary/5 px-3 py-2">
            {!isSidebar && <p className="text-[10px] font-bold uppercase tracking-wide text-primary/70">Selected</p>}
            <p className="text-sm font-bold text-primary">{selectedLabel}</p>
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {unavailableCount > 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {unavailableCount} dose{unavailableCount === 1 ? '' : 's'} need reconstituted inventory before batch logging.
        </p>
      )}

      <ul className={isSidebar ? 'mt-3 space-y-2' : 'mt-4 space-y-2'}>
        {items.map((item) => {
          const key = itemKey(item);
          const state = itemStates[key];
          const isSelected = selected.has(key);
          const itemWarnings = warnings[key] ?? [];
          const compoundName = compoundNames[item.protocol.compoundId] ?? item.protocol.compoundId;
          const recommendedSite = getRecommendedSite(item);
          const validSites = item.siteSuggestion?.validSites ?? [];
          const selectedSite = selectedSites[key] ?? recommendedSite;
          const siteSelectId = `dose-site-${item.protocol.id}-${item.doseSlot}`;

          if (state === 'logged') {
            return (
              <li
                key={key}
                className={`flex items-center rounded-lg border border-success/20 bg-success/5 ${
                  isSidebar ? 'min-h-11 gap-2 px-2.5 py-2' : 'min-h-12 gap-3 px-3 py-2'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-xs font-bold text-success-foreground">
                  &#10003;
                </span>
                <span className={`${isSidebar ? 'text-xs' : 'text-sm'} font-medium text-success`}>
                  <span className="font-semibold">{compoundName}</span>
                  {' '}
                  <span className="text-success/80">
                    <span className="font-mono">{item.protocol.dose.amount}</span> {item.protocol.dose.unit}
                    {item.slotLabel && <> · {item.slotLabel}</>}
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li
              key={key}
              className={`rounded-lg border px-3 py-2 ${
                state === 'failed'
                  ? 'border-red-200 bg-red-50'
                  : state === 'skipped'
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950'
              }`}
            >
              <label className={`flex cursor-pointer items-start rounded-md px-1 py-1 hover:bg-muted/40 ${
                isSidebar ? 'min-h-11 gap-2' : 'min-h-12 gap-3'
              }`}>
                <input
                  type="checkbox"
                  className={`${isSidebar ? 'mt-0.5 h-4 w-4' : 'mt-1 h-5 w-5'} rounded border-gray-300 text-primary focus-visible:ring-primary`}
                  checked={isSelected && item.isAvailable}
                  disabled={!item.isAvailable || isPending}
                  onChange={() => item.isAvailable && toggleItem(key)}
                />
                <div className="flex-1 min-w-0">
                  <p className={`${isSidebar ? 'text-xs leading-snug' : 'text-sm'} font-semibold text-gray-950 dark:text-gray-100`}>
                    <span>{compoundName}</span>
                    <span className={`${isSidebar ? 'block' : ''} font-normal text-gray-500`}>
                      {' '}
                      — <span className="font-mono">{item.protocol.dose.amount}</span> {item.protocol.dose.unit}
                      {item.slotLabel && <> · {item.slotLabel}</>}
                    </span>
                    {item.doseUnits?.unitsText && (
                      <span className="ml-1 text-xs font-normal text-gray-400">{item.doseUnits.unitsText}</span>
                    )}
                  </p>
                  {state === 'skipped' && item.isAvailable && (
                    <p className="mt-0.5 text-xs text-amber-700">Previously skipped — log now?</p>
                  )}
                  {!item.isAvailable && (
                    <p className="mt-0.5 text-xs text-amber-700">No vials available — cannot batch-log</p>
                  )}
                  {itemWarnings.map((w) => (
                    <p key={w.code} className="mt-0.5 text-xs text-amber-700">{w.message}</p>
                  ))}
                  {state === 'failed' && (
                    <p className="mt-0.5 text-xs text-red-700">Failed to log</p>
                  )}
                </div>
              </label>
              {validSites.length > 0 && (
                <div className={`${isSidebar ? 'mt-2 pl-7' : 'mt-2 pl-9'} space-y-1.5`}>
                  {recommendedSite && (
                    <p className="text-[11px] font-medium text-gray-500">
                      Recommended: {formatSiteLabel(recommendedSite)}
                    </p>
                  )}
                  <label htmlFor={siteSelectId} className="sr-only">
                    Injection site for {compoundName}
                  </label>
                  <select
                    id={siteSelectId}
                    aria-label={`Injection site for ${compoundName}`}
                    value={selectedSite ? siteValue(selectedSite) : ''}
                    disabled={!item.isAvailable || isPending}
                    onChange={(event) => updateSelectedSite(key, findSiteByValue(validSites, event.target.value))}
                    className="min-h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 shadow-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                  >
                    {!selectedSite && <option value="">Choose site</option>}
                    {validSites.map((site) => (
                      <option key={siteValue(site)} value={siteValue(site)}>
                        {formatSiteLabel(site)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        disabled={isPending || selected.size === 0}
        onClick={handleConfirm}
        className="mt-4 min-h-12 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? 'Logging…' : actionLabel}
      </button>
    </section>
  );
}
