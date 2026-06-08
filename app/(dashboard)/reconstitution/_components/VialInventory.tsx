'use client';

import React, { useState, useEffect, useTransition } from 'react';
import type { SerializedVialData, VialBadge } from '@/lib/reconstitution/application/VialService';
import { reorderVialsAction } from '@/app/actions/reconstitution/reorder-vials';
import { deleteVialAction } from '@/app/actions/reconstitution/inventory-actions';
import { Trash2, AlertCircle } from 'lucide-react';
import { getCapColor } from '@/lib/reconstitution/domain/syringe';

// Re-exported as SerializedVial for backward compatibility with existing imports.
export type SerializedVial = SerializedVialData;

interface Props {
  vials: SerializedVial[];
  isRoomTemp?: boolean;
}

const BADGE_STYLES: Record<VialBadge, string> = {
  EXPIRED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30',
  EXPIRING_SOON: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
  LOW_INVENTORY: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30',
};

const BADGE_LABELS: Record<VialBadge, string> = {
  EXPIRED: 'Expired',
  EXPIRING_SOON: 'Expiring soon',
  LOW_INVENTORY: 'Low inventory',
};

function formatDate(isoStr: string | null): string {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}



export function VialInventory({ vials, isRoomTemp = false }: Props) {
  const [localVials, setLocalVials] = useState<SerializedVial[]>(vials);
  const [deletingVialId, setDeletingVialId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async (vialId: string) => {
    setDeletingVialId(null);
    setError(null);
    startTransition(async () => {
      const res = await deleteVialAction(vialId);
      if (!res.ok) {
        setError(res.message || 'Failed to delete vial.');
      }
    });
  };

  useEffect(() => {
    setLocalVials(vials);
  }, [vials]);

  if (vials.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {isRoomTemp ? 'No active room temperature vials in use.' : 'No active vials. Use the calculator above to reconstitute your first vial.'}
      </p>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newVials = [...localVials];
    const draggedItem = newVials[draggedIndex];
    newVials.splice(draggedIndex, 1);
    newVials.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    setLocalVials(newVials);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const vialIds = localVials.map((v) => v.id);
    const result = await reorderVialsAction({ vialIds });
    if (!result.ok) {
      console.error('Failed to save vial order:', result.message);
      setLocalVials(vials);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center justify-between gap-2 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[10px] hover:underline font-bold text-destructive shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Cabinet shelf structure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {localVials.map((vial, index) => {
          const remaining = parseFloat(vial.remainingMg);
          const total = parseFloat(vial.totalMg);
          const fillPercent = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

          const isExpired = vial.badges.includes('EXPIRED');
          const isLow = vial.badges.includes('LOW_INVENTORY');

          // Age and Expiry Override Calculations
          const nowTime = Date.now();
          const reconstitutedTime = vial.reconstitutedAt ? new Date(vial.reconstitutedAt).getTime() : null;
          const expiresTime = vial.expiresAt ? new Date(vial.expiresAt).getTime() : null;

          let ageFactor = 0;
          let isOverrideExpired = false;

          if (reconstitutedTime && expiresTime) {
            if (expiresTime <= reconstitutedTime) {
              isOverrideExpired = true;
              ageFactor = 1.0;
            } else {
              const totalDuration = expiresTime - reconstitutedTime;
              const elapsedTime = nowTime - reconstitutedTime;
              ageFactor = totalDuration <= 0 ? 1.0 : Math.max(0, Math.min(elapsedTime / totalDuration, 1.2));
            }
          } else if (expiresTime) {
            if (expiresTime < nowTime) {
              ageFactor = 1.0;
            } else {
              const daysLeft = vial.daysUntilExpiry ?? 14;
              ageFactor = Math.max(0, Math.min(1 - daysLeft / 14, 1.2));
            }
          }

          const displayAgeFactor = Math.min(ageFactor, 1.2);
          const blurAmount = displayAgeFactor > 0.3 ? (displayAgeFactor - 0.3) * 3 : 0;
          const grayscaleAmount = displayAgeFactor > 0.3 ? (displayAgeFactor - 0.3) * 100 : 0;
          const filterStyle = blurAmount > 0 ? `blur(${blurAmount.toFixed(1)}px) grayscale(${grayscaleAmount.toFixed(0)}%)` : 'none';

          let fluidColorClass = 'fill-primary/30 stroke-primary';
          let capColor = getCapColor(vial.compoundSlug, vial.compoundId);
          let cardBorderClass = 'border-border';
          let glowStyle = '';

          if (isExpired || isOverrideExpired) {
            fluidColorClass = 'fill-slate-400/25 stroke-slate-400';
            capColor = 'hsl(0 0% 60%)'; // Muted cap
            cardBorderClass = 'border-destructive/20 dark:border-destructive/30';
          } else if (vial.insufficientMedication) {
            fluidColorClass = 'fill-red-500/30 stroke-red-500';
            cardBorderClass = 'border-destructive/40 dark:border-destructive/50';
            glowStyle = 'shadow-[0_0_12px_rgba(239,68,68,0.15)] animate-[pulse_2s_infinite]';
          } else if (isLow || vial.potentialDrawWaste) {
            fluidColorClass = 'fill-warning/35 stroke-warning';
            cardBorderClass = 'border-warning/30 dark:border-warning/20';
            glowStyle = 'shadow-[0_0_10px_rgba(245,158,11,0.1)]';
          }

          // SVG parameters
          const bodyHeight = 32;
          const fluidHeight = (fillPercent / 100) * bodyHeight;
          const fluidY = 44 - fluidHeight;

          return (
            <div
              key={vial.id}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e)}
              onDragEnd={handleDragEnd}
              className={`relative rounded-xl border p-5 bg-card/65 dark:bg-card/45 backdrop-blur-md hover:scale-[1.02] hover:shadow-lg transition-all duration-300 flex flex-col justify-between group cursor-move ${cardBorderClass} ${glowStyle} ${
                draggedIndex === index ? 'opacity-40 scale-95 border-dashed border-primary/45' : ''
              }`}
            >
              {/* Actions in top-right */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {deletingVialId === vial.id ? (
                  <div className="flex items-center gap-1 bg-background/90 dark:bg-slate-900/90 border border-border rounded-md px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(vial.id);
                      }}
                      className="text-[10px] font-bold text-destructive hover:bg-destructive/10 px-1 py-0.5 rounded transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingVialId(null);
                      }}
                      className="text-[10px] font-medium text-muted-foreground hover:bg-muted px-1 py-0.5 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingVialId(vial.id);
                      }}
                      disabled={isPending}
                      className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Discard vial"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="text-slate-400 dark:text-slate-500 cursor-grab active:cursor-grabbing p-1" aria-hidden="true">
                      <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
                        <circle cx="2" cy="3" r="1.5" />
                        <circle cx="2" cy="9" r="1.5" />
                        <circle cx="2" cy="15" r="1.5" />
                        <circle cx="10" cy="3" r="1.5" />
                        <circle cx="10" cy="9" r="1.5" />
                        <circle cx="10" cy="15" r="1.5" />
                      </svg>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-start gap-4">
                {/* Visual SVG Vial */}
                <div className="w-12 h-16 shrink-0 flex items-center justify-center select-none filter drop-shadow group-hover:drop-shadow-md transition-all duration-300" aria-hidden="true">
                  <svg viewBox="0 0 30 52" className="w-full h-full" role="img" aria-label={`Vial fill: ${fillPercent.toFixed(0)}%`}>
                    {/* Cap (style-bound HSL color fill) */}
                    <rect
                      x="9"
                      y="1"
                      width="12"
                      height="4"
                      style={{ fill: capColor }}
                      rx="0.5"
                      strokeWidth="0.5"
                      className="stroke-black/10 dark:stroke-white/10 group-hover:opacity-95 transition-opacity duration-300"
                    />
                    <rect x="7" y="5" width="16" height="3" className="fill-slate-500 stroke-slate-600 dark:fill-slate-600 dark:stroke-slate-500 group-hover:fill-primary/50 transition-colors duration-300" rx="0.5" strokeWidth="0.5" />

                    {/* Neck */}
                    <rect x="11" y="8" width="8" height="6" className="fill-transparent stroke-slate-400 dark:stroke-slate-600 group-hover:stroke-primary/50 transition-colors duration-300" strokeWidth="1" />

                    {/* Liquid Fill */}
                    {fluidHeight > 0 && (
                      <rect
                        x="5"
                        y={fluidY}
                        width="20"
                        height={fluidHeight}
                        className={`${fluidColorClass} transition-all duration-300`}
                        style={{
                          filter: filterStyle,
                          willChange: displayAgeFactor > 0.3 ? 'filter' : 'auto',
                        }}
                        strokeWidth="0"
                      />
                    )}

                    {/* Glass Body */}
                    <rect
                      x="4"
                      y="14"
                      width="22"
                      height="31"
                      className="fill-transparent stroke-slate-400 dark:stroke-slate-600 group-hover:stroke-primary/50 transition-colors duration-300"
                      strokeWidth="1.2"
                      rx="2"
                    />
                    
                    {/* Bottom seal */}
                    <line x1="6" y1="45" x2="24" y2="45" className="stroke-slate-400 dark:stroke-slate-600 group-hover:stroke-primary/50 transition-colors duration-300" strokeWidth="1.2" />
                  </svg>
                </div>

                {/* Info Text */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-sm tracking-tight truncate">
                    {vial.compoundName}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    {Number(vial.remainingMg).toFixed(2)} mg remaining of {Number(vial.totalMg).toFixed(2)} mg
                  </p>
                  {vial.bacWaterMl && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {Number(vial.bacWaterMl).toFixed(1)} mL {isRoomTemp ? 'volume' : 'BAC water'}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Expires {formatDate(vial.expiresAt)}
                  </p>
                </div>
              </div>

              {/* Status and Warning Alerts Area */}
              <div className="mt-4 pt-3 border-t border-border space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {isOverrideExpired && (
                    <span
                      className="text-[9px] rounded-full px-2 py-0.5 border font-semibold tracking-wide uppercase bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"
                      role="status"
                    >
                      Expired (Override)
                    </span>
                  )}
                  {vial.badges.map((badge) => (
                    <span
                      key={badge}
                      className={`text-[9px] rounded-full px-2 py-0.5 border font-semibold tracking-wide uppercase ${BADGE_STYLES[badge]}`}
                    >
                      {BADGE_LABELS[badge]}
                    </span>
                  ))}

                  {/* Prioritized Warning Indicators */}
                  {vial.insufficientMedication ? (
                    <span
                      className="text-[9px] rounded-full px-2 py-0.5 border font-semibold tracking-wide uppercase bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 flex items-center gap-1"
                      role="alert"
                      aria-live="polite"
                    >
                      <span>⚠️</span> Insufficient Medication
                    </span>
                  ) : vial.potentialDrawWaste ? (
                    <span
                      className="text-[9px] rounded-full px-2 py-0.5 border font-semibold tracking-wide uppercase bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30 flex items-center gap-1 cursor-help"
                      title={`Remaining medication is less than your largest scheduled dose (${vial.maxDoseFormatted}). Smaller doses can still be drawn.`}
                      role="status"
                      aria-live="polite"
                    >
                      <span>⚠️</span> Potential Draw Waste
                    </span>
                  ) : null}
                </div>

                {/* Subtext description for warning states */}
                {vial.insufficientMedication && (
                  <p className="text-[10px] text-red-600 dark:text-red-400 leading-tight">
                    No active protocol dose can be drawn from this vial.
                  </p>
                )}
                {!vial.insufficientMedication && vial.potentialDrawWaste && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight" aria-live="polite">
                    Less than largest scheduled dose ({vial.maxDoseFormatted}). Smaller doses can still be drawn.
                  </p>
                )}
                
                {/* Fill Percentage Deck */}
                <div className="flex items-center justify-between text-[10px] font-semibold text-primary/80 dark:text-primary/70 mt-2">
                  <span>Shelf Pos #{index + 1}</span>
                  <span>{fillPercent.toFixed(0)}% Filled</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual cabinet shelf shadow deck (wood/metal look with soft lighting) */}
      <div className="relative h-4 w-full -mt-2 rounded-lg overflow-hidden border-t border-white/20 shadow-md">
        {/* Wooden top/face of shelf */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#8b5a2b] via-[#a0522d] to-[#8b5a2b] dark:from-[#3e2723] dark:via-[#4e342e] dark:to-[#3e2723] opacity-90" />
        {/* Glass highlight overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
        {/* Polished metal edge trim */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400 dark:from-slate-700 dark:via-slate-500 dark:to-slate-700" />
      </div>
    </div>
  );
}
