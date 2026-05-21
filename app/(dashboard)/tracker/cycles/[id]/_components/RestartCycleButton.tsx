'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restartCycleAction } from '@/app/actions/tracker/cycle';

export function RestartCycleButton({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [newStartDate, setNewStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleRestart() {
    setError(null);
    if (!newStartDate) { setError('Please select a new start date.'); return; }
    startTransition(async () => {
      const result = await restartCycleAction({ cycleId, newStartDate });
      if (result.ok) {
        router.push(`/tracker/cycles/${result.newCycle.id}`);
      } else {
        setError(result.message);
      }
    });
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-md border border-indigo-600 text-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-50 transition-colors"
      >
        Restart Cycle
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="newStartDate">
          New start date
        </label>
        <input
          id="newStartDate"
          type="date"
          value={newStartDate}
          onChange={(e) => setNewStartDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={handleRestart}
          className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          Confirm Restart
        </button>
        <button
          onClick={() => { setShowForm(false); setError(null); }}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
