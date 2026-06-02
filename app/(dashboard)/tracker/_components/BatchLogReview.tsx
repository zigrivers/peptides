'use client';

import { useState, useTransition } from 'react';
import type { Protocol, DoseLog, SafetyWarning } from '@/lib/tracker/domain/types';
import type { DoseUnitsDisplay } from '@/lib/reconstitution/domain/doseUnits';
import { batchLogDosesAction } from '@/app/actions/tracker/batch-log-doses';

interface SerializedProtocol extends Omit<Protocol, 'startDate' | 'endDate'> {
  startDate: string;
  endDate: string | null;
}

interface SerializedDoseLog extends Omit<DoseLog, 'loggedAt' | 'scheduledDate'> {
  loggedAt: string;
  scheduledDate: string;
}

interface SerializedBatchDueItem {
  protocol: SerializedProtocol;
  existingLog: SerializedDoseLog | null;
  availableVials: number;
  isAvailable: boolean;
  safetyWarnings?: SafetyWarning[];
  doseUnits: DoseUnitsDisplay | null;
}

type Props = {
  items: SerializedBatchDueItem[];
  compoundNames: Record<string, string>; // compoundId → name
};


type ItemState = 'pending' | 'logged' | 'skipped' | 'failed';

export function BatchLogReview({ items, compoundNames }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    // Only pre-select protocols with no existing log — SKIPPED items require explicit opt-in
    // to avoid silently converting an intentional skip into a LOGGED dose.
    () => new Set(items.filter((i) => i.isAvailable && !i.existingLog).map((i) => i.protocol.id))
  );
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() => {
    const s: Record<string, ItemState> = {};
    items.forEach((i) => {
      s[i.protocol.id] = !i.existingLog
        ? 'pending'
        : i.existingLog.status === 'LOGGED'
          ? 'logged'
          : 'skipped';
    });
    return s;
  });
  const [warnings, setWarnings] = useState<Record<string, SafetyWarning[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function toggleProtocol(protocolId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(protocolId)) next.delete(protocolId);
      else next.add(protocolId);
      return next;
    });
  }

  function handleConfirm() {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) return;
    setError(null);

    startTransition(async () => {
      const result = await batchLogDosesAction({ selectedProtocolIds: selectedIds });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      const nextStates = { ...itemStates };
      const nextWarnings = { ...warnings };

      result.results.forEach((r) => {
        if (r.ok) {
          nextStates[r.protocolId] = 'logged';
          nextWarnings[r.protocolId] = r.warnings;
        } else {
          nextStates[r.protocolId] = 'failed';
        }
      });

      setItemStates(nextStates);
      setWarnings(nextWarnings);

      // Remove successfully logged protocols from the selected set so the Confirm
      // button count stays accurate if the user retries after partial failures.
      setSelected((prev) => {
        const next = new Set(prev);
        result.results.forEach((r) => { if (r.ok) next.delete(r.protocolId); });
        return next;
      });

      const allDone = items.every((i) => nextStates[i.protocol.id] === 'logged' || nextStates[i.protocol.id] === 'skipped');
      if (allDone) setDone(true);
    });
  }

  const pendingCount = items.filter((i) => itemStates[i.protocol.id] === 'pending').length;
  const skippedCount = items.filter((i) => itemStates[i.protocol.id] === 'skipped').length;
  const failedCount = items.filter((i) => itemStates[i.protocol.id] === 'failed').length;
  const loggedCount = items.filter((i) => itemStates[i.protocol.id] === 'logged').length;

  if (done || (pendingCount === 0 && skippedCount === 0 && failedCount === 0 && items.length > 0)) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
        <p className="text-sm font-medium text-green-700">
          Today: {loggedCount}/{items.length} complete
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">Log All Scheduled</h2>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const state = itemStates[item.protocol.id];
          const isSelected = selected.has(item.protocol.id);
          const itemWarnings = warnings[item.protocol.id] ?? [];

          if (state === 'logged') {
            return (
              <li key={item.protocol.id} className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                <span className="text-green-600 text-sm">&#10003;</span>
                <span className="text-sm text-green-700">
                  {compoundNames[item.protocol.compoundId] ?? item.protocol.compoundId} — <span className="font-mono">{item.protocol.dose.amount}</span> {item.protocol.dose.unit}
                </span>
              </li>
            );
          }

          return (
            <li key={item.protocol.id} className={`rounded-lg border px-3 py-2 ${state === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={isSelected && item.isAvailable}
                  disabled={!item.isAvailable || isPending}
                  onChange={() => item.isAvailable && toggleProtocol(item.protocol.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    {compoundNames[item.protocol.compoundId] ?? item.protocol.compoundId} — <span className="font-mono">{item.protocol.dose.amount}</span> {item.protocol.dose.unit}
                    {item.doseUnits?.unitsText && (
                      <span className="text-gray-400"> {item.doseUnits.unitsText}</span>
                    )}
                  </p>
                  {state === 'skipped' && item.isAvailable && (
                    <p className="text-xs text-yellow-700 mt-0.5">Previously skipped — log now?</p>
                  )}
                  {!item.isAvailable && (
                    <p className="text-xs text-yellow-700 mt-0.5">No vials available — cannot batch-log</p>
                  )}
                  {itemWarnings.map((w) => (
                    <p key={w.code} className="text-xs text-yellow-700 mt-0.5">{w.message}</p>
                  ))}
                  {state === 'failed' && (
                    <p className="text-xs text-red-700 mt-0.5">Failed to log</p>
                  )}
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      <button
        disabled={isPending || selected.size === 0}
        onClick={handleConfirm}
        className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {isPending ? 'Logging...' : `Confirm (${selected.size} dose${selected.size !== 1 ? 's' : ''})`}
      </button>
    </div>
  );
}
