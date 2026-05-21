'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Compound } from '@/lib/reference/domain/types';
import { createProtocolAction } from '@/app/actions/tracker/create-protocol';

type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ManagedUser = { id: string; name: string | null; email: string };
type CycleOption = { id: string; name: string };

type Props = {
  compounds: Compound[];
  managedUsers: ManagedUser[];
  currentUserId: string;
  cyclesByUserId: Record<string, CycleOption[]>;
};

export function CreateProtocolForm({ compounds, managedUsers, currentUserId, cyclesByUserId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [compoundId, setCompoundId] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseUnit, setDoseUnit] = useState<'mcg' | 'mg' | 'IU' | 'mL'>('mcg');
  const [frequency, setFrequency] = useState<'Daily' | 'EOD' | 'SpecificDaysOfWeek' | 'CustomInterval'>('Daily');
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>([]);
  const [intervalDays, setIntervalDays] = useState(2);
  const [adminRoute, setAdminRoute] = useState('SubQ');
  const [startDate, setStartDate] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [subjectUserId, setSubjectUserId] = useState(currentUserId);

  function handleSubjectChange(newSubjectId: string) {
    setSubjectUserId(newSubjectId);
    if (newSubjectId !== currentUserId) setCycleId('');
  }
  const [notes, setNotes] = useState('');

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input = {
      subjectUserId,
      compoundId,
      cycleId: cycleId || undefined,
      dose: { amount: doseAmount, unit: doseUnit },
      schedule: buildSchedule(),
      administrationRoute: adminRoute,
      startDate: new Date(startDate),
      notes: notes || undefined,
    };

    startTransition(async () => {
      const result = await createProtocolAction(input);
      if (result.ok) {
        router.push('/tracker');
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Assign to */}
      {managedUsers.length > 0 && (
        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
            Assign to
          </label>
          <select
            id="subject"
            value={subjectUserId}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Compound */}
      <div>
        <label htmlFor="compound" className="block text-sm font-medium text-gray-700 mb-1">
          Compound <span className="text-red-500">*</span>
        </label>
        <select
          id="compound"
          required
          value={compoundId}
          onChange={(e) => setCompoundId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select a compound…</option>
          {compounds.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Dose */}
      <div>
        <label htmlFor="dose-amount" className="block text-sm font-medium text-gray-700 mb-1">
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
            placeholder="250"
            aria-label={`Dose amount in ${doseUnit}`}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            aria-label="Dose unit"
            value={doseUnit}
            onChange={(e) => setDoseUnit(e.target.value as typeof doseUnit)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="mcg">mcg</option>
            <option value="mg">mg</option>
            <option value="IU">IU</option>
            <option value="mL">mL</option>
          </select>
        </div>
      </div>

      {/* Frequency */}
      <div>
        <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 mb-1">
          Frequency
        </label>
        <select
          id="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as typeof frequency)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="Daily">Daily</option>
          <option value="EOD">Every other day (EOD)</option>
          <option value="SpecificDaysOfWeek">Specific days of the week</option>
          <option value="CustomInterval">Custom interval (every N days)</option>
        </select>
      </div>

      {frequency === 'SpecificDaysOfWeek' && (
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">Days of the week</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  daysOfWeek.includes(day)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {frequency === 'CustomInterval' && (
        <div>
          <label htmlFor="interval-days" className="block text-sm font-medium text-gray-700 mb-1">
            Every N days
          </label>
          <input
            id="interval-days"
            type="number"
            inputMode="numeric"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(Number(e.target.value))}
            aria-label="Interval in days"
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Administration route */}
      <div>
        <label htmlFor="admin-route" className="block text-sm font-medium text-gray-700 mb-1">
          Administration route
        </label>
        <select
          id="admin-route"
          value={adminRoute}
          onChange={(e) => setAdminRoute(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="SubQ">SubQ (Subcutaneous)</option>
          <option value="IM">IM (Intramuscular)</option>
          <option value="Oral">Oral</option>
          <option value="Nasal">Nasal</option>
          <option value="Topical">Topical</option>
          <option value="IV">IV (Intravenous)</option>
        </select>
      </div>

      {/* Start date */}
      <div>
        <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
          Start date <span className="text-red-500">*</span>
        </label>
        <input
          id="start-date"
          type="date"
          required
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Cycle */}
      {(cyclesByUserId[subjectUserId] ?? []).length > 0 && (
        <div>
          <label htmlFor="cycle" className="block text-sm font-medium text-gray-700 mb-1">
            Cycle <span className="text-gray-400">(optional)</span>
          </label>
          <select
            id="cycle"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">No cycle</option>
            {(cyclesByUserId[subjectUserId] ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-md bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {isPending ? 'Saving…' : 'Create Protocol'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
