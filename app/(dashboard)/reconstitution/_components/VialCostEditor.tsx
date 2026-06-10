'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SerializedVialData } from '@/lib/reconstitution/application/VialService';
import { updateVialCostAction } from '@/app/actions/reconstitution/inventory-actions';
import { Pencil } from 'lucide-react';

const SUPPORTED_CURRENCIES = ['USD', 'USDT', 'EUR', 'GBP'] as const;

type Props = {
  vial: Pick<SerializedVialData, 'id' | 'cost' | 'currency'>;
  editLabel: string;
};

function formatCost(cost: string | null | undefined, currency: string | undefined) {
  if (!cost) return 'Cost not set';
  return `${cost} ${currency ?? 'USD'}`;
}

export function VialCostEditor({ vial, editLabel }: Props) {
  const router = useRouter();
  const [displayCost, setDisplayCost] = useState(vial.cost);
  const [displayCurrency, setDisplayCurrency] = useState(vial.currency ?? 'USD');
  const [cost, setCost] = useState(vial.cost ?? '');
  const [currency, setCurrency] = useState(vial.currency ?? 'USD');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDisplayCost(vial.cost);
    setDisplayCurrency(vial.currency ?? 'USD');
    if (!isEditing) {
      setCost(vial.cost ?? '');
      setCurrency(vial.currency ?? 'USD');
    }
  }, [isEditing, vial.cost, vial.currency]);

  const cancelEdit = () => {
    setCost(displayCost ?? '');
    setCurrency(displayCurrency);
    setError(null);
    setIsEditing(false);
  };

  const saveCost = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setError(null);

    const normalizedCost = cost.trim();
    startTransition(async () => {
      const result = await updateVialCostAction({
        vialId: vial.id,
        cost: normalizedCost,
        currency,
      });

      if (result.ok) {
        setDisplayCost(normalizedCost || null);
        setDisplayCurrency(currency);
        setIsEditing(false);
        router.refresh();
      } else {
        setError(result.message || 'Could not update cost.');
      }
    });
  };

  if (isEditing) {
    return (
      <form
        onSubmit={saveCost}
        onClick={(event) => event.stopPropagation()}
        className="mt-1.5 space-y-1"
      >
        <div className="flex items-center gap-1.5">
          <label htmlFor={`vial-cost-${vial.id}`} className="sr-only">
            Cost
          </label>
          <input
            id={`vial-cost-${vial.id}`}
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="Cost"
            className="w-20 rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground"
          />
          <label htmlFor={`vial-currency-${vial.id}`} className="sr-only">
            Currency
          </label>
          <select
            id={`vial-currency-${vial.id}`}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground"
          >
            {SUPPORTED_CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Save cost
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={isPending}
            className="rounded-md border border-input px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </form>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span>{formatCost(displayCost, displayCurrency)}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          setIsEditing(true);
        }}
        className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={editLabel}
        title={editLabel}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
