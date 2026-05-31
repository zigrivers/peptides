'use client';

import React, { useState, useMemo, useTransition } from 'react';
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

  const selectedCompound = compounds.find((c) => c.id === vial.compoundId) ?? null;
  const profile = selectedCompound?.profile ?? null;

  // Retrieve shelf lives and typical dosing from profile
  const shelfLifeDays = profile?.reconstitutedShelfLifeDays ?? 14;

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

  const useTypicalDose = () => {
    if (!profileTypicalMcg) return;
    setTargetDoseMcg(profileTypicalMcg.toString());
  };

  // Live calculations
  const { calcResult, warnings } = useMemo(() => {
    const mlOk = isPositiveDecimalString(bacWaterMl);
    const mcgOk = isPositiveDecimalString(targetDoseMcg);

    if (!mlOk || !mcgOk) return { calcResult: null, warnings: [] };

    try {
      const calc = ReconstitutionCalculator.calculate({
        totalMg: new Decimal(vial.totalMg),
        bacWaterMl: new Decimal(bacWaterMl),
        targetDoseMcg: new Decimal(targetDoseMcg),
        syringeStandard: initialSyringeStandard,
      });

      const w = WarningPolicy.evaluate({
        injectionVolMl: calc.injectionVolMl,
        bacWaterMl: new Decimal(bacWaterMl),
        targetDoseMcg: new Decimal(targetDoseMcg),
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

  const capacityExceeded = calcResult && displayedUnits > maxUnits;

  const handleDragUnits = (draggedUnits: number) => {
    if (!isPositiveDecimalString(bacWaterMl)) return;
    try {
      const conversionFactor = getVolumePerUnit(initialSyringeStandard);
      const concentrationMcgPerMl = new Decimal(vial.totalMg).dividedBy(new Decimal(bacWaterMl)).times(1000);
      const doseMcg = new Decimal(draggedUnits).times(conversionFactor).times(concentrationMcgPerMl);
      const snappedDose = doseMcg.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
      setTargetDoseMcg(snappedDose);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden rounded-2xl border border-white/20 dark:border-slate-800/40 bg-white/10 dark:bg-slate-950/20 backdrop-blur-xl shadow-2xl animate-scale-in">
        
        {/* Form Panel */}
        <form onSubmit={handleSubmit} className="flex-1 p-6 overflow-y-auto space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full">
                Reconstitution Wizard
              </span>
              <h2 className="text-xl font-bold text-foreground mt-2">
                Mix {vial.compoundName} ({parseFloat(vial.totalMg)} mg)
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Lyophilized powder will transition to active refrigerated state.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* BAC Water input */}
            <div>
              <label htmlFor="bacWaterMl" className="block text-xs font-semibold text-foreground/80 mb-1.5 flex items-center gap-1.5">
                <Droplet className="h-3.5 w-3.5 text-sky-400" />
                Bacteriostatic Water (mL)
              </label>
              <input
                id="bacWaterMl"
                type="number"
                step="any"
                required
                placeholder="E.g., 2.0"
                value={bacWaterMl}
                onChange={(e) => handleBacWaterChange(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              />
            </div>

            {/* Target Dose input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="targetDoseMcg" className="block text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                  <Beaker className="h-3.5 w-3.5 text-sky-400" />
                  Target Dose (mcg)
                </label>
                {profileTypicalMcg && (
                  <button
                    type="button"
                    onClick={useTypicalDose}
                    className="text-[10px] font-semibold text-sky-500 hover:text-sky-600 bg-sky-500/5 px-2 py-0.5 rounded"
                  >
                    Use Typical ({profileTypicalMcg.toString()} mcg)
                  </button>
                )}
              </div>
              <input
                id="targetDoseMcg"
                type="number"
                step="any"
                placeholder="E.g., 250"
                value={targetDoseMcg}
                onChange={(e) => setTargetDoseMcg(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Expiration date */}
            <div>
              <label htmlFor="expiresAt" className="block text-xs font-semibold text-foreground/80 mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-sky-400" />
                Refrigerated Expiration Date
              </label>
              <input
                id="expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Defaults to today + {shelfLifeDays} days (standard stability under refrigeration).
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-bold border border-input bg-background hover:bg-muted text-foreground rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !isPositiveDecimalString(bacWaterMl)}
              className="flex-1 py-2.5 text-xs font-bold bg-sky-500 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-1.5"
            >
              {isPending ? 'Reconstituting...' : 'Reconstitute & Activate'}
            </button>
          </div>
        </form>

        {/* Live Calculation & Preview Panel */}
        <div className="w-full md:w-[360px] bg-sky-500/[0.03] dark:bg-black/20 border-t md:border-t-0 md:border-l border-white/10 p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-xs font-bold text-sky-500 uppercase tracking-wider">
              Live Calibration Results
            </h3>

            {calcResult ? (
              <div className="space-y-5">
                {/* Concentration card */}
                <div className="rounded-lg bg-sky-500/5 dark:bg-white/5 border border-sky-400/20 p-4">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Concentration</span>
                  <div className="text-lg font-bold text-foreground mt-1 font-mono">
                    {calcResult.concentrationMgPerMl.toFixed(2)} mg/mL
                  </div>
                  <div className="text-xs text-sky-600 dark:text-sky-400 font-semibold font-mono mt-0.5">
                    ({calcResult.concentrationMcgPerMl.toFixed(0)} mcg/mL)
                  </div>
                </div>

                {/* Draw metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Injection Vol</span>
                    <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                      {calcResult.injectionVolMl.toFixed(3)} mL
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Syringe Pull</span>
                    <div className="text-sm font-bold text-foreground mt-0.5 font-mono">
                      {displayedUnits.toFixed(1)} Units
                    </div>
                  </div>
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

                {capacityExceeded && (
                  <div className="flex gap-2 p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-medium leading-tight">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Dose exceeds selected syringe capacity of {maxUnits} Units.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center border border-dashed border-sky-400/20 rounded-lg text-center p-4">
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Enter Bacteriostatic Water volume and target dose to preview drawing metrics.
                </p>
              </div>
            )}
          </div>

          {/* Syringe Preview Panel */}
          {calcResult && (
            <div className="mt-6 pt-6 border-t border-white/10 flex justify-center">
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
      </div>
    </div>
  );
}
