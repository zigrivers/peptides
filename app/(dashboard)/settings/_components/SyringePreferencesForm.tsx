'use client';

import React, { useState, useTransition } from 'react';
import { saveSyringePreferencesAction } from '@/app/actions/reconstitution/save-syringe-preferences';

type SyringeStandard = 'U100' | 'U40';
type SyringeSize = '0.3' | '0.5' | '1.0';

interface Props {
  initialSyringeStandard: SyringeStandard;
  initialSyringeSize: SyringeSize;
}

const SELECT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground';

export function SyringePreferencesForm({ initialSyringeStandard, initialSyringeSize }: Props) {
  const [syringeStandard, setSyringeStandard] = useState<SyringeStandard>(initialSyringeStandard);
  const [syringeSize, setSyringeSize] = useState<SyringeSize>(initialSyringeSize);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSyringePreferencesAction(syringeStandard, syringeSize);
      if (result.ok) {
        setMessage({ kind: 'success', text: 'Syringe preferences saved.' });
      } else {
        setMessage({ kind: 'error', text: 'Could not save syringe preferences. Please try again.' });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="settings-syringe-standard" className="block text-sm font-medium text-foreground mb-1">
            Syringe type
          </label>
          <select
            id="settings-syringe-standard"
            value={syringeStandard}
            onChange={(e) => {
              setSyringeStandard(e.target.value as SyringeStandard);
              setMessage(null);
            }}
            className={SELECT_CLASS}
          >
            <option value="U100">U-100 Insulin Syringe</option>
            <option value="U40">U-40 Insulin Syringe</option>
          </select>
        </div>
        <div>
          <label htmlFor="settings-syringe-size" className="block text-sm font-medium text-foreground mb-1">
            Syringe capacity
          </label>
          <select
            id="settings-syringe-size"
            value={syringeSize}
            onChange={(e) => {
              setSyringeSize(e.target.value as SyringeSize);
              setMessage(null);
            }}
            className={SELECT_CLASS}
          >
            <option value="0.3">0.3 mL</option>
            <option value="0.5">0.5 mL</option>
            <option value="1.0">1.0 mL</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This applies app-wide — the tracker, reconstitution calculator, and inventory all use these
        syringe settings.
      </p>

      {message?.kind === 'error' && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
          {message.text}
        </p>
      )}
      {message?.kind === 'success' && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/40 rounded px-3 py-2">
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
      >
        {isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
