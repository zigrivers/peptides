'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  CompoundInventorySummary,
  SerializedVialData,
} from '@/lib/reconstitution/application/VialService';
import type { Compound } from '@/lib/reference/domain/types';
import { setActiveVialAction } from '@/app/actions/reconstitution/set-active-vial';
import {
  Beaker,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  TrendingDown,
  Trash2,
} from 'lucide-react';

type PrimaryFilter = 'all' | 'in' | 'not';
type AttentionChip = 'ready' | 'dryOnly' | 'expiring' | 'low';

const COUNT_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const MG_FORMATTER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

const BADGE_SEVERITY: Record<string, number> = {
  EXPIRED: 3,
  EXPIRING_SOON: 2,
  LOW_INVENTORY: 1,
};

interface Props {
  userId: string;
  summaries: CompoundInventorySummary[];
  /** Global catalog (published, non-archived) for not-in-inventory rows. */
  compounds: Pick<Compound, 'id' | 'name' | 'slug'>[];
  /** Full serialized vials (dry + reconstituted) so a row can resolve a concrete vial. */
  dryVials: SerializedVialData[];
  /** Reconstituted vials per compound, for the drawing-from selector (≥2 vials). */
  reconstitutedVialsByCompound?: Record<string, SerializedVialData[]>;
  onReconstitute: (vial: SerializedVialData) => void;
  onAddVials: (compoundId: string) => void;
}

function formatMg(mg: string): string {
  return MG_FORMATTER.format(Number(mg));
}

function formatMgWithUnit(mg: string): string {
  return `${formatMg(mg)} mg`;
}

function formatPercent(remainingMg: string, totalMg: string): number {
  const total = Number(totalMg);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const remaining = Number(remainingMg);
  if (!Number.isFinite(remaining)) return 0;
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}

function formatExpiry(vial: SerializedVialData | null): string {
  if (!vial?.expiresAt) return 'No expiry set';
  if (vial.daysUntilExpiry === null) return 'Expiry set';
  if (vial.daysUntilExpiry < 0) return `${Math.abs(vial.daysUntilExpiry)} days expired`;
  if (vial.daysUntilExpiry === 0) return 'Expires today';
  return `${vial.daysUntilExpiry} days left`;
}

function BadgePill({ badge }: { badge: string }) {
  if (badge === 'EXPIRED') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-3 w-3" /> Expired
      </span>
    );
  }
  if (badge === 'EXPIRING_SOON') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
        <Clock className="h-3 w-3" /> Expiring soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-400">
      <TrendingDown className="h-3 w-3" /> Low
    </span>
  );
}

