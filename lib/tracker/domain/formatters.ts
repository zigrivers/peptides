import type { Schedule } from './types';

export function formatSchedule(schedule: Schedule): string {
  switch (schedule.frequency) {
    case 'Daily': return 'Daily';
    case 'EOD': return 'Every other day';
    case 'SpecificDaysOfWeek': return schedule.daysOfWeek.join(', ');
    case 'CustomInterval': return `Every ${schedule.intervalDays} days`;
  }
}
