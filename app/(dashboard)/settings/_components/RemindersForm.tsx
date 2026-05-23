'use client';

import { useActionState } from 'react';
import type {
  ChannelPreference,
  ReminderPreferenceRecord,
} from '@/lib/notifications/domain/types';
import type { UpdateReminderPreferencesState } from '@/app/actions/notifications/update-reminder-preferences';

interface Props {
  action: (
    prev: UpdateReminderPreferencesState | null,
    formData: FormData
  ) => Promise<UpdateReminderPreferencesState>;
  initial: ReminderPreferenceRecord | null;
  defaultTimezone: string;
}

const CHANNEL_OPTIONS: { value: ChannelPreference; label: string; description: string }[] = [
  { value: 'PUSH', label: 'Push only', description: 'Web push notification (install to home screen on iOS).' },
  { value: 'EMAIL', label: 'Email only', description: 'Email reminder — works without push permission.' },
  { value: 'BOTH', label: 'Push + email', description: 'Push notification with email as a fallback if push fails.' },
];

export function RemindersForm({ action, initial, defaultTimezone }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="reminderTime" className="block text-sm font-medium text-gray-700 mb-1">
          Daily reminder time
        </label>
        <input
          id="reminderTime"
          name="reminderTime"
          type="time"
          defaultValue={initial?.reminderTime ?? '07:00'}
          required
          className="rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
          Time zone
        </label>
        <input
          id="timezone"
          name="timezone"
          type="text"
          defaultValue={initial?.timezone ?? defaultTimezone}
          required
          placeholder="e.g. America/Denver"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-500">
          IANA timezone identifier. The reminder fires at this local time every day.
        </p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">Delivery channel</legend>
        <div className="space-y-2">
          {CHANNEL_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="channel"
                value={opt.value}
                defaultChecked={(initial?.channel ?? 'PUSH') === opt.value}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm text-gray-900">{opt.label}</span>
                <span className="block text-xs text-gray-500">{opt.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial?.enabled ?? true}
        />
        <span className="text-sm text-gray-700">Send daily reminders</span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="emailFallbackEnabled"
          defaultChecked={initial?.emailFallbackEnabled ?? true}
        />
        <span className="text-sm text-gray-700">
          Fall back to email if push fails (recommended)
        </span>
      </label>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
}
