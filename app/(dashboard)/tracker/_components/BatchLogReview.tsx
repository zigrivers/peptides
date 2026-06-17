'use client';

import { useState, useTransition, useEffect } from 'react';
import type { Protocol, DoseLog, SafetyWarning } from '@/lib/tracker/domain/types';
import type { DoseUnitsDisplay } from '@/lib/reconstitution/domain/doseUnits';
import { batchLogDosesAction } from '@/app/actions/tracker/batch-log-doses';

interface SerializedProtocol extends Omit<Protocol, 'startDate' | 'endDate'> {
  startDate: string;
  endDate: string | null;
}

interface SerializedDoseLog extends Omit<DoseLog, 'loggedAt' | 'scheduledDate' | 'loggedCost'> {
  loggedAt: string;
  scheduledDate: string;
  loggedCost: string | null;
}

interface SerializedBatchDueItem {
  protocol: SerializedProtocol;
  doseSlot: number;
  slotLabel: string;
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

// Items are keyed per (protocol, slot) so twice-daily protocols track each dose independently.
function itemKey(item: { protocol: { id: string }; doseSlot: number }): string {
  return `${item.protocol.id}:${item.doseSlot}`;
}

export function BatchLogReview({ items, compoundNames }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    // Only pre-select slots with no existing log — SKIPPED items require explicit opt-in
    // to avoid silently converting an intentional skip into a LOGGED dose. Keyed per slot.
    () => new Set(items.filter((i) => i.isAvailable && !i.existingLog).map((i) => itemKey(i)))
  );
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(() => {
    const s: Record<string, ItemState> = {};
    items.forEach((i) => {
      s[itemKey(i)] = !i.existingLog
        ? 'pending'
        : i.existingLog.status === 'LOGGED'
          ? 'logged'
          : 'skipped';
    });
    return s;
  });
  const [warnings, setWarnings] = useState<Record<string, SafetyWarning[]>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItemStates((prevStates) => {
      const nextStates: Record<string, ItemState> = {};
      items.forEach((i) => {
        const key = itemKey(i);
        if (prevStates[key] === 'failed' && !i.existingLog) {
          nextStates[key] = 'failed';
        } else {
          nextStates[key] = !i.existingLog
            ? 'pending'
            : i.existingLog.status === 'LOGGED'
              ? 'logged'
              : 'skipped';
        }
      });
      return nextStates;
    });

    setSelected((prev) => {
      const next = new Set<string>();
      items.forEach((i) => {
        const key = itemKey(i);
        if (i.isAvailable && !i.existingLog && prev.has(key)) {
          next.add(key);
        }
      });
      return next;
    });
  }, [items]);

  function toggleItem(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    const selectedKeys = Array.from(selected);
    if (selectedKeys.length === 0) return;
    setError(null);

    // The action logs every slot of a selected protocol, so submit unique protocol IDs.
    const selectedProtocolIds = Array.from(new Set(selectedKeys.map((k) => k.split(':')[0])));

    startTransition(async () => {
      const result = await batchLogDosesAction({ selectedProtocolIds });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      const nextStates = { ...itemStates };
      const nextWarnings = { ...warnings };

      result.results.forEach((r) => {
        const key = `${r.protocolId}:${r.doseSlot}`;
        if (r.ok) {
          nextStates[key] = 'logged';
          nextWarnings[key] = r.warnings;
        } else {
          nextStates[key] = 'failed';
        }
      });

      setItemStates(nextStates);
      setWarnings(nextWarnings);

      // Remove successfully logged slots from the selected set so the Confirm
      // button count stays accurate if the user retries after partial failures.
      setSelected((prev) => {
        const next = new Set(prev);
        result.results.forEach((r) => { if (r.ok) next.delete(`${r.protocolId}:${r.doseSlot}`); });
        return next;
      });

      const allDone = items.every((i) => nextStates[itemKey(i)] === 'logged' || nextStates[itemKey(i)] === 'skipped');
      if (allDone) setDone(true);
    });
  }

  const pendingCount = items.filter((i) => itemStates[itemKey(i)] === 'pending').length;
  const skippedCount = items.filter((i) => itemStates[itemKey(i)] === 'skipped').length;
  const failedCount = items.filter((i) => itemStates[itemKey(i)] === 'failed').length;
  const loggedCount = items.filter((i) => itemStates[itemKey(i)] === 'logged').length;

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
          const key = itemKey(item);
          const state = itemStates[key];
          const isSelected = selected.has(key);
          const itemWarnings = warnings[key] ?? [];

          if (state === 'logged') {
            return (
              <li key={key} className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
                <span className="text-green-600 text-sm">&#10003;</span>
                <span className="text-sm text-green-700">
                  {compoundNames[item.protocol.compoundId] ?? item.protocol.compoundId} — <span className="font-mono">{item.protocol.dose.amount}</span> {item.protocol.dose.unit}
                  {item.slotLabel && <span className="text-green-600"> · {item.slotLabel}</span>}
                </span>
              </li>
            );
          }

          return (
            <li key={key} className={`rounded-lg border px-3 py-2 ${state === 'failed' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
              <label className="flex min-h-9 items-start gap-3 rounded-md px-1 py-1 cursor-pointer hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  checked={isSelected && item.isAvailable}
                  disabled={!item.isAvailable || isPending}
                  onChange={() => item.isAvailable && toggleItem(key)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">
                    {compoundNames[item.protocol.compoundId] ?? item.protocol.compoundId} — <span className="font-mono">{item.protocol.dose.amount}</span> {item.protocol.dose.unit}
                    {item.slotLabel && <span className="text-gray-500"> · {item.slotLabel}</span>}
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
