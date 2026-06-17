import type { Schedule } from './types';

export type DoseSlot = { slot: number; label: string };

/** Doses administered per scheduled day for this schedule. */
export function dosesPerDay(schedule: Schedule): 1 | 2 {
  return schedule.frequency === 'TwiceDaily' || schedule.frequency === 'TwiceSpecificDaysOfWeek' ? 2 : 1;
}

/**
 * Per-day dose occurrences with display labels.
 * - 1/day → a single slot with an empty label (UI shows no slot label).
 * - 2/day → "Morning"/"Evening" when preferredTime is MORNING_AND_NIGHT, else "1st dose"/"2nd dose".
 */
export function getDoseSlots(schedule: Schedule, preferredTime?: string | null): DoseSlot[] {
  const n = dosesPerDay(schedule);
  if (n === 1) return [{ slot: 0, label: '' }];
  if (preferredTime === 'MORNING_AND_NIGHT') {
    return [
      { slot: 0, label: 'Morning' },
      { slot: 1, label: 'Evening' },
    ];
  }
  return [
    { slot: 0, label: '1st dose' },
    { slot: 1, label: '2nd dose' },
  ];
}