export function CompoundInventoryView({
  userId,
  summaries,
  compounds,
  dryVials,
  reconstitutedVialsByCompound,
  onReconstitute,
  onAddVials,
}: Props) {
  const router = useRouter();
  const [primary, setPrimary] = useState<PrimaryFilter>('in');
  const [chips, setChips] = useState<Set<AttentionChip>>(new Set());
  const [search, setSearch] = useState('');
  const [, startTransition] = useTransition();
  const [pendingCompound, setPendingCompound] = useState<string | null>(null);

  const hasAnyInventory = summaries.length > 0;
  const inStockIds = useMemo(() => new Set(summaries.map((s) => s.compoundId)), [summaries]);

  const toggleChip = (chip: AttentionChip) => {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  };

  const matchesChips = (s: CompoundInventorySummary): boolean => {
    if (chips.size === 0) return true;
    if (chips.has('ready') && s.reconstitutedCount === 0) return false;
    if (chips.has('dryOnly') && !(s.dryCount > 0 && s.reconstitutedCount === 0)) return false;
    if (chips.has('expiring') && s.worstBadge !== 'EXPIRING_SOON' && !hasBadge(s, 'EXPIRING_SOON'))
      return false;
    if (chips.has('low') && s.worstBadge !== 'LOW_INVENTORY' && !hasBadge(s, 'LOW_INVENTORY'))
      return false;
    return true;
  };

  function hasBadge(s: CompoundInventorySummary, badge: string): boolean {
    return s.worstBadge === badge;
  }

  const searchLower = search.trim().toLowerCase();

  // In-inventory rows, filtered + sorted.
  const inStockRows = useMemo(() => {
    const filtered = summaries.filter((s) => {
      if (searchLower && !s.compoundName.toLowerCase().includes(searchLower)) return false;
      return matchesChips(s);
    });
    return filtered.sort((a, b) => {
      const sevA = a.worstBadge ? BADGE_SEVERITY[a.worstBadge] ?? 0 : 0;
      const sevB = b.worstBadge ? BADGE_SEVERITY[b.worstBadge] ?? 0 : 0;
      if (sevA !== sevB) return sevB - sevA;
      return a.compoundName.localeCompare(b.compoundName);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, searchLower, chips]);

  // Not-in-inventory rows (only the global catalog compounds with no vials).
  const notInStockRows = useMemo(() => {
    return compounds
      .filter((c) => !inStockIds.has(c.id))
      .filter((c) => (searchLower ? c.name.toLowerCase().includes(searchLower) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [compounds, inStockIds, searchLower]);

  const showInStock = primary === 'all' || primary === 'in';
  const showNotInStock = primary === 'all' || primary === 'not';
  const visibleRowCount =
    (showInStock ? inStockRows.length : 0) + (showNotInStock ? notInStockRows.length : 0);
  const visibleCompoundLabel =
    visibleRowCount === 1 ? '1 compound shown' : `${COUNT_FORMATTER.format(visibleRowCount)} compounds shown`;
  const hasActiveFilters = primary !== 'in' || chips.size > 0 || searchLower.length > 0;

  const clearFilters = () => {
    setPrimary('in');
    setChips(new Set());
    setSearch('');
  };

  const handleSelectActiveVial = (compoundId: string, vialId: string) => {
    setPendingCompound(compoundId);
    startTransition(async () => {
      const res = await setActiveVialAction(userId, compoundId, vialId);
      setPendingCompound(null);
      if (res.ok) {
        router.refresh();
      }
    });
  };

  const handleReconstitute = (s: CompoundInventorySummary) => {
    const refIds = new Set(s.dryVialRefs.map((r) => r.id));
    const candidates = dryVials.filter((v) => refIds.has(v.id));
    const oldest = [...candidates].sort((a, b) => {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    })[0];
    if (oldest) onReconstitute(oldest);
  };

  if (!hasAnyInventory && primary === 'in') {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card p-8 text-center">
        <Beaker className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No inventory yet</p>
        <p className="text-xs text-muted-foreground">
          Add dry vials or reconstitute to start tracking inventory by compound.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">Inventory by compound</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <span>{visibleCompoundLabel}</span>
              {hasActiveFilters ? ' with current filters' : ' in the current view'}
            </p>
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search compounds"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search compounds…"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex w-fit rounded-lg border border-border bg-muted/30 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPrimary('all')}
              aria-pressed={primary === 'all'}
              className={`min-h-9 rounded-md px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${primary === 'all' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setPrimary('in')}
              aria-pressed={primary === 'in'}
              className={`min-h-9 rounded-md px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${primary === 'in' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              In inventory
            </button>
            <button
              type="button"
              onClick={() => setPrimary('not')}
              aria-pressed={primary === 'not'}
              className={`min-h-9 rounded-md px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${primary === 'not' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Not in inventory
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['ready', 'Ready'],
                ['dryOnly', 'Dry only'],
                ['expiring', 'Expiring soon'],
                ['low', 'Low'],
              ] as [AttentionChip, string][]
            ).map(([chip, label]) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleChip(chip)}
                aria-pressed={chips.has(chip)}
                className={`min-h-8 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  chips.has(chip)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
            {hasActiveFilters && visibleRowCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-8 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {visibleRowCount === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">No compounds match this view</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clear search and filters to return to your inventory list.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 min-h-9 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* In-inventory rows */}
      {showInStock && (
        <div className="space-y-3">
          {inStockRows.map((s) => {
            const reconList = reconstitutedVialsByCompound?.[s.compoundId] ?? [];
            const showSelector = s.reconstitutedCount >= 2 && reconList.length >= 2;
            const activePercent = s.activeVial
              ? formatPercent(s.activeVial.remainingMg, s.activeVial.totalMg)
              : 0;
            return (
              <div
                key={s.compoundId}
                data-compound-name={s.compoundName}
                className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_0.85fr_0.85fr_minmax(0,1.25fr)_0.95fr_auto] lg:items-start">
                  <Link
                    href={`/reference/${s.compoundSlug}`}
                    className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  >
                    <h3 className="font-bold text-sm text-foreground">{s.compoundName}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {s.worstBadge && <BadgePill badge={s.worstBadge} />}
                      {s.expiredCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                          <Trash2 className="h-3 w-3" /> {s.expiredCount} expired — discard
                        </span>
                      )}
                    </div>
                  </Link>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ready</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{s.reconstitutedCount} ready</p>
                    <p className="text-xs text-muted-foreground">~{formatMgWithUnit(s.totalReconstitutedRemainingMg)}</p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dry reserve</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{s.dryCount} dry</p>
                    <p className="text-xs text-muted-foreground">~{formatMgWithUnit(s.totalDryMg)}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Active vial</p>
                    {s.activeVial ? (
                      <div className="mt-1 space-y-1.5">
                        <p className="text-xs text-foreground">
                          {formatMgWithUnit(s.activeVial.remainingMg)} of {formatMgWithUnit(s.activeVial.totalMg)}
                        </p>
                        <div
                          role="progressbar"
                          aria-label={`${s.compoundName} active vial remaining`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={activePercent}
                          className="h-2 overflow-hidden rounded-full bg-muted"
                        >
                          <div
                            className={`h-full rounded-full ${activePercent <= 20 ? 'bg-warning' : 'bg-primary'}`}
                            style={{ width: `${activePercent}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{formatExpiry(s.activeVial)}</p>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">No ready vial</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Doses left</p>
                    {s.dosesLeft !== null ? (
                      <p
                        className="mt-1 text-sm font-bold text-foreground"
                        title="estimate from your active vial — use the Tracker for the exact draw"
                      >
                        {s.dosesLeft} doses left
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Not estimated</p>
                    )}
                    {s.unitsEach === 'varies' ? (
                      <p className="text-[11px] text-muted-foreground">units vary by vial — see tracker</p>
                    ) : s.unitsEach ? (
                      <p className="text-[11px] text-muted-foreground">~{s.unitsEach} units each</p>
                    ) : null}
                    {s.dosesLeft !== null && (
                      <p className="text-[11px] italic text-muted-foreground">planning estimate</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 lg:items-end">
                    {s.dryCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleReconstitute(s)}
                        className="flex min-h-9 items-center justify-center gap-1 rounded-md bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Beaker className="h-3 w-3" /> Reconstitute
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddVials(s.compoundId)}
                      className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Plus className="h-3 w-3" /> Add vials
                    </button>
                  </div>
                </div>

                {showSelector && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <label className="text-[11px] font-medium text-muted-foreground" htmlFor={`active-vial-${s.compoundId}`}>Drawing from</label>
                    <select
                      id={`active-vial-${s.compoundId}`}
                      value={s.activeVial?.id ?? ''}
                      disabled={pendingCompound === s.compoundId}
                      onChange={(e) => handleSelectActiveVial(s.compoundId, e.target.value)}
                      className="rounded-md border border-border bg-background px-2 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {reconList.map((v) => (
                        <option key={v.id} value={v.id}>
                          {formatMg(v.totalMg)}mg · {formatMg(v.remainingMg)}mg left
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Not-in-inventory rows */}
      {showNotInStock && (
        <div className="space-y-2">
          {notInStockRows.map((c) => (
            <div
              key={c.id}
              data-compound-name={c.name}
              className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/10 px-4 py-3"
            >
              <Link
                href={`/reference/${c.slug}`}
                className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <span className="text-sm font-medium text-muted-foreground">{c.name}</span>
                <span className="text-xs text-muted-foreground/70"> — none in stock</span>
              </Link>
              <button
                type="button"
                onClick={() => onAddVials(c.id)}
                className="flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
