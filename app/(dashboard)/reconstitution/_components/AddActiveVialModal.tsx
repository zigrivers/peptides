'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import type { Compound } from '@/lib/reference/domain/types';
import { addReconstitutedVialAction } from '@/app/actions/reconstitution/inventory-actions';
import { X, AlertTriangle, Thermometer, Plus, Droplet } from 'lucide-react';

interface Props {
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  onSuccess?: () => void;
  onClose: () => void;
}

export function AddActiveVialModal({ compounds, onSuccess, onClose }: Props) {
  const [compoundId, setCompoundId] = useState('');
  const [totalMg, setTotalMg] = useState('');
  const [bacWaterMl, setBacWaterMl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const selectedCompound = compounds.find((c) => c.id === compoundId) ?? null;
  const profile = selectedCompound?.profile ?? null;
  const reconstitutedShelfLifeDays = profile?.reconstitutedShelfLifeDays ?? 14;

  // Pre-calculate estimated refrigerated expiry
  const estimatedExpiryDateStr = useMemo(() => {
    if (!isMounted || !compoundId) return '';
    const now = new Date();
    const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + reconstitutedShelfLifeDays));
    return expiry.toLocaleDateString(undefined, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [isMounted, compoundId, reconstitutedShelfLifeDays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compoundId || !totalMg || !bacWaterMl) return;

    setError(null);
    startTransition(async () => {
      const result = await addReconstitutedVialAction({
        compoundId,
        totalMg,
        bacWaterMl,
        expiresAt: expiresAt || undefined,
      });

      if (result.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.message || 'Failed to add reconstituted vial.');
      }
    });
  };

  const isFormValid = compoundId && totalMg && parseFloat(totalMg) > 0 && bacWaterMl && parseFloat(bacWaterMl) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/20 dark:border-slate-800/40 bg-white/10 dark:bg-slate-950/20 backdrop-blur-xl shadow-2xl animate-scale-in">
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-emerald-400" />
              <div>
                <h2 className="text-base font-bold text-foreground">Add Reconstituted Vial</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Directly record a pre-mixed vial stored in the refrigerator.
                </p>
              </div>
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
                onChange={(e) => setCompoundId(e.target.value)}
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
                placeholder="E.g., 5, 10"
                value={totalMg}
                onChange={(e) => setTotalMg(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* BAC Water Volume */}
            <div>
              <label htmlFor="active-bacWater" className="block text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-1">
                <Droplet className="h-3.5 w-3.5 text-sky-400" />
                BAC Water Volume (mL)
              </label>
              <input
                id="active-bacWater"
                type="number"
                step="any"
                min="0"
                required
                placeholder="E.g., 2.0"
                value={bacWaterMl}
                onChange={(e) => setBacWaterMl(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Optional custom expiration date */}
            <div>
              <label htmlFor="active-expiresAt" className="block text-xs font-semibold text-foreground/80 mb-1">
                Refrigerator Expiration Date <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
              </label>
              <input
                id="active-expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {isMounted && compoundId && !expiresAt && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                  Auto-expires on: {estimatedExpiryDateStr} ({reconstitutedShelfLifeDays} days stability)
                </p>
              )}
            </div>
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
    </div>
  );
}
