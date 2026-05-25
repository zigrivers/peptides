'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import type { Compound, DoseAmount } from '@/lib/reference/domain/types';
import { createProtocolAction } from '@/app/actions/tracker/create-protocol';
import { parseCompoundDosing } from '@/lib/reference/domain/validation';

type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ManagedUser = { id: string; name: string | null; email: string };
type CycleOption = { id: string; name: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatScheduleText(schedule: any): string {
  if (schedule.frequency === 'Daily') return 'Every day';
  if (schedule.frequency === 'EOD') return 'Every other day';
  if (schedule.frequency === 'CustomInterval') return `Every ${schedule.intervalDays} days`;
  if (schedule.frequency === 'SpecificDaysOfWeek') {
    return `On ${schedule.daysOfWeek?.join(', ') || ''}`;
  }
  return 'Custom schedule';
}

type Props = {
  compounds: Compound[];
  managedUsers: ManagedUser[];
  currentUserId: string;
  cyclesByUserId: Record<string, CycleOption[]>;
  cloneSource?: {
    id: string;
    userId: string;
    compoundId: string;
    dose: { amount: string; unit: string };
    schedule: unknown;
    administrationRoute: string;
    notes: string | null;
  };
};

export function CreateProtocolForm({
  compounds,
  managedUsers,
  currentUserId,
  cyclesByUserId,
  cloneSource,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Wizard Step State: 1 (Basic Info), 2 (Dosing & Inventory), 3 (Notes & Confirm)
  const [step, setStep] = useState(1);

  // State Fields
  const [subjectUserId, setSubjectUserId] = useState(cloneSource?.userId ?? currentUserId);
  const [compoundId, setCompoundId] = useState(cloneSource?.compoundId ?? '');
  const [adminRoute, setAdminRoute] = useState(cloneSource?.administrationRoute ?? 'SubQ');
  
  const [doseAmount, setDoseAmount] = useState(cloneSource?.dose.amount ?? '');
  const [doseUnit, setDoseUnit] = useState<'mcg' | 'mg' | 'IU' | 'mL'>(
    (cloneSource?.dose.unit as 'mcg' | 'mg' | 'IU' | 'mL') ?? 'mcg'
  );
  
  const cloneSchedule = cloneSource?.schedule as { frequency?: 'Daily' | 'EOD' | 'SpecificDaysOfWeek' | 'CustomInterval'; daysOfWeek?: DayOfWeek[]; intervalDays?: number } | undefined;
  const [frequency, setFrequency] = useState<'Daily' | 'EOD' | 'SpecificDaysOfWeek' | 'CustomInterval'>(
    cloneSchedule?.frequency ?? 'Daily'
  );
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(cloneSchedule?.daysOfWeek ?? []);
  const [intervalDays, setIntervalDays] = useState(cloneSchedule?.intervalDays ?? 2);
  const [startDate, setStartDate] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [notes, setNotes] = useState(cloneSource?.notes ?? '');

  // Inventory Seeding State
  const [seedInventory, setSeedInventory] = useState(false);
  const [vialTotalMg, setVialTotalMg] = useState('');
  const [vialBacWaterMl, setVialBacWaterMl] = useState('');
  const [vialExpiresAt, setVialExpiresAt] = useState('');

  // Auto-populate today's date
  useEffect(() => {
    const today = new Date();
    const formatted = today.toISOString().split('T')[0];
    setStartDate(formatted);
  }, []);

  const selectedCompound = compounds.find((c) => c.id === compoundId);
  
  // Dosing guidance parsed with fallbacks
  const dosingLow = selectedCompound?.profile?.dosingLow ? parseCompoundDosing(selectedCompound.profile.dosingLow) : null;
  const dosingTypical = selectedCompound?.profile?.dosingTypical ? parseCompoundDosing(selectedCompound.profile.dosingTypical) : null;
  const dosingHigh = selectedCompound?.profile?.dosingHigh ? parseCompoundDosing(selectedCompound.profile.dosingHigh) : null;

  // Real-time dose range warnings
  const [doseWarning, setDoseWarning] = useState<string | null>(null);
  useEffect(() => {
    if (!doseAmount || !dosingHigh) {
      setDoseWarning(null);
      return;
    }
    try {
      const amountVal = new Decimal(doseAmount);
      const highVal = new Decimal(dosingHigh.amount);
      if (amountVal.gt(highVal)) {
        setDoseWarning(`Note: This dose exceeds the typical upper research threshold (${dosingHigh.amount} ${dosingHigh.unit}). Confirm with study references.`);
      } else {
        setDoseWarning(null);
      }
    } catch {
      setDoseWarning(null);
    }
  }, [doseAmount, dosingHigh]);

  // Compute reconstitution concentration dynamically
  const [calculatedConcentration, setCalculatedConcentration] = useState<string | null>(null);
  useEffect(() => {
    if (!vialTotalMg || !vialBacWaterMl) {
      setCalculatedConcentration(null);
      return;
    }
    try {
      const mg = new Decimal(vialTotalMg);
      const ml = new Decimal(vialBacWaterMl);
      if (ml.gt(0)) {
        const conc = mg.dividedBy(ml);
        setCalculatedConcentration(`${conc.toFixed(2)} mg/mL`);
      } else {
        setCalculatedConcentration(null);
      }
    } catch {
      setCalculatedConcentration(null);
    }
  }, [vialTotalMg, vialBacWaterMl]);

  function handleSubjectChange(newSubjectId: string) {
    setSubjectUserId(newSubjectId);
    setCycleId('');
  }

  function toggleDay(day: DayOfWeek) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function buildSchedule() {
    switch (frequency) {
      case 'Daily': return { frequency: 'Daily' as const };
      case 'EOD': return { frequency: 'EOD' as const };
      case 'SpecificDaysOfWeek': return { frequency: 'SpecificDaysOfWeek' as const, daysOfWeek };
      case 'CustomInterval': return { frequency: 'CustomInterval' as const, intervalDays };
    }
  }

  function applyDoseTile(doseInfo: DoseAmount) {
    if (!doseInfo) return;
    setDoseAmount(doseInfo.amount);
    setDoseUnit(doseInfo.unit as 'mcg' | 'mg' | 'IU' | 'mL');
    if (doseInfo.recommendedFrequency) {
      const freq = doseInfo.recommendedFrequency.toLowerCase();
      if (freq.includes('daily') || freq.includes('every day')) {
        setFrequency('Daily');
      } else if (freq.includes('eod') || freq.includes('every other day')) {
        setFrequency('EOD');
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!startDate) {
      setError('Start date is required');
      return;
    }

    const input = {
      subjectUserId,
      compoundId,
      cycleId: cycleId || undefined,
      dose: { amount: doseAmount, unit: doseUnit },
      schedule: buildSchedule(),
      administrationRoute: adminRoute,
      startDate: new Date(startDate),
      notes: notes || undefined,
      initialVial: (seedInventory && vialTotalMg && vialBacWaterMl) ? {
        totalMg: vialTotalMg,
        bacWaterMl: vialBacWaterMl,
        expiresAt: vialExpiresAt ? new Date(`${vialExpiresAt}T00:00:00Z`) : undefined,
      } : undefined,
    };

    startTransition(async () => {
      const result = await createProtocolAction(input);
      if (result.ok) {
        router.push('/regimen');
      } else {
        setError(result.message ?? result.error);
      }
    });
  }

  const allUsers: ManagedUser[] = [
    { id: currentUserId, name: 'Me', email: '' },
    ...managedUsers,
  ];

  return (
    <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-900 p-6 md:p-8 shadow-xl space-y-6">
      
      {/* Wizard Progress Steps Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-900">
        <div className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-gray-200 text-gray-500'
          }`}>1</span>
          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Basic Info</span>
        </div>
        <div className="h-0.5 flex-1 mx-3 bg-gray-100 dark:bg-gray-800" />
        <div className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-gray-200 text-gray-500'
          }`}>2</span>
          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Dose & Inventory</span>
        </div>
        <div className="h-0.5 flex-1 mx-3 bg-gray-100 dark:bg-gray-800" />
        <div className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-gray-200 text-gray-500'
          }`}>3</span>
          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Confirm</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* STEP 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-5 animate-page-enter">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Basic Information</h2>
            <p className="text-xs text-gray-500">Select the subject, compound and route of administration</p>
          </div>

          {/* Assign to */}
          {managedUsers.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="subject" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Subject
              </label>
              <select
                id="subject"
                value={subjectUserId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
              >
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === currentUserId ? `${u.name || 'Me'} (Self)` : u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Compound */}
          <div className="space-y-1.5">
            <label htmlFor="compound" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Compound <span className="text-red-500">*</span>
            </label>
            <select
              id="compound"
              required
              value={compoundId}
              onChange={(e) => setCompoundId(e.target.value)}
              className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
            >
              <option value="">Select a compound…</option>
              {compounds.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Administration route */}
          <div className="space-y-1.5">
            <label htmlFor="admin-route" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Administration Route
            </label>
            <select
              id="admin-route"
              value={adminRoute}
              onChange={(e) => setAdminRoute(e.target.value)}
              className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
            >
              <option value="SubQ">SubQ (Subcutaneous)</option>
              <option value="IM">IM (Intramuscular)</option>
              <option value="Oral">Oral</option>
              <option value="Nasal">Nasal</option>
              <option value="Topical">Topical</option>
              <option value="IV">IV (Intravenous)</option>
            </select>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              disabled={!compoundId}
              onClick={() => setStep(2)}
              className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/95 disabled:opacity-50 hover:scale-[1.02] transition-all"
            >
              Next Step: Dosing →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Dosing & Inventory */}
      {step === 2 && (
        <div className="space-y-6 animate-page-enter">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dose & Reconstitution</h2>
            <p className="text-xs text-gray-500">Pick from clinical ranges or type custom values</p>
          </div>

          {/* Dosing range tiles guidance */}
          {selectedCompound && (dosingLow || dosingTypical || dosingHigh) && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Dosing Guidance Ranges</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {dosingLow && (
                  <button
                    type="button"
                    onClick={() => applyDoseTile(dosingLow)}
                    className="text-left p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:border-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <p className="text-xs font-bold text-gray-400 uppercase">Conservative</p>
                    <p className="text-base font-extrabold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                      {dosingLow.amount} {dosingLow.unit}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Benefits:</span> {dosingLow.researchBenefits}
                    </p>
                  </button>
                )}
                {dosingTypical && (
                  <button
                    type="button"
                    onClick={() => applyDoseTile(dosingTypical)}
                    className="text-left p-3.5 rounded-xl border border-primary/20 dark:border-primary/30 bg-primary/5 dark:bg-primary/10 hover:border-primary/60 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <p className="text-xs font-bold text-primary uppercase">Typical Range</p>
                    <p className="text-base font-extrabold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                      {dosingTypical.amount} {dosingTypical.unit}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Benefits:</span> {dosingTypical.researchBenefits}
                    </p>
                  </button>
                )}
                {dosingHigh && (
                  <button
                    type="button"
                    onClick={() => applyDoseTile(dosingHigh)}
                    className="text-left p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 hover:border-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <p className="text-xs font-bold text-gray-400 uppercase">Aggressive</p>
                    <p className="text-base font-extrabold text-gray-900 dark:text-gray-100 mt-1 font-mono">
                      {dosingHigh.amount} {dosingHigh.unit}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 leading-snug">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Benefits:</span> {dosingHigh.researchBenefits}
                    </p>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Dose input */}
          <div className="space-y-1.5">
            <label htmlFor="dose-amount" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Dose amount <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="dose-amount"
                type="text"
                inputMode="decimal"
                required
                value={doseAmount}
                onChange={(e) => setDoseAmount(e.target.value)}
                placeholder="e.g. 250"
                className="flex-1 rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
              />
              <select
                aria-label="Dose unit"
                value={doseUnit}
                onChange={(e) => setDoseUnit(e.target.value as typeof doseUnit)}
                className="rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
              >
                <option value="mcg">mcg</option>
                <option value="mg">mg</option>
                <option value="IU">IU</option>
                <option value="mL">mL</option>
              </select>
            </div>
            {doseWarning && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-medium">{doseWarning}</p>
            )}
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <label htmlFor="frequency" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Frequency
            </label>
            <select
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
              className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
            >
              <option value="Daily">Daily</option>
              <option value="EOD">Every other day (EOD)</option>
              <option value="SpecificDaysOfWeek">Specific days of the week</option>
              <option value="CustomInterval">Custom interval (every N days)</option>
            </select>
          </div>

          {frequency === 'SpecificDaysOfWeek' && (
            <div className="space-y-2">
              <p className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Days of the week</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      daysOfWeek.includes(day)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-primary/50'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {frequency === 'CustomInterval' && (
            <div className="space-y-1.5">
              <label htmlFor="interval-days" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Interval in days
              </label>
              <input
                id="interval-days"
                type="number"
                inputMode="numeric"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="w-24 rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
              />
            </div>
          )}

          {/* Seed starting inventory toggle */}
          <div className="bg-primary/5 dark:bg-primary/10 p-4 rounded-xl border border-primary/20 dark:border-primary/30 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Seed Starting Inventory</h4>
                <p className="text-xs text-gray-500">Reconstitute your first vial for this protocol immediately</p>
              </div>
              <input
                type="checkbox"
                checked={seedInventory}
                onChange={(e) => setSeedInventory(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-gray-300 dark:border-gray-800 text-primary focus:ring-primary cursor-pointer mt-1"
              />
            </div>

            {seedInventory && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-primary/10 animate-page-enter">
                <div className="space-y-1.5">
                  <label htmlFor="vial-total-mg" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Vial Size (mg) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="vial-total-mg"
                    type="text"
                    inputMode="decimal"
                    required={seedInventory}
                    value={vialTotalMg}
                    onChange={(e) => setVialTotalMg(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-xs focus:border-primary focus:ring-primary py-2 px-3"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vial-bac-water" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Bac Water Added (mL) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="vial-bac-water"
                    type="text"
                    inputMode="decimal"
                    required={seedInventory}
                    value={vialBacWaterMl}
                    onChange={(e) => setVialBacWaterMl(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-xs focus:border-primary focus:ring-primary py-2 px-3"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vial-expires" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Vial Expiration Date <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="vial-expires"
                    type="date"
                    value={vialExpiresAt}
                    onChange={(e) => setVialExpiresAt(e.target.value)}
                    className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-xs focus:border-primary focus:ring-primary py-2 px-3"
                  />
                </div>

                {calculatedConcentration && (
                  <div className="sm:col-span-2 bg-white dark:bg-gray-950 border border-gray-200/50 dark:border-gray-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <span className="text-gray-400">Calculated concentration:</span>
                    <span className="font-bold text-primary">{calculatedConcentration}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!doseAmount}
              onClick={() => setStep(3)}
              className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/95 disabled:opacity-50 hover:scale-[1.02] transition-all"
            >
              Next: Confirm & Notes →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Confirm & Notes */}
      {step === 3 && (
        <form onSubmit={handleSubmit} className="space-y-6 animate-page-enter">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Review & Save</h2>
            <p className="text-xs text-gray-500">Provide optional notes and save your protocol</p>
          </div>

          {/* Start date */}
          <div className="space-y-1.5">
            <label htmlFor="start-date" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              id="start-date"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
            />
          </div>

          {/* Cycle */}
          {(cyclesByUserId[subjectUserId] ?? []).length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="cycle" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                Cycle <span className="text-gray-400">(optional)</span>
              </label>
              <select
                id="cycle"
                value={cycleId}
                onChange={(e) => setCycleId(e.target.value)}
                className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
              >
                <option value="">No cycle</option>
                {(cyclesByUserId[subjectUserId] ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Record any baseline observations or stack combinations..."
              className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3 resize-none"
            />
          </div>

          {/* Recap */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-900 space-y-2 text-xs">
            <h4 className="font-bold text-gray-400 uppercase tracking-wider">Protocol Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
              <div>Compound: <span className="font-bold text-gray-900 dark:text-gray-100">{selectedCompound?.name || 'Selected'}</span></div>
              <div>Route: <span className="font-semibold text-gray-900 dark:text-gray-100">{adminRoute}</span></div>
              <div>Dose: <span className="font-bold text-gray-900 dark:text-gray-100">{doseAmount} {doseUnit}</span></div>
              <div>Frequency: <span className="font-semibold text-gray-900 dark:text-gray-100">{formatScheduleText(buildSchedule())}</span></div>
              {seedInventory && (
                <div className="col-span-2 pt-2 border-t border-gray-200/50 dark:border-gray-800">
                  Initial Vial: <span className="font-semibold text-primary">{vialTotalMg} mg ({vialBacWaterMl} mL Bac Water)</span>
                </div>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-primary/95 disabled:opacity-60 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
            >
              {isPending ? 'Saving…' : 'Create Protocol'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
