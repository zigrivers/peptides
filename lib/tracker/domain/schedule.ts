import type { Schedule } from './types';

/**
 * Succinct, human-readable cadence label for a protocol schedule.
 * Shared by the tracker card, the regimen list, and the protocol form.
 */
export function formatScheduleFrequency(schedule: Schedule): string {
  switch (schedule.frequency) {
    case 'Daily':
      return 'Daily';
    case 'TwiceDaily':
      return 'Twice daily';
    case 'EOD':
      return 'Every other day';
    case 'CustomInterval':
      return schedule.intervalDays === 1 ? 'Every day' : `Every ${schedule.intervalDays} days`;
    case 'SpecificDaysOfWeek': {
      const days = schedule.daysOfWeek ?? [];
      return days.length > 0 ? days.join(', ') : 'Custom schedule';
    }
    case 'TwiceSpecificDaysOfWeek': {
      const days = schedule.daysOfWeek ?? [];
      return days.length > 0 ? `Twice daily on ${days.join(', ')}` : 'Custom schedule';
    }
    default:
      return 'Custom schedule';
  }
}
