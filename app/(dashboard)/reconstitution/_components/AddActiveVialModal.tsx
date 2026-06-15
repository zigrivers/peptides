'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Compound } from '@/lib/reference/domain/types';
import type { DoseAmount } from '@/lib/tracker/domain/types';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import type { SyringeStandard, SyringeSize } from '@/lib/reconstitution/domain/doseUnits';
import { buildReconstitutionPreview } from '@/lib/reconstitution/domain/reconstitutionPreview';
import { addReconstitutedVialAction, reconstituteDryVialAction } from '@/app/actions/reconstitution/inventory-actions';
import { X, AlertTriangle, Thermometer, Plus, Droplet } from 'lucide-react';

interface Props {
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  dryVials: SerializedVialData[];
  subjectUserId?: string;
  /** Preselect a compound when the modal opens (e.g. opened from the tracker for a specific dose). */
  initialCompoundId?: string;
  syringeStandard?: SyringeStandard;
  syringeSize?: SyringeSize;
  onSuccess?: () => void;
  onClose: () => void;
}

export function AddActiveVialModal({
  compounds,
  dryVials,
  subjectUserId,
  initialCompoundId,
  syringeStandard = 'U100',
  syringeSize,
  onSuccess,
  onClose,
}: Props) {
  const [compoundId, setCompoundId] = useState(initialCompoundId ?? '');
  const [totalMg, setTotalMg] = useState('');
  const [bacWaterMl, setBacWaterMl] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [expiresAt, setExpiresAt] = useState('');
  const [hasEditedExpiresAt, setHasEditedExpiresAt] = useState(false);
  const [sourceType, setSourceType] = useState<'new' | 'existing'>('new');
  const [selectedDryVialId, setSelectedDryVialId] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMounted, onClose]);

  const selectedCompound = compounds.find((c) => c.id === compoundId) ?? null;
  const profile = selectedCompound?.profile ?? null;
  const reconstitutedShelfLifeDays = profile?.reconstitutedShelfLifeDays ?? 14;

  const isRoomTemp = useMemo(() => {
    return profile?.fridgeShelfLifeMonths === null && profile?.freezerShelfLifeMonths === null;
  }, [profile]);

  const preview = useMemo(
    () =>
      buildReconstitutionPreview({
        ranges:
          profile?.dosingLow && profile?.dosingTypical && profile?.dosingHigh
            ? {
                low: profile.dosingLow as DoseAmount,
                typical: profile.dosingTypical as DoseAmount,
                high: profile.dosingHigh as DoseAmount,
              }
            : null,
        totalMg,
        bacWaterMl,
        syringeStandard,
        syringeSize,
      }),
    [profile, totalMg, bacWaterMl, syringeStandard, syringeSize]
  );

  useEffect(() => {
    if (profile) {
      setBacWaterMl(isRoomTemp ? '10.0' : '2.0');
    }
  }, [profile, isRoomTemp]);

  const estimatedExpiresAt = useMemo(() => {
    if (!isMounted || !compoundId) return '';
    const now = new Date();
    const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + reconstitutedShelfLifeDays));
    return expiry.toISOString().slice(0, 10);
  }, [isMounted, compoundId, reconstitutedShelfLifeDays]);

  // Pre-calculate estimated active stability expiry
  const estimatedExpiryDateStr = useMemo(() => {
    if (!estimatedExpiresAt) return '';
    const expiry = new Date(`${estimatedExpiresAt}T00:00:00.000Z`);
    return expiry.toLocaleDateString(undefined, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [estimatedExpiresAt]);

  useEffect(() => {
    if (!compoundId) {
      setExpiresAt('');
      setHasEditedExpiresAt(false);
      return;
    }

    if (!hasEditedExpiresAt) {
      setExpiresAt(estimatedExpiresAt);
    }
  }, [compoundId, estimatedExpiresAt, hasEditedExpiresAt]);

  const availableDryVials = useMemo(() => {
    if (!compoundId) return [];
    return dryVials.filter((v) => v.compoundId === compoundId);
  }, [dryVials, compoundId]);

  const currentDryVial = useMemo(() => {
    return availableDryVials.find((v) => v.id === selectedDryVialId) ?? null;
  }, [availableDryVials, selectedDryVialId]);

  useEffect(() => {
    if (availableDryVials.length === 0) {
      setSourceType('new');
      setSelectedDryVialId('');
    } else {
      setSelectedDryVialId(availableDryVials[0]?.id || '');
    }
  }, [availableDryVials]);

  useEffect(() => {
    if (sourceType === 'existing' && currentDryVial) {
      setTotalMg(currentDryVial.totalMg);
    }
  }, [sourceType, currentDryVial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compoundId || !totalMg || !bacWaterMl) return;

    setError(null);
    startTransition(async () => {
      let result;
      if (sourceType === 'existing') {
        if (!selectedDryVialId) {
          setError('Please select a dry vial to pull from.');
          return;
        }
        result = await reconstituteDryVialAction({
          vialId: selectedDryVialId,
          bacWaterMl,
          expiresAt: expiresAt || undefined,
          subjectUserId,
        });
      } else {
        result = await addReconstitutedVialAction({
          compoundId,
          totalMg,
          bacWaterMl,
          cost: cost || undefined,
          currency: cost ? currency : undefined,
          expiresAt: expiresAt || undefined,
          subjectUserId,
        });
      }

      if (result.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.message || 'Failed to add vial.');
      }
    });
  };

  const isFormValid = compoundId && totalMg && parseFloat(totalMg) > 0 && bacWaterMl && parseFloat(bacWaterMl) > 0;

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-active-vial-title"
        className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-white/20 dark:border-slate-800/40 bg-white/10 dark:bg-slate-950/20 backdrop-blur-xl shadow-2xl animate-scale-in"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-emerald-400" />
              <div>
                <h2 id="add-active-vial-title" className="text-base font-bold text-foreground">
                  Add Reconstituted Vial
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isRoomTemp
                    ? 'Directly record an active pre-mixed vial stored at room temperature.'
                    : 'Directly record a pre-mixed vial stored in the refrigerator.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close add reconstituted vial dialog"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Compound selection */}
            <div>
              <label htmlFor="active-compound" className="block text-xs font-semibold text-foreground/80 mb-1">
                Compound
              </label>
              <select
                id="active-compound"
                required
                value={compoundId}
                onChange={(e) => {
                  setCompoundId(e.target.value);
                  setHasEditedExpiresAt(false);
                }}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select a compound…</option>
                {compounds.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Inventory Source Selection */}
            {compoundId && availableDryVials.length > 0 && (
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-foreground/80">Inventory Option</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSourceType('new')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      sourceType === 'new'
                        ? 'border-emerald-500 bg-emerald-500/10 text-foreground'
                        : 'border-input hover:border-emerald-500/50 text-muted-foreground'
                    }`}
                  >
                    <span className="block text-xs font-bold text-foreground">Add New Vial</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Not using freezer inventory</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceType('existing')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      sourceType === 'existing'
                        ? 'border-emerald-500 bg-emerald-500/10 text-foreground'
                        : 'border-input hover:border-emerald-500/50 text-muted-foreground'
                    }`}
                  >
                    <span className="block text-xs font-bold text-foreground">Pull from Freezer</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Use existing dry vial ({availableDryVials.length} available)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Select Freezer Vial */}
            {sourceType === 'existing' && availableDryVials.length > 0 && (
              <div>
                <label htmlFor="modal-dry-vial" className="block text-xs font-semibold text-foreground/80 mb-1">
                  Select Freezer Vial
                </label>
                <select
                  id="modal-dry-vial"
                  required
                  value={selectedDryVialId}
                  onChange={(e) => setSelectedDryVialId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {availableDryVials.map((v) => {
                    const dateStr = v.expiresAt
                      ? new Date(v.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                      : 'No expiry';
                    return (
                      <option key={v.id} value={v.id}>
                        {v.totalMg} mg vial — Expiration: {dateStr}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Vial size / Total Mg */}
            <div>
              <label htmlFor="active-totalMg" className="block text-xs font-semibold text-foreground/80 mb-1">
                Vial Size / Total Weight (mg)
              </label>
              <input
                id="active-totalMg"
                type="number"
                step="any"
                min="0"
                required
                disabled={sourceType === 'existing'}
                placeholder="E.g., 5, 10"
                value={totalMg}
                onChange={(e) => setTotalMg(e.target.value)}
                className={`w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  sourceType === 'existing' ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-900' : ''
                }`}
              />
              {sourceType === 'existing' && (
                <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                  Size locked to selected freezer vial.
                </p>
              )}
            </div>

            {/* BAC Water Volume */}
            <div>
              <label htmlFor="active-bacWater" className="block text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                <Droplet className="h-3.5 w-3.5 text-sky-400" />
                {isRoomTemp ? 'Vial Volume (mL)' : 'BAC Water Volume (mL)'}
              </label>
              <input
                id="active-bacWater"
                type="number"
                step="any"
                min="0"
                required
                placeholder={isRoomTemp ? 'E.g., 10.0' : 'E.g., 2.0'}
                value={bacWaterMl}
                onChange={(e) => setBacWaterMl(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {preview.computable && (
                <div aria-live="polite" className="mt-2 rounded-lg border border-input bg-background/50 p-3 text-xs">
                  <p className="font-semibold text-foreground/80">
                    Syringe preview — {preview.concentrationText} · {syringeStandard === 'U100' ? 'U-100' : 'U-40'}
                  </p>
                  <dl className="mt-1.5 space-y-0.5">
                    {preview.rows.map((r) => (
                      <div
                        key={r.label}
                        className={`flex items-baseline justify-between ${r.exceedsSyringe ? 'text-amber-600 dark:text-amber-400' : ''}`}
                      >
                        <dt className="text-foreground/70">
                          {r.label} <span className="text-foreground/50">· {r.doseText}</span>
                        </dt>
                        <dd className="font-mono tabular-nums">{r.unitsText ?? '—'}</dd>
                      </div>
                    ))}
                  </dl>
                  {preview.hint && <p className="mt-1.5 text-foreground/70">{preview.hint}</p>}
                  {preview.warning && <p className="mt-1 text-amber-600 dark:text-amber-400">{preview.warning}</p>}
                </div>
              )}
            </div>

            {/* Optional custom expiration date */}
            <div>
              <label htmlFor="active-expiresAt" className="block text-xs font-semibold text-foreground/80 mb-1">
                {isRoomTemp ? 'Expiration Date' : 'Refrigerator Expiration Date'} <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
              </label>
              <input
                id="active-expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                  setHasEditedExpiresAt(true);
                }}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {isMounted && compoundId && estimatedExpiryDateStr && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                  {expiresAt === estimatedExpiresAt ? 'Auto-populated' : 'Suggested'}: {estimatedExpiryDateStr} ({reconstitutedShelfLifeDays} days stability)
                </p>
              )}
            </div>

            {/* Cost and Currency */}
            {sourceType === 'new' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="active-cost" className="block text-xs font-semibold text-foreground/80 mb-1">
                    Cost <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                  </label>
                  <input
                    id="active-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="E.g., 45.00"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="active-currency" className="block text-xs font-semibold text-foreground/80 mb-1">
                    Currency
                  </label>
                  <select
                    id="active-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="USDT">USDT</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-bold border border-input bg-background hover:bg-muted text-foreground rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !isFormValid}
              className="flex-1 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {isPending ? 'Saving...' : 'Add Vial'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
