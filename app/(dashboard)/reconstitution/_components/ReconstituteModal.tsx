'use client';

import React, { useState, useMemo, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Decimal from 'decimal.js';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import type { Compound } from '@/lib/reference/domain/types';
import { ReconstitutionCalculator } from '@/lib/reconstitution/domain/ReconstitutionCalculator';
import { WarningPolicy, type WarningType } from '@/lib/reconstitution/domain/WarningPolicy';
import { reconstituteDryVialAction } from '@/app/actions/reconstitution/inventory-actions';
import { SyringePreview } from './SyringePreview';
import { X, AlertTriangle, Calendar, Droplet, Beaker } from 'lucide-react';
import { getVolumePerUnit } from '@/lib/reconstitution/domain/syringe';

interface Props {
  vial: SerializedVialData;
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  initialSyringeStandard?: 'U100' | 'U40';
  initialSyringeSize?: '0.3' | '0.5' | '1.0';
  onSuccess?: () => void;
  onClose: () => void;
}

const WARNING_LABELS: Record<WarningType, string> = {
  HIGH_VOLUME: 'Injection volume exceeds 1.5 mL — consider diluting further.',
  LOW_BAC_VOLUME: 'BAC water volume below 0.5 mL — vial may be difficult to draw from.',
  ABOVE_REFERENCE_RANGE: "Dose exceeds the compound's reference high range.",
  EXCEEDS_VIAL_CAPACITY: 'Required volume exceeds BAC water added — physically impossible.',
};

function isPositiveDecimalString(s: string): boolean {
  if (!s || s.trim() === '') return false;
  try {
    return new Decimal(s).gt(0);
  } catch {
    return false;
  }
}

export function ReconstituteModal({
  vial,
  compounds,
  initialSyringeStandard = 'U100',
  initialSyringeSize = '1.0',
  onSuccess,
  onClose,
}: Props) {
  const [bacWaterMl, setBacWaterMl] = useState('');
  const [targetDoseMcg, setTargetDoseMcg] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const selectedCompound = compounds.find((c) => c.id === vial.compoundId) ?? null;
  const profile = selectedCompound?.profile ?? null;

  const isRoomTemp = useMemo(() => {
    return profile?.fridgeShelfLifeMonths === null && profile?.freezerShelfLifeMonths === null;
  }, [profile]);

  // Retrieve shelf lives and typical dosing from profile
  const shelfLifeDays = profile?.reconstitutedShelfLifeDays ?? 14;

  const hasInitialized = React.useRef(false);

  useEffect(() => {
    if (isMounted && profile && !hasInitialized.current) {
      setBacWaterMl(isRoomTemp ? '10.0' : '2.0');
      const now = new Date();
      const defaultDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + shelfLifeDays));
      setExpiresAt(defaultDate.toISOString().split('T')[0]);
      hasInitialized.current = true;
    }
  }, [isMounted, profile, isRoomTemp, shelfLifeDays]);

  const profileHighMcg = useMemo(() => {
    if (!profile?.dosingHigh) return undefined;
    const d = profile.dosingHigh as { amount: string; unit: string };
    if (d.unit === 'mcg') return new Decimal(d.amount);
    if (d.unit === 'mg') return new Decimal(d.amount).times(1000);
    return undefined;
  }, [profile]);

  const profileTypicalMcg = useMemo(() => {
    if (!profile?.dosingTypical) return undefined;
    const d = profile.dosingTypical as { amount: string; unit: string };
    if (d.unit === 'mcg') return new Decimal(d.amount);
    if (d.unit === 'mg') return new Decimal(d.amount).times(1000);
    return undefined;
  }, [profile]);

  // Set default expiration date when BAC Water is entered
  const handleBacWaterChange = (val: string) => {
    setBacWaterMl(val);
    if (isPositiveDecimalString(val) && !expiresAt) {
      const now = new Date();
      const defaultDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + shelfLifeDays));
      setExpiresAt(defaultDate.toISOString().split('T')[0]);
    }
  };

  // SCALING TRICK: Room-temp compounds (e.g., testosterone) are measured in mg,
  // but ReconstitutionCalculator operates in mcg. To reuse the calculator logic,
  // we scale the mg-based target dose by 1000 to obtain its mcg equivalent.
  // The 1000x scaling factor cancels out in the final syringe units / volume math.
  const targetDoseMcgComputed = useMemo(() => {
    if (!targetDoseMcg) return '';
    if (isRoomTemp) {
      try {
        return new Decimal(targetDoseMcg).times(1000).toString();
      } catch {
        return '';
      }
    }
    return targetDoseMcg;
  }, [targetDoseMcg, isRoomTemp]);

  const useTypicalDose = () => {
    if (isRoomTemp) {
      if (profile?.dosingTypical) {
        setTargetDoseMcg(String((profile.dosingTypical as any).amount));
      }
    } else {
      if (profileTypicalMcg) {
        setTargetDoseMcg(profileTypicalMcg.toString());
      }
    }
  };

  // Live calculations
  const { calcResult, warnings } = useMemo(() => {
    const mlOk = isPositiveDecimalString(bacWaterMl);
    const mcgOk = isPositiveDecimalString(targetDoseMcgComputed);

    if (!mlOk || !mcgOk) return { calcResult: null, warnings: [] };

    try {
      const calc = ReconstitutionCalculator.calculate({
        totalMg: new Decimal(vial.totalMg),
        bacWaterMl: new Decimal(bacWaterMl),
        targetDoseMcg: new Decimal(targetDoseMcgComputed),
        syringeStandard: initialSyringeStandard,
      });

      const w = WarningPolicy.evaluate({
        injectionVolMl: calc.injectionVolMl,
        bacWaterMl: new Decimal(bacWaterMl),
        targetDoseMcg: new Decimal(targetDoseMcgComputed),
        profileHighMcg,
      });

      return {
        calcResult: {
          concentrationMgPerMl: calc.concentrationMgPerMl,
          concentrationMcgPerMl: calc.concentrationMcgPerMl,
          injectionVolMl: calc.injectionVolMl,
          syringeUnitsPerDose: calc.syringeUnitsPerDose,
        },
        warnings: w,
      };
    } catch {
      return { calcResult: null, warnings: [] };
    }
  }, [vial.totalMg, bacWaterMl, targetDoseMcg, profileHighMcg, initialSyringeStandard]);

  const displayedUnits = useMemo(() => {
    if (!calcResult) return 0;
    return calcResult.syringeUnitsPerDose.toNumber();
  }, [calcResult]);

  const maxUnits = useMemo(() => {
    if (initialSyringeStandard === 'U100') {
      if (initialSyringeSize === '0.3') return 30;
      if (initialSyringeSize === '0.5') return 50;
      return 100;
    } else {
      if (initialSyringeSize === '0.3') return 12;
      if (initialSyringeSize === '0.5') return 20;
      return 40;
    }
  }, [initialSyringeStandard, initialSyringeSize]);

  const capacityExceeded = !!(calcResult && displayedUnits > maxUnits);

  const handleDragUnits = (draggedUnits: number) => {
    if (!isPositiveDecimalString(bacWaterMl)) return;
    try {
      const conversionFactor = getVolumePerUnit(initialSyringeStandard);
      const concentrationMcgPerMl = new Decimal(vial.totalMg).dividedBy(new Decimal(bacWaterMl)).times(1000);
      const doseMcg = new Decimal(draggedUnits).times(conversionFactor).times(concentrationMcgPerMl);
      const snappedDose = doseMcg.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      if (isRoomTemp) {
        // Reverse scaling trick: Convert mcg back to mg for displayed target dose in the UI
        setTargetDoseMcg(doseMcg.dividedBy(1000).toFixed(1));
      } else {
        setTargetDoseMcg(snappedDose.toString());
      }
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPositiveDecimalString(bacWaterMl)) return;

    setError(null);
    startTransition(async () => {
      const result = await reconstituteDryVialAction({
        vialId: vial.id,
        bacWaterMl,
        expiresAt: expiresAt || undefined,
      });

      if (result.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.message || 'Failed to reconstitute vial.');
      }
    });
  };

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden rounded-2xl border border-white/20 dark:border-slate-800/40 bg-white/10 dark:bg-slate-950/20 backdrop-blur-xl shadow-2xl animate-scale-in">
        
        {/* Form Panel */}
        <form onSubmit={handleSubmit} className="flex-1 p-6 overflow-y-auto space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full">
                {isRoomTemp ? 'Puncture Wizard' : 'Reconstitution Wizard'}
              </span>
              <h2 className="text-xl font-bold text-foreground mt-2">
                {isRoomTemp ? `Puncture / Open ${vial.compoundName}` : `Mix ${vial.compoundName}`} ({parseFloat(vial.totalMg)} mg)
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {isRoomTemp ? 'Oil-based vial will transition to open/active state.' : 'Lyophilized powder will transition to active refrigerated state.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-md animate-[fadeIn_0.2s_ease-out]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Step 1: Reconstitution water quantity */}
            <div>
              <label htmlFor="reconstitute-water" className="block text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                <Droplet className="h-3.5 w-3.5 text-sky-400" />
                {isRoomTemp ? 'Vial Volume (mL)' : 'Bacteriostatic Water volume to add (mL)'}
              </label>
              <input
                id="reconstitute-water"
                type="number"
                step="any"
                min="0"
                required
                placeholder={isRoomTemp ? 'E.g., 10.0' : 'E.g., 2.0'}
                value={bacWaterMl}
                onChange={(e) => handleBacWaterChange(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Step 2: Protocol Target Dose check */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="reconstitute-dose" className="block text-xs font-semibold text-foreground/80">
                  Target Dose ({isRoomTemp ? 'mg' : 'mcg'})
                </label>
                {profile?.dosingTypical && (
                  <button
                    type="button"
                    onClick={useTypicalDose}
                    className="text-[10px] text-sky-500 hover:underline font-bold"
                  >
                    Use standard typical dose ({(profile.dosingTypical as any).amount} {(profile.dosingTypical as any).unit})
                  </button>
                )}
              </div>
              <input
                id="reconstitute-dose"
                type="number"
                step="any"
                min="0"
                required
                placeholder={isRoomTemp ? 'E.g., 50, 100' : 'E.g., 250, 500'}
                value={targetDoseMcg}
                onChange={(e) => setTargetDoseMcg(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Step 3: Date control */}
            <div>
              <label htmlFor="reconstitute-expiry" className="block text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                {isRoomTemp ? 'Expiration / Discard Date' : 'Reconstituted Expiration Date'}
              </label>
              <input
                id="reconstitute-expiry"
                type="date"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Defaults to {shelfLifeDays} days stability limit from today based on {isRoomTemp ? 'puncture safety window' : 'refrigerated shelf life'}.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-bold border border-input bg-background hover:bg-muted text-foreground rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !calcResult || (!isRoomTemp && capacityExceeded)}
              className="flex-1 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-1"
            >
              <Beaker className="h-3.5 w-3.5" />
              {isPending ? 'Saving...' : isRoomTemp ? 'Confirm Open' : 'Complete Reconstitution'}
            </button>
          </div>
        </form>

        {/* Live Metrics/Preview Panel */}
        <div className="flex-1 p-6 bg-slate-500/5 dark:bg-black/20 border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {isRoomTemp ? 'Live Puncture Metrics' : 'Live Reconstitution Metrics'}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isRoomTemp
                ? 'Calculated in real-time based on target dose and vial volume.'
                : 'Calculated in real-time based on target dose and water.'}
            </p>
          </div>

          <div>
            {calcResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 border border-white/10 rounded-lg p-4 bg-background/30">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Concentration</span>
                    <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                      {calcResult.concentrationMgPerMl.toFixed(2)} mg/mL
                    </div>
                  </div>
                  {isRoomTemp ? (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">Target Dose</span>
                      <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                        {parseFloat(targetDoseMcg || '0').toFixed(1)} mg
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">Concentration (mcg)</span>
                      <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                        {calcResult.concentrationMcgPerMl.toFixed(0)} mcg/mL
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Injection Vol</span>
                    <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                      {calcResult.injectionVolMl.toFixed(3)} mL
                    </div>
                  </div>
                  {!isRoomTemp && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-medium">Syringe Pull</span>
                      <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                        {displayedUnits.toFixed(1)} Units
                      </div>
                    </div>
                  )}
                </div>

                {/* Warnings list */}
                {warnings.length > 0 && (
                  <div className="space-y-2">
                    {warnings.map((w) => (
                      <div key={w} className="flex gap-2 p-2.5 rounded bg-warning/10 border border-warning/20 text-warning text-[10px] font-medium leading-tight">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>{WARNING_LABELS[w]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!isRoomTemp && capacityExceeded && (
                  <div className="flex gap-2 p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-medium leading-tight">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Dose exceeds selected syringe capacity of {maxUnits} Units.</span>
                  </div>
                )}

                {/* Syringe Preview or Room Temp Volume Indicator */}
                {isRoomTemp ? (
                  <div className="mt-6 p-4 rounded-xl border border-sky-400/20 bg-sky-500/5 text-center space-y-3">
                    <div className="text-[10px] text-sky-400 uppercase font-bold tracking-wider">
                      Recommended Oil/IM Draw
                    </div>
                    <div className="text-3xl font-extrabold text-foreground font-mono">
                      {calcResult.injectionVolMl.toFixed(2)} <span className="text-base font-normal text-muted-foreground">mL</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      Draw directly using a standard 1.0 mL or 3.0 mL syringe. Oil-based solutions should be injected slowly.
                    </p>
                    <div className="text-[9px] text-muted-foreground/60 italic mt-2">
                      Note: Room-temperature oil calculation uses the same volume engine as a temporary measure.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex justify-center">
                    <div className="w-[180px]">
                      <SyringePreview
                        units={displayedUnits}
                        warnings={warnings}
                        syringeStandard={initialSyringeStandard}
                        syringeSize={initialSyringeSize}
                        onChangeUnits={handleDragUnits}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center border border-dashed border-sky-400/20 rounded-lg text-center p-4">
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Enter {isRoomTemp ? 'vial volume' : 'Bacteriostatic Water volume'} and target dose to preview drawing metrics.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
