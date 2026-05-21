'use client';

import { useState, useCallback } from 'react';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from '@/lib/reconstitution/domain/ReconstitutionCalculator';
import { WarningPolicy, type WarningType } from '@/lib/reconstitution/domain/WarningPolicy';
import { saveVialAction } from '@/app/actions/reconstitution/save-vial';
import type { Compound } from '@/lib/reference/domain/types';

interface Props {
  compounds: Pick<Compound, 'id' | 'name' | 'profile'>[];
}

type CalcResult = {
  concentrationMgPerMl: string;
  concentrationMcgPerMl: string;
  injectionVolMl: string;
  syringeUnitsPerDose: string;
};

const WARNING_LABELS: Record<WarningType, string> = {
  HIGH_VOLUME: 'Injection volume exceeds 1.5 mL — consider diluting further.',
  LOW_BAC_VOLUME: 'BAC water volume below 0.5 mL — vial may be difficult to draw from.',
  ABOVE_REFERENCE_RANGE: 'Dose exceeds the compound\'s reference high range.',
  EXCEEDS_VIAL_CAPACITY: 'Required volume exceeds BAC water added — physically impossible.',
};

export function ReconstitutionCalculatorForm({ compounds }: Props) {
  const [compoundId, setCompoundId] = useState('');
  const [totalMg, setTotalMg] = useState('');
  const [bacWaterMl, setBacWaterMl] = useState('');
  const [targetDoseMcg, setTargetDoseMcg] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const [result, setResult] = useState<CalcResult | null>(null);
  const [warnings, setWarnings] = useState<WarningType[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  const selectedCompound = compounds.find((c) => c.id === compoundId) ?? null;
  const profile = selectedCompound?.profile ?? null;

  const profileHighMcg = profile?.dosingHigh
    ? (() => {
        const d = profile.dosingHigh;
        if (d.unit === 'mcg') return new Decimal(d.amount);
        if (d.unit === 'mg') return new Decimal(d.amount).times(1000);
        return undefined;
      })()
    : undefined;

  const profileTypicalMcg = profile?.dosingTypical
    ? (() => {
        const d = profile.dosingTypical;
        if (d.unit === 'mcg') return new Decimal(d.amount);
        if (d.unit === 'mg') return new Decimal(d.amount).times(1000);
        return undefined;
      })()
    : undefined;

  const calculate = useCallback(() => {
    const mg = parseFloat(totalMg);
    const ml = parseFloat(bacWaterMl);
    const mcg = parseFloat(targetDoseMcg);

    if (!mg || !ml || !mcg || mg <= 0 || ml <= 0 || mcg <= 0) {
      setResult(null);
      setWarnings([]);
      return;
    }

    try {
      const calc = ReconstitutionCalculator.calculate({
        totalMg: new Decimal(mg),
        bacWaterMl: new Decimal(ml),
        targetDoseMcg: new Decimal(mcg),
      });

      setResult({
        concentrationMgPerMl: calc.concentrationMgPerMl.toFixed(4),
        concentrationMcgPerMl: calc.concentrationMcgPerMl.toFixed(2),
        injectionVolMl: calc.injectionVolMl.toFixed(4),
        syringeUnitsPerDose: calc.syringeUnitsPerDose.toFixed(2),
      });

      setWarnings(
        WarningPolicy.evaluate({
          injectionVolMl: calc.injectionVolMl,
          bacWaterMl: new Decimal(ml),
          targetDoseMcg: new Decimal(mcg),
          profileHighMcg,
        })
      );
    } catch {
      setResult(null);
      setWarnings([]);
    }
  }, [totalMg, bacWaterMl, targetDoseMcg, profileHighMcg]);

  const handleFieldChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value);
    // Trigger recalc after state settles
    setTimeout(calculate, 0);
  };

  const useTypicalDose = () => {
    if (!profileTypicalMcg) return;
    setTargetDoseMcg(profileTypicalMcg.toString());
    setTimeout(calculate, 0);
  };

  const handleSave = async () => {
    if (!compoundId || !totalMg || !bacWaterMl) return;
    setSaveState('saving');
    setSaveError('');
    const res = await saveVialAction({ compoundId, totalMg, bacWaterMl, expiresAt: expiresAt || undefined });
    if (res.ok) {
      setSaveState('saved');
      setTotalMg('');
      setBacWaterMl('');
      setTargetDoseMcg('');
      setExpiresAt('');
      setResult(null);
      setWarnings([]);
    } else {
      setSaveState('error');
      setSaveError(res.error);
    }
  };

  const canSave = compoundId && totalMg && bacWaterMl && saveState !== 'saving';

  return (
    <div className="space-y-6">
      {/* Compound selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Compound</label>
        <select
          value={compoundId}
          onChange={(e) => {
            setCompoundId(e.target.value);
            setResult(null);
            setWarnings([]);
          }}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select a compound…</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Reference dosing chips */}
      {profile && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <p className="text-xs font-semibold text-indigo-700 mb-2">Reference Dosing</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-gray-600">
              Low: <span className="font-medium text-gray-900">{profile.dosingLow.amount} {profile.dosingLow.unit}</span>
            </span>
            <span className="text-gray-600">
              Typical:{' '}
              <button
                type="button"
                onClick={useTypicalDose}
                className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                title="Use typical dose"
              >
                {profile.dosingTypical.amount} {profile.dosingTypical.unit}
              </button>
            </span>
            <span className="text-gray-600">
              High: <span className="font-medium text-gray-900">{profile.dosingHigh.amount} {profile.dosingHigh.unit}</span>
            </span>
          </div>
        </div>
      )}

      {/* Vial inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vial Total (mg)</label>
          <input
            type="number"
            min="0.001"
            step="0.1"
            value={totalMg}
            onChange={handleFieldChange(setTotalMg)}
            placeholder="e.g. 5"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">BAC Water (mL)</label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={bacWaterMl}
            onChange={handleFieldChange(setBacWaterMl)}
            placeholder="e.g. 2"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Target dose */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Target Dose (mcg)</label>
        <input
          type="number"
          min="1"
          step="1"
          value={targetDoseMcg}
          onChange={handleFieldChange(setTargetDoseMcg)}
          placeholder="e.g. 250"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Calculation result */}
      {result && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Calculation Results</p>

          {/* Read-back summary line (AC-6) */}
          <p className="text-base font-medium text-indigo-700">
            Draw <span className="font-bold">{parseFloat(result.syringeUnitsPerDose).toFixed(1)} units</span>{' '}
            ({parseFloat(result.injectionVolMl).toFixed(4)} mL) for a{' '}
            {targetDoseMcg} mcg dose
          </p>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-gray-500">Concentration</dt>
            <dd className="font-medium text-gray-900">{parseFloat(result.concentrationMgPerMl).toFixed(2)} mg/mL ({parseFloat(result.concentrationMcgPerMl).toFixed(0)} mcg/mL)</dd>

            <dt className="text-gray-500">Injection volume</dt>
            <dd className="font-medium text-gray-900">{parseFloat(result.injectionVolMl).toFixed(4)} mL</dd>

            <dt className="text-gray-500">Syringe units (U-100)</dt>
            <dd className="font-medium text-gray-900">{parseFloat(result.syringeUnitsPerDose).toFixed(2)} units</dd>
          </dl>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <span className="mt-0.5 shrink-0">&#9888;</span>
              <span>{WARNING_LABELS[w]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Optional expiry override */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Custom Expiry Date <span className="text-gray-400 font-normal">(optional — overrides auto-computed)</span>
        </label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saveState === 'saving' ? 'Saving…' : 'Save to Inventory'}
        </button>
        {saveState === 'saved' && (
          <p className="text-sm text-green-600 font-medium">Vial saved!</p>
        )}
        {saveState === 'error' && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}
      </div>
    </div>
  );
}
