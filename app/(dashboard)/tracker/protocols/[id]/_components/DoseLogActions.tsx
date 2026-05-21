'use client';

import { useState, useTransition } from 'react';
import type { DoseAmount, SafetyWarning } from '@/lib/tracker/domain/types';
import { logDoseAction } from '@/app/actions/tracker/log-dose';

type Props = {
  protocolId: string;
  amount: DoseAmount;
  existingStatus?: 'LOGGED' | 'SKIPPED';
};

function localDateISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DoseLogActions({ protocolId, amount, existingStatus }: Props) {
  const scheduledDate = localDateISO();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'LOGGED' | 'SKIPPED' | null>(existingStatus ?? null);
  const [warnings, setWarnings] = useState<SafetyWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showChangeOptions, setShowChangeOptions] = useState(false);

  function handleLog(logStatus: 'LOGGED' | 'SKIPPED') {
    setError(null);
    startTransition(async () => {
      const result = await logDoseAction({ protocolId, scheduledDate, amount, status: logStatus });
      if (result.ok) {
        setStatus(result.doseLog.status as 'LOGGED' | 'SKIPPED');
        setWarnings(result.warnings);
        setShowChangeOptions(false);
      } else {
        setError(result.message);
      }
    });
  }

  if (status && !showChangeOptions) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${status === 'LOGGED' ? 'text-green-700' : 'text-gray-500'}`}>
            {status === 'LOGGED' ? 'Dose logged ✓' : 'Skipped'}
          </span>
          <button
            onClick={() => setShowChangeOptions(true)}
            className="text-xs text-indigo-600 hover:underline"
          >
            Change
          </button>
        </div>
        {warnings.map((w) => (
          <p key={w.code} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
            {w.message}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-sm text-red-700">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={() => handleLog('LOGGED')}
          className="rounded-md bg-green-600 text-white px-4 py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
        >
          Log Dose
        </button>
        <button
          disabled={isPending}
          onClick={() => handleLog('SKIPPED')}
          className="rounded-md border border-gray-300 text-gray-600 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          Skip
        </button>
        {showChangeOptions && (
          <button
            onClick={() => setShowChangeOptions(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        )}
      </div>
      {warnings.map((w) => (
        <p key={w.code} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          {w.message}
        </p>
      ))}
    </div>
  );
}
