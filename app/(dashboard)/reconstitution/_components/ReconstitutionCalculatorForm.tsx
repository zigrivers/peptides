'use client';

import React, { useState, useMemo } from 'react';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from '@/lib/reconstitution/domain/ReconstitutionCalculator';
import { WarningPolicy, type WarningType } from '@/lib/reconstitution/domain/WarningPolicy';
import { saveVialAction } from '@/app/actions/reconstitution/save-vial';
import { saveSyringePreferencesAction } from '@/app/actions/reconstitution/save-syringe-preferences';
import type { Compound } from '@/lib/reference/domain/types';
import { SyringePreview } from './SyringePreview';
import { ReconstitutionRehearsal } from './ReconstitutionRehearsal';
import { getVolumePerUnit } from '@/lib/reconstitution/domain/syringe';

interface Props {
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  initialCompoundId?: string;
  initialTotalMg?: string;
  initialBacWaterMl?: string;
  initialTargetDoseMcg?: string;
  initialSyringeStandard?: 'U100' | 'U40';
  initialSyringeSize?: '0.3' | '0.5' | '1.0';
  subjectUserId?: string;
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

export function ReconstitutionCalculatorForm({
  compounds,
  initialCompoundId = '',
  initialTotalMg = '',
  initialBacWaterMl = '',
  initialTargetDoseMcg = '',
  initialSyringeStandard = 'U100',
  initialSyringeSize = '1.0',
  subjectUserId,
}: Props) {
  const [compoundId, setCompoundId] = useState(initialCompoundId);
  const [totalMg, setTotalMg] = useState(initialTotalMg);
  const [bacWaterMl, setBacWaterMl] = useState(initialBacWaterMl);
  const [targetDoseMcg, setTargetDoseMcg] = useState(initialTargetDoseMcg);
  const [expiresAt, setExpiresAt] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  const [syringeStandard, setSyringeStandard] = useState<'U100' | 'U40'>(initialSyringeStandard);
  const [syringeSize, setSyringeSize] = useState<'0.3' | '0.5' | '1.0'>(initialSyringeSize);
  const [isRehearsalOpen, setIsRehearsalOpen] = useState(false);

  const handleSyringePrefsChange = async (std: 'U100' | 'U40', sz: '0.3' | '0.5' | '1.0') => {
    try {
      await saveSyringePreferencesAction(std, sz);
    } catch {
      // fallback silently
    }
  };

  const selectedCompound = compounds.find((c) => c.id === compoundId) ?? null;
  const profile = selectedCompound?.profile ?? null;

  const profileHighMcg = useMemo(() => {
    if (!profile?.dosingHigh) return undefined;
    const d = profile.dosingHigh;
    if (d.unit === 'mcg') return new Decimal(d.amount);
    if (d.unit === 'mg') return new Decimal(d.amount).times(1000);
    return undefined;
  }, [profile]);

  const profileTypicalMcg = useMemo(() => {
    if (!profile?.dosingTypical) return undefined;
    const d = profile.dosingTypical;
    if (d.unit === 'mcg') return new Decimal(d.amount);
    if (d.unit === 'mg') return new Decimal(d.amount).times(1000);
    return undefined;
  }, [profile]);

  // Derived state — recomputed each render so it's never stale
  const { calcResult, warnings } = useMemo(() => {
    const mgOk = isPositiveDecimalString(totalMg);
    const mlOk = isPositiveDecimalString(bacWaterMl);
    const mcgOk = isPositiveDecimalString(targetDoseMcg);

    if (!mgOk || !mlOk || !mcgOk) return { calcResult: null, warnings: [] };

    try {
      const calc = ReconstitutionCalculator.calculate({
        totalMg: new Decimal(totalMg),
        bacWaterMl: new Decimal(bacWaterMl),
        targetDoseMcg: new Decimal(targetDoseMcg),
        syringeStandard,
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
  }, [totalMg, bacWaterMl, targetDoseMcg, profileHighMcg, syringeStandard]);

  const displayedUnits = useMemo(() => {
    if (!calcResult) return new Decimal(0);
    return calcResult.syringeUnitsPerDose;
  }, [calcResult]);

  const maxUnits = useMemo(() => {
    if (syringeStandard === 'U100') {
      if (syringeSize === '0.3') return 30;
      if (syringeSize === '0.5') return 50;
      return 100;
    } else {
      if (syringeSize === '0.3') return 12;
      if (syringeSize === '0.5') return 20;
      return 40;
    }
  }, [syringeStandard, syringeSize]);

  const capacityExceeded = calcResult && displayedUnits.gt(maxUnits);

  const handleDragUnits = (draggedUnits: number) => {
    if (!isPositiveDecimalString(totalMg) || !isPositiveDecimalString(bacWaterMl)) return;
    try {
      const conversionFactor = getVolumePerUnit(syringeStandard);
      const concentrationMcgPerMl = new Decimal(totalMg).dividedBy(new Decimal(bacWaterMl)).times(1000);
      const doseMcg = new Decimal(draggedUnits).times(conversionFactor).times(concentrationMcgPerMl);
      const snappedDose = doseMcg.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
      setTargetDoseMcg(snappedDose);
    } catch {
      // ignore
    }
  };

  const useTypicalDose = () => {
    if (!profileTypicalMcg) return;
    setTargetDoseMcg(profileTypicalMcg.toString());
  };

  const handleSave = async () => {
    if (!compoundId || !totalMg || !bacWaterMl) return;
    setSaveState('saving');
    setSaveError('');
    const res = await saveVialAction({
      compoundId,
      totalMg,
      bacWaterMl,
      expiresAt: expiresAt || undefined,
      subjectUserId,
    });
    if (res.ok) {
      setSaveState('saved');
      setTotalMg('');
      setBacWaterMl('');
      setTargetDoseMcg('');
      setExpiresAt('');
    } else {
      setSaveState('error');
      setSaveError(res.error);
    }
  };

  const canSave = compoundId && totalMg && bacWaterMl && saveState !== 'saving';

  const resetSaveState = () => {
    if (saveState !== 'idle') setSaveState('idle');
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
    >
      {/* Compound selector */}
      <div>
        <label htmlFor="compound-select" className="block text-sm font-medium text-foreground mb-1">Compound</label>
        <select
          id="compound-select"
          value={compoundId}
          onChange={(e) => {
            setCompoundId(e.target.value);
            resetSaveState();
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
        >
          <option value="">Select a compound…</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Reference dosing chips */}
      {profile && (
        <div className="rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20 px-4 py-3">
          <p className="text-xs font-semibold text-primary mb-2">Reference Dosing</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-muted-foreground">
              Low:{' '}
              <span className="font-medium text-foreground font-mono">
                {profile.dosingLow.amount}</span> <span className="text-muted-foreground text-xs">{profile.dosingLow.unit}</span>
            </span>
            <span className="text-muted-foreground">
              Typical:{' '}
              <button
                type="button"
                onClick={useTypicalDose}
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 font-mono"
                title="Use typical dose"
              >
                {profile.dosingTypical.amount}
              </button>{' '}
              <span className="text-muted-foreground text-xs">{profile.dosingTypical.unit}</span>
            </span>
            <span className="text-muted-foreground">
              High:{' '}
              <span className="font-medium text-foreground font-mono">
                {profile.dosingHigh.amount}</span> <span className="text-muted-foreground text-xs">{profile.dosingHigh.unit}</span>
            </span>
          </div>
        </div>
      )}

      {/* Vial inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="total-mg" className="block text-sm font-medium text-foreground mb-1">Vial Total (mg)</label>
          <input
            id="total-mg"
            type="number"
            min="0.001"
            step="0.1"
            value={totalMg}
            onChange={(e) => { setTotalMg(e.target.value); resetSaveState(); }}
            placeholder="e.g. 5"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
          />
        </div>
        <div>
          <label htmlFor="bac-water-ml" className="block text-sm font-medium text-foreground mb-1">BAC Water (mL)</label>
          <input
            id="bac-water-ml"
            type="number"
            min="0.1"
            step="0.1"
            value={bacWaterMl}
            onChange={(e) => { setBacWaterMl(e.target.value); resetSaveState(); }}
            placeholder="e.g. 2"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
          />
        </div>
      </div>

      {/* Target dose */}
      <div className="space-y-4">
        <div>
          <label htmlFor="target-dose-mcg" className="block text-sm font-medium text-foreground mb-1">Target Dose (mcg)</label>
          <input
            id="target-dose-mcg"
            type="number"
            min="1"
            step="1"
            value={targetDoseMcg}
            onChange={(e) => { setTargetDoseMcg(e.target.value); resetSaveState(); }}
            placeholder="e.g. 250"
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
          />
        </div>

        {/* Syringe Configuration Dropdowns (F-001) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="syringe-standard" className="block text-sm font-medium text-foreground mb-1">Syringe Type</label>
            <select
              id="syringe-standard"
              value={syringeStandard}
              onChange={(e) => {
                const val = e.target.value as 'U100' | 'U40';
                setSyringeStandard(val);
                void handleSyringePrefsChange(val, syringeSize);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
            >
              <option value="U100">U-100 Insulin Syringe</option>
              <option value="U40">U-40 Insulin Syringe</option>
            </select>
          </div>
          <div>
            <label htmlFor="syringe-size" className="block text-sm font-medium text-foreground mb-1">Syringe Capacity</label>
            <select
              id="syringe-size"
              value={syringeSize}
              onChange={(e) => {
                const val = e.target.value as '0.3' | '0.5' | '1.0';
                setSyringeSize(val);
                void handleSyringePrefsChange(syringeStandard, val);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
            >
              <option value="1.0">1.0 mL (100 U / 40 U)</option>
              <option value="0.5">0.5 mL (50 U / 20 U)</option>
              <option value="0.3">0.3 mL (30 U / 12 U)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Calculation result */}
      {calcResult && (
        <div className="flex flex-col sm:flex-row gap-4 items-stretch" aria-live="polite">
          {/* Text results */}
          <div className="flex-1 rounded-lg border border-border bg-muted/50 px-4 py-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Calculation Results</p>

            {/* Read-back summary line (AC-6) */}
            <p className="text-base font-medium text-primary">
              Draw{' '}
              <span className="font-bold font-mono">
                {displayedUnits.toFixed(1)}
              </span>{' '}
              units (
              <span className="font-mono text-foreground">
                {calcResult.injectionVolMl.toFixed(4)}
              </span>{' '}
              mL) for a <span className="font-mono text-foreground">{targetDoseMcg}</span> mcg dose
            </p>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm pb-3">
              <dt className="text-muted-foreground">Concentration</dt>
              <dd className="font-medium text-foreground">
                <span className="font-mono">{calcResult.concentrationMgPerMl.toFixed(2)}</span> mg/mL (
                <span className="font-mono">{calcResult.concentrationMcgPerMl.toFixed(0)}</span> mcg/mL)
              </dd>

              <dt className="text-muted-foreground">Injection volume</dt>
              <dd className="font-medium text-foreground">
                <span className="font-mono">{calcResult.injectionVolMl.toFixed(4)}</span> mL
              </dd>

              <dt className="text-muted-foreground">Syringe units ({syringeStandard})</dt>
              <dd className="text-primary font-semibold">
                <span className="font-mono">{displayedUnits.toFixed(1)}</span> units
              </dd>
            </dl>

            <div className="pt-3 border-t border-border">
              <button
                type="button"
                id="visual-rehearsal-btn"
                onClick={() => setIsRehearsalOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 px-3.5 py-2 text-xs font-semibold shadow-sm transition-all btn-tactile"
              >
                <span>🧪</span>
                <span>Visual Mixing Rehearsal</span>
              </button>
            </div>
          </div>

          {/* Visual Syringe Preview */}
          <div className="w-full sm:w-44 shrink-0 rounded-lg border border-border bg-muted/50 p-4 flex items-center justify-center">
            <SyringePreview
              units={displayedUnits.toNumber()}
              warnings={warnings}
              syringeStandard={syringeStandard}
              syringeSize={syringeSize}
              onChangeUnits={handleDragUnits}
            />
          </div>
        </div>
      )}

      {/* Warnings */}
      {(warnings.length > 0 || capacityExceeded) && (
        <div className="space-y-2">
          {capacityExceeded && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive font-medium">
              <span className="mt-0.5 shrink-0">&#9888;</span>
              <span>Dose volume exceeds the selected syringe capacity of {maxUnits} U. Consider a larger syringe or a more concentrated reconstitution.</span>
            </div>
          )}
          {warnings.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-400"
            >
              <span className="mt-0.5 shrink-0">&#9888;</span>
              <span>{WARNING_LABELS[w]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expiry date — shows auto-computed default so user knows what they're overriding */}
      <div>
        <label htmlFor="expires-at" className="block text-sm font-medium text-foreground mb-1">
          Custom Expiry Date{' '}
          <span className="text-muted-foreground font-normal">(optional — overrides auto-computed)</span>
        </label>
        {compoundId && (() => {
          const shelfDays = profile?.reconstitutedShelfLifeDays ?? 14;
          const d = new Date();
          const computed = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + shelfDays));
          return (
            <p className="text-xs text-muted-foreground mb-1">
              Auto-computed: <span className="font-medium text-foreground">{computed.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {' '}({shelfDays}-day shelf life)
            </p>
          );
        })()}
        <input
          id="expires-at"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-900 text-foreground"
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors btn-tactile"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save to Inventory'}
        </button>
        {saveState === 'saved' && (
          <p className="text-sm text-success font-medium">Vial saved!</p>
        )}
        {saveState === 'error' && <p className="text-sm text-destructive font-medium">{saveError}</p>}
      </div>
      {calcResult && (
        <ReconstitutionRehearsal
          isOpen={isRehearsalOpen}
          onClose={() => setIsRehearsalOpen(false)}
          bacWaterMl={parseFloat(bacWaterMl)}
          compoundName={selectedCompound?.name ?? 'Compound'}
          compoundSlug={selectedCompound?.slug ?? ''}
        />
      )}
    </form>
  );
}
