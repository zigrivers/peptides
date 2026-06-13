'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProtocolAction } from '@/app/actions/tracker/update-protocol';
import type { Protocol } from '@/lib/tracker/domain/types';

type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Props = { protocol: Protocol };

export function EditProtocolForm({ protocol }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [doseAmount, setDoseAmount] = useState(protocol.dose.amount);
  const [doseUnit, setDoseUnit] = useState(protocol.dose.unit);
  const [frequency, setFrequency] = useState(protocol.schedule.frequency);
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(
    protocol.schedule.frequency === 'SpecificDaysOfWeek' ||
    protocol.schedule.frequency === 'TwiceSpecificDaysOfWeek'
      ? (protocol.schedule.daysOfWeek as DayOfWeek[])
      : []
  );
  const [intervalDays, setIntervalDays] = useState(
    protocol.schedule.frequency === 'CustomInterval'
      ? protocol.schedule.intervalDays
      : 2
  );
  const [adminRoute, setAdminRoute] = useState(protocol.administrationRoute);
  const [notes, setNotes] = useState(protocol.notes ?? '');

  function toggleDay(day: DayOfWeek) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function buildSchedule() {
    switch (frequency) {
      case 'Daily': return { frequency: 'Daily' as const };
      case 'TwiceDaily': return { frequency: 'TwiceDaily' as const };
      case 'EOD': return { frequency: 'EOD' as const };
      case 'SpecificDaysOfWeek': return { frequency: 'SpecificDaysOfWeek' as const, daysOfWeek };
      case 'TwiceSpecificDaysOfWeek': return { frequency: 'TwiceSpecificDaysOfWeek' as const, daysOfWeek };
      case 'CustomInterval': return { frequency: 'CustomInterval' as const, intervalDays };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateProtocolAction({
        protocolId: protocol.id,
        dose: { amount: doseAmount, unit: doseUnit },
        schedule: buildSchedule(),
        administrationRoute: adminRoute,
        notes: notes || null,
      });

      if (result.ok) {
        router.push('/tracker');
      } else {
        setError(result.message ?? result.error);
      }
    });
  }

  return (
    <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-900 p-6 md:p-8 shadow-xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Dose */}
        <div>
          <label htmlFor="dose-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              aria-label={`Dose amount in ${doseUnit}`}
              className="flex-1 rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
            />
            <select
              aria-label="Dose unit"
              value={doseUnit}
              onChange={(e) => setDoseUnit(e.target.value as typeof doseUnit)}
              className="rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
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
          <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Frequency
          </label>
          <select
            id="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as typeof protocol.schedule.frequency)}
            className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
          >
            <option value="Daily">Daily</option>
            <option value="TwiceDaily">Twice daily</option>
            <option value="EOD">Every other day (EOD)</option>
            <option value="SpecificDaysOfWeek">Specific days of the week</option>
            <option value="TwiceSpecificDaysOfWeek">Twice daily on specific days</option>
            <option value="CustomInterval">Custom interval (every N days)</option>
          </select>
        </div>

        {(frequency === 'SpecificDaysOfWeek' || frequency === 'TwiceSpecificDaysOfWeek') && (
          <div>
            <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Days of the week</p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    daysOfWeek.includes(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-primary/50'
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
            <label htmlFor="interval-days" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              className="w-24 rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
            />
          </div>
        )}

        {/* Administration route */}
        <div>
          <label htmlFor="admin-route" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Administration route
          </label>
          <select
            id="admin-route"
            value={adminRoute}
            onChange={(e) => setAdminRoute(e.target.value)}
            className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3"
          >
            <option value="SubQ">SubQ (Subcutaneous)</option>
            <option value="IM">IM (Intramuscular)</option>
            <option value="Oral">Oral</option>
            <option value="Nasal">Nasal</option>
            <option value="Topical">Topical</option>
            <option value="IV">IV (Intravenous)</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-2 px-3 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 text-sm font-semibold transition-all shadow disabled:opacity-60"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
