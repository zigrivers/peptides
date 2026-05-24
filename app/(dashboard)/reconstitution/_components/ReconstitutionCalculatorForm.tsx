'use client';

import React, { useState, useMemo } from 'react';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from '@/lib/reconstitution/domain/ReconstitutionCalculator';
import { WarningPolicy, type WarningType } from '@/lib/reconstitution/domain/WarningPolicy';
import { saveVialAction } from '@/app/actions/reconstitution/save-vial';
import type { Compound } from '@/lib/reference/domain/types';

interface Props {
  compounds: Pick<Compound, 'id' | 'name' | 'profile'>[];
  initialCompoundId?: string;
  initialTotalMg?: string;
  initialBacWaterMl?: string;
  initialTargetDoseMcg?: string;
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
}: Props) {
  const [compoundId, setCompoundId] = useState(initialCompoundId);
  const [totalMg, setTotalMg] = useState(initialTotalMg);
  const [bacWaterMl, setBacWaterMl] = useState(initialBacWaterMl);
  const [targetDoseMcg, setTargetDoseMcg] = useState(initialTargetDoseMcg);
  const [expiresAt, setExpiresAt] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

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
  }, [totalMg, bacWaterMl, targetDoseMcg, profileHighMcg]);

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
        <label htmlFor="compound-select" className="block text-sm font-medium text-gray-700 mb-1">Compound</label>
        <select
          id="compound-select"
          value={compoundId}
          onChange={(e) => {
            setCompoundId(e.target.value);
            resetSaveState();
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
            <span className="text-gray-600">
              Low:{' '}
              <span className="font-medium text-gray-900 font-mono">
                {profile.dosingLow.amount}</span> <span className="text-gray-600 text-xs">{profile.dosingLow.unit}</span>
            </span>
            <span className="text-gray-600">
              Typical:{' '}
              <button
                type="button"
                onClick={useTypicalDose}
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80 font-mono"
                title="Use typical dose"
              >
                {profile.dosingTypical.amount}
              </button>{' '}
              <span className="text-gray-600 text-xs">{profile.dosingTypical.unit}</span>
            </span>
            <span className="text-gray-600">
              High:{' '}
              <span className="font-medium text-gray-900 font-mono">
                {profile.dosingHigh.amount}</span> <span className="text-gray-600 text-xs">{profile.dosingHigh.unit}</span>
            </span>
          </div>
        </div>
      )}

      {/* Vial inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="total-mg" className="block text-sm font-medium text-gray-700 mb-1">Vial Total (mg)</label>
          <input
            id="total-mg"
            type="number"
            min="0.001"
            step="0.1"
            value={totalMg}
            onChange={(e) => { setTotalMg(e.target.value); resetSaveState(); }}
            placeholder="e.g. 5"
            className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label htmlFor="bac-water-ml" className="block text-sm font-medium text-gray-700 mb-1">BAC Water (mL)</label>
          <input
            id="bac-water-ml"
            type="number"
            min="0.1"
            step="0.1"
            value={bacWaterMl}
            onChange={(e) => { setBacWaterMl(e.target.value); resetSaveState(); }}
            placeholder="e.g. 2"
            className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Target dose */}
      <div>
        <label htmlFor="target-dose-mcg" className="block text-sm font-medium text-gray-700 mb-1">Target Dose (mcg)</label>
        <input
          id="target-dose-mcg"
          type="number"
          min="1"
          step="1"
          value={targetDoseMcg}
          onChange={(e) => { setTargetDoseMcg(e.target.value); resetSaveState(); }}
          placeholder="e.g. 250"
          className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Calculation result */}
      {calcResult && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 space-y-3" aria-live="polite">
          <p className="text-sm font-semibold text-gray-700">Calculation Results</p>

          {/* Read-back summary line (AC-6) */}
          <p className="text-base font-medium text-primary">
            Draw{' '}
            <span className="font-bold font-mono">
              {calcResult.syringeUnitsPerDose.toFixed(1)}
            </span>{' '}
            units (
            <span className="font-mono">
              {calcResult.injectionVolMl.toFixed(4)}
            </span>{' '}
            mL) for a <span className="font-mono">{targetDoseMcg}</span> mcg dose
          </p>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-gray-500">Concentration</dt>
            <dd className="font-medium text-gray-900">
              <span className="font-mono">{calcResult.concentrationMgPerMl.toFixed(2)}</span> mg/mL (
              <span className="font-mono">{calcResult.concentrationMcgPerMl.toFixed(0)}</span> mcg/mL)
            </dd>

            <dt className="text-gray-500">Injection volume</dt>
            <dd className="font-medium text-gray-900">
              <span className="font-mono">{calcResult.injectionVolMl.toFixed(4)}</span> mL
            </dd>

            <dt className="text-gray-500">Syringe units (U-100)</dt>
            <dd className="text-primary font-semibold">
              <span className="font-mono">{calcResult.syringeUnitsPerDose.toFixed(1)}</span> units
            </dd>
          </dl>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800"
            >
              <span className="mt-0.5 shrink-0">&#9888;</span>
              <span>{WARNING_LABELS[w]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expiry date — shows auto-computed default so user knows what they're overriding */}
      <div>
        <label htmlFor="expires-at" className="block text-sm font-medium text-gray-700 mb-1">
          Custom Expiry Date{' '}
          <span className="text-gray-400 font-normal">(optional — overrides auto-computed)</span>
        </label>
        {compoundId && (() => {
          const shelfDays = profile?.reconstitutedShelfLifeDays ?? 14;
          const d = new Date();
          const computed = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + shelfDays));
          return (
            <p className="text-xs text-gray-500 mb-1">
              Auto-computed: <span className="font-medium">{computed.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {' '}({shelfDays}-day shelf life)
            </p>
          );
        })()}
        <input
          id="expires-at"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save to Inventory'}
        </button>
        {saveState === 'saved' && (
          <p className="text-sm text-green-600 font-medium">Vial saved!</p>
        )}
        {saveState === 'error' && <p className="text-sm text-red-600">{saveError}</p>}
      </div>
    </form>
  );
}
