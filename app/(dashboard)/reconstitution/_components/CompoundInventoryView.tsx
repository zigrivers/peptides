'use client';

import React, { useMemo, useState, useTransition } from 'react';
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
  return `${parseFloat(mg)}`;
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
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
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
      {/* Filter bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setPrimary('all')}
              className={`px-3 py-1 rounded-md transition-colors ${primary === 'all' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setPrimary('in')}
              className={`px-3 py-1 rounded-md transition-colors ${primary === 'in' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
            >
              In inventory
            </button>
            <button
              type="button"
              onClick={() => setPrimary('not')}
              className={`px-3 py-1 rounded-md transition-colors ${primary === 'not' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
            >
              Not in inventory
            </button>
          </div>

          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search compounds…"
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                chips.has(chip)
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* In-inventory rows */}
      {showInStock && (
        <div className="space-y-3">
          {inStockRows.map((s) => {
            const reconList = reconstitutedVialsByCompound?.[s.compoundId] ?? [];
            const showSelector = s.reconstitutedCount >= 2 && reconList.length >= 2;
            return (
              <div
                key={s.compoundId}
                data-compound-name={s.compoundName}
                className="rounded-xl border border-border bg-card text-card-foreground p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/reference/${s.compoundSlug}`)}
                    className="text-left min-w-0 flex-1"
                  >
                    <h3 className="font-bold text-sm text-foreground">{s.compoundName}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.reconstitutedCount} ready · {s.dryCount} dry · ~{formatMg(s.totalReconstitutedRemainingMg)} mg
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {s.worstBadge && <BadgePill badge={s.worstBadge} />}
                      {s.expiredCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                          <Trash2 className="h-3 w-3" /> {s.expiredCount} expired — discard
                        </span>
                      )}
                    </div>
                    {s.dosesLeft !== null && (
                      <p
                        className="text-[11px] text-muted-foreground mt-1.5"
                        title="estimate from your active vial — use the Tracker for the exact draw"
                      >
                        ≈ {s.dosesLeft} doses left{' '}
                        {s.unitsEach === 'varies'
                          ? '(units vary by vial — see tracker)'
                          : s.unitsEach
                            ? `(≈ ${s.unitsEach} units each)`
                            : ''}{' '}
                        <span className="italic opacity-70">· planning estimate</span>
                      </p>
                    )}
                    {s.dosesLeft === null && s.unitsEach === 'varies' && (
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        units vary by vial — see tracker
                      </p>
                    )}
                  </button>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    {s.dryCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleReconstitute(s)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-sky-500 hover:bg-sky-600 text-white rounded-lg"
                      >
                        <Beaker className="h-3 w-3" /> Reconstitute
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onAddVials(s.compoundId)}
                      className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border border-border hover:bg-muted/50 rounded-lg"
                    >
                      <Plus className="h-3 w-3" /> Add vials
                    </button>
                  </div>
                </div>

                {showSelector && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <label className="text-[11px] font-medium text-muted-foreground">Drawing from</label>
                    <select
                      value={s.activeVial?.id ?? ''}
                      disabled={pendingCompound === s.compoundId}
                      onChange={(e) => handleSelectActiveVial(s.compoundId, e.target.value)}
                      className="text-[11px] rounded-md border border-border bg-background px-2 py-1"
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
              className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/10 px-4 py-2.5"
            >
              <button
                type="button"
                onClick={() => router.push(`/reference/${c.slug}`)}
                className="text-left"
              >
                <span className="text-sm font-medium text-muted-foreground">{c.name}</span>
                <span className="text-xs text-muted-foreground/70"> — none in stock</span>
              </button>
              <button
                type="button"
                onClick={() => onAddVials(c.id)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
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
