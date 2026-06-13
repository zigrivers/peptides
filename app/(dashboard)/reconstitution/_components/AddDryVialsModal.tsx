'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Compound } from '@/lib/reference/domain/types';
import { addDryVialsAction } from '@/app/actions/reconstitution/inventory-actions';
import { X, AlertTriangle, Snowflake, Plus } from 'lucide-react';

interface Props {
  compounds: Pick<Compound, 'id' | 'name' | 'profile' | 'slug'>[];
  /** Pre-select a compound (e.g. when opened from the by-compound inventory row). */
  initialCompoundId?: string;
  subjectUserId?: string;
  onSuccess?: () => void;
  onClose: () => void;
}

export function AddDryVialsModal({ compounds, initialCompoundId, subjectUserId, onSuccess, onClose }: Props) {
  const [compoundId, setCompoundId] = useState(initialCompoundId ?? '');
  const [totalMg, setTotalMg] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [expiresAt, setExpiresAt] = useState('');
  const [userOverrodeDate, setUserOverrodeDate] = useState(false);
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
  const freezerShelfLifeMonths = profile?.freezerShelfLifeMonths ?? 24;

  // Pre-calculate estimated freezer expiry based on selected compound and shelf life
  const estimatedExpiryDateStr = useMemo(() => {
    if (!isMounted || !compoundId) return '';
    const now = new Date();
    const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + freezerShelfLifeMonths, now.getUTCDate()));
    return expiry.toLocaleDateString(undefined, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [isMounted, compoundId, freezerShelfLifeMonths]);

  // Auto-populate freezer expiry date when compound changes, unless overridden by user
  useEffect(() => {
    if (!isMounted) return;
    if (compoundId && !userOverrodeDate) {
      const now = new Date();
      const expiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + freezerShelfLifeMonths, now.getUTCDate()));
      const yyyy = expiry.getUTCFullYear();
      const mm = String(expiry.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(expiry.getUTCDate()).padStart(2, '0');
      setExpiresAt(`${yyyy}-${mm}-${dd}`);
    } else if (!compoundId && !userOverrodeDate) {
      setExpiresAt('');
    }
  }, [compoundId, freezerShelfLifeMonths, userOverrodeDate, isMounted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyVal = parseInt(quantity, 10);
    if (!compoundId || !totalMg || isNaN(qtyVal) || qtyVal < 1) {
      setError('Quantity must be a positive integer.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await addDryVialsAction({
        compoundId,
        totalMg,
        quantity: qtyVal,
        cost: cost || undefined,
        currency: cost ? currency : undefined,
        expiresAt: expiresAt || undefined,
        subjectUserId,
      });

      if (result.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.message || 'Failed to add dry vials.');
      }
    });
  };

  const isFormValid = compoundId && totalMg && parseFloat(totalMg) > 0 && parseInt(quantity, 10) >= 1;

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-dry-vials-title"
        className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-white/20 dark:border-slate-800/40 bg-white/10 dark:bg-slate-950/20 backdrop-blur-xl shadow-2xl animate-scale-in"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Snowflake className="h-5 w-5 text-sky-400 animate-pulse" />
              <div>
                <h2 id="add-dry-vials-title" className="text-base font-bold text-foreground">
                  Add Dry Vials to Freezer
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Record new unreconstituted lyophilized powder inventory.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close add dry vials dialog"
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
              <label htmlFor="modal-compound" className="block text-xs font-semibold text-foreground/80 mb-1">
                Compound
              </label>
              <select
                id="modal-compound"
                required
                value={compoundId}
                onChange={(e) => setCompoundId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
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
              <label htmlFor="modal-totalMg" className="block text-xs font-semibold text-foreground/80 mb-1">
                Vial Size / Total Weight (mg)
              </label>
              <input
                id="modal-totalMg"
                type="number"
                step="any"
                required
                placeholder="E.g., 5, 10, 15"
                value={totalMg}
                onChange={(e) => setTotalMg(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Quantity */}
            <div>
              <label htmlFor="modal-quantity" className="block text-xs font-semibold text-foreground/80 mb-1">
                Quantity of Vials
              </label>
              <input
                id="modal-quantity"
                type="number"
                min="1"
                step="1"
                required
                placeholder="E.g., 5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Optional custom expiration date */}
            <div>
              <label htmlFor="modal-expiresAt" className="block text-xs font-semibold text-foreground/80 mb-1">
                Freezer Expiration Date <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
              </label>
              <input
                id="modal-expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                  setUserOverrodeDate(true);
                }}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              {isMounted && compoundId && !expiresAt && (
                <p className="text-[10px] text-sky-600 dark:text-sky-400 mt-1 font-medium">
                  Auto-expires on: {estimatedExpiryDateStr} ({freezerShelfLifeMonths} months stability)
                </p>
              )}
            </div>

            {/* Cost and Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="modal-cost" className="block text-xs font-semibold text-foreground/80 mb-1">
                  Cost per Vial <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                </label>
                <input
                  id="modal-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="E.g., 45.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label htmlFor="modal-currency" className="block text-xs font-semibold text-foreground/80 mb-1">
                  Currency
                </label>
                <select
                  id="modal-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="USD">USD ($)</option>
                  <option value="USDT">USDT</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
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
              className="flex-1 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-50 text-white rounded-lg shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {isPending ? 'Saving...' : 'Add Vials'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
