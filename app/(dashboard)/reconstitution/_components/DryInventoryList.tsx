'use client';

import React, { useState, useTransition } from 'react';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import { deleteVialAction } from '@/app/actions/reconstitution/inventory-actions';
import { Snowflake, Thermometer, Beaker, Trash2, ChevronDown, ChevronUp, Calendar, AlertCircle } from 'lucide-react';
import type { Compound } from '@/lib/reference/domain/types';
import { getAudioPlayer } from '@/lib/reconstitution/domain/audioSynth';
import { VialCostEditor } from './VialCostEditor';

interface Props {
  vials: SerializedVialData[];
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  syringeStandard: 'U100' | 'U40';
  syringeSize: '0.3' | '0.5' | '1.0';
  onReconstitute: (vial: SerializedVialData) => void;
  isRoomTemp?: boolean;
}

function formatDate(isoStr: string | null): string {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function DryInventoryList({
  vials,
  compounds: _compounds,
  syringeStandard: _syringeStandard,
  syringeSize: _syringeSize,
  onReconstitute,
  isRoomTemp = false,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingVialId, setDeletingVialId] = useState<string | null>(null);

  // Group vials by compoundId and totalMg
  const groups = React.useMemo(() => {
    const map: Record<string, { key: string; compoundId: string; compoundName: string; totalMg: string; vials: SerializedVialData[] }> = {};
    for (const v of vials) {
      const key = `${v.compoundId}-${v.totalMg}`;
      if (!map[key]) {
        map[key] = {
          key,
          compoundId: v.compoundId,
          compoundName: v.compoundName,
          totalMg: v.totalMg,
          vials: [],
        };
      }
      map[key].vials.push(v);
    }
    return Object.values(map);
  }, [vials]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const confirmDeleteVial = async (vialId: string) => {
    setDeletingVialId(null);
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteVialAction(vialId);
      if (result.ok) {
        const isMuted =
          typeof window !== 'undefined' &&
          typeof window.localStorage !== 'undefined' &&
          window.localStorage.getItem('peptides_sound_effects_enabled') === 'false';
        if (!isMuted) {
          getAudioPlayer().playNeedleSnap();
        }
      } else {
        setDeleteError(result.message || 'Failed to delete vial.');
      }
    });
  };

  if (vials.length === 0) {
    return (
      <div className={`rounded-xl border p-6 text-center backdrop-blur-md ${isRoomTemp ? 'border-amber-500/20 bg-amber-500/5' : 'border-sky-500/20 bg-sky-500/5'}`}>
        {isRoomTemp ? (
          <Thermometer className="mx-auto h-8 w-8 text-amber-400/60 animate-pulse" />
        ) : (
          <Snowflake className="mx-auto h-8 w-8 text-sky-400/60 animate-pulse" />
        )}
        <p className="mt-2 text-sm font-medium text-foreground">
          {isRoomTemp ? 'Room temp storage is empty' : 'Freezer is empty'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isRoomTemp ? 'Add unopened room temp vials to keep track of your inventory.' : 'Add dry vials to keep track of your lyophilized peptide inventory.'}
        </p>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-4">
      {deleteError && (
        <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {groups.map((group) => {
          const isExpanded = !!expandedGroups[group.key];
          const count = group.vials.length;
          const totalContentMg = count * parseFloat(group.totalMg);
          
          // Earliest expiry
          const activeVialsSorted = [...group.vials].sort((a, b) => {
            if (!a.expiresAt) return 1;
            if (!b.expiresAt) return -1;
            return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
          });
          const earliestExpiry = activeVialsSorted[0]?.expiresAt ? new Date(activeVialsSorted[0].expiresAt) : null;
          const isExpired = earliestExpiry ? earliestExpiry < now : false;
          
          return (
            <div
              key={group.key}
              className={`rounded-xl border backdrop-blur-md hover:shadow-lg transition-all duration-300 overflow-hidden ${
                isRoomTemp 
                  ? 'border-amber-200/20 bg-amber-400/5 dark:bg-amber-950/10' 
                  : 'border-sky-200/20 bg-sky-400/5 dark:bg-sky-950/10'
              }`}
            >
              {/* Header card summary */}
              <div
                onClick={() => toggleGroup(group.key)}
                className={`p-5 flex items-center justify-between cursor-pointer transition-colors duration-200 select-none ${
                  isRoomTemp 
                    ? 'hover:bg-amber-500/5 dark:hover:bg-amber-500/10' 
                    : 'hover:bg-sky-500/5 dark:hover:bg-sky-500/10'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Frosted dry vial display icon */}
                  <div className={`w-10 h-12 shrink-0 flex items-center justify-center relative rounded-md border shadow-inner ${
                    isRoomTemp 
                      ? 'bg-amber-500/10 border-amber-400/20' 
                      : 'bg-sky-500/10 border-sky-400/20'
                  }`}>
                    {isRoomTemp ? (
                      <Thermometer className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-amber-500/80" />
                    ) : (
                      <Snowflake className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-sky-400/80" />
                    )}
                    <svg viewBox="0 0 30 52" className="w-6 h-10 select-none filter drop-shadow">
                      {/* Cap */}
                      <rect x="9" y="1" width="12" height="4" className={isRoomTemp ? "fill-amber-300 stroke-amber-400" : "fill-sky-300 stroke-sky-400"} rx="0.5" strokeWidth="0.5" />
                      <rect x="7" y="5" width="16" height="3" className="fill-slate-400 stroke-slate-500" rx="0.5" strokeWidth="0.5" />
                      {/* Neck */}
                      <rect x="11" y="8" width="8" height="6" className="fill-transparent stroke-slate-400" strokeWidth="1" />
                      {/* Content (oil/solution vs powder cake) */}
                      {isRoomTemp ? (
                        <path d="M 5 30 L 25 30 L 25 44 L 5 44 Z" className="fill-amber-500/20 stroke-amber-400/20" strokeWidth="0.5" />
                      ) : (
                        <path d="M 6 40 Q 15 38 24 40 L 24 44 L 6 44 Z" className="fill-sky-100/70 stroke-sky-200" strokeWidth="0.5" />
                      )}
                      {/* Glass Body */}
                      <rect x="4" y="14" width="22" height="31" className={`fill-transparent ${isRoomTemp ? 'stroke-amber-300/40' : 'stroke-sky-300/40'}`} strokeWidth="1.2" rx="2" />
                    </svg>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm tracking-tight text-foreground">{group.compoundName}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                      {parseFloat(group.totalMg)} mg vials • <span className="text-foreground">{count} vial{count > 1 ? 's' : ''}</span> ({parseFloat(totalContentMg.toFixed(3))} mg total)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    {earliestExpiry && (
                      <p className={`text-[10px] ${isExpired ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                        {isExpired ? 'Expired' : 'Earliest Expiration'}: {formatDate(earliestExpiry.toISOString())}
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Reconstitute oldest vial
                      if (activeVialsSorted[0]) {
                        onReconstitute(activeVialsSorted[0]);
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow transition-all duration-200 ${
                      isRoomTemp 
                        ? 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700' 
                        : 'bg-sky-500 hover:bg-sky-600 active:bg-sky-700'
                    }`}
                  >
                    <Beaker className="h-3.5 w-3.5" />
                    {isRoomTemp ? 'Open / Puncture' : 'Reconstitute'}
                  </button>

                  <div className="text-muted-foreground">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </div>

              {/* Expanded vial list */}
              {isExpanded && (
                <div className={`border-t p-4 space-y-2.5 dark:bg-black/15 ${
                  isRoomTemp 
                    ? 'border-amber-200/10 bg-amber-500/[0.02]' 
                    : 'border-sky-200/10 bg-sky-500/[0.02]'
                }`}>
                  <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${
                    isRoomTemp 
                      ? 'text-amber-600/80 dark:text-amber-400/80' 
                      : 'text-sky-600/80 dark:text-sky-400/80'
                  }`}>
                    {isRoomTemp ? 'Room Temp Shelf Positions (Sorted by age/expiry)' : 'Freezer Shelf Positions (Sorted by age/expiry)'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeVialsSorted.map((v, idx) => {
                      const vExpired = v.expiresAt ? new Date(v.expiresAt) < new Date() : false;
                      return (
                        <div
                          key={v.id}
                          className={`flex items-center justify-between p-3 rounded-lg border bg-white/5 dark:bg-slate-900/40 transition-all duration-150 ${
                            isRoomTemp 
                              ? 'border-amber-200/10 hover:bg-amber-500/5 dark:hover:bg-amber-500/10' 
                              : 'border-sky-200/10 hover:bg-sky-500/5 dark:hover:bg-sky-500/10'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold ${isRoomTemp ? 'text-amber-500/80 dark:text-amber-400/80' : 'text-sky-400/80 dark:text-sky-300/80'}`}>Vial #{idx + 1}</span>
                              <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[80px]" title={v.id}>
                                ID: {v.id.substring(0, 8)}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                              <Calendar className={`h-3 w-3 ${isRoomTemp ? 'text-amber-500' : 'text-sky-400'}`} />
                              Expires: <span className={vExpired ? 'text-destructive font-semibold' : 'text-foreground/80'}>{formatDate(v.expiresAt)}</span>
                            </p>
                            <VialCostEditor vial={v} editLabel={`Edit cost for vial #${idx + 1}`} />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onReconstitute(v)}
                              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                                isRoomTemp 
                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-500/30' 
                                  : 'bg-sky-500/20 text-sky-700 dark:text-sky-300 hover:bg-sky-500/30'
                              }`}
                            >
                              {isRoomTemp ? 'Open' : 'Mix'}
                            </button>
                            {deletingVialId === v.id ? (
                              <div className="flex items-center gap-1 bg-background/95 dark:bg-slate-900/95 border border-sky-200/10 rounded-md p-0.5 animate-fade-in">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDeleteVial(v.id);
                                  }}
                                  className="text-[9px] font-bold text-destructive hover:bg-destructive/10 px-1 py-0.5 rounded transition-colors"
                                >
                                  Del?
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingVialId(null);
                                  }}
                                  className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[9px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeletingVialId(v.id)}
                                disabled={isPending}
                                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                title="Discard vial"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
