import type { DayOfWeek, Schedule } from './types';

const DAY_INDEX: Record<DayOfWeek, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Generates the next `count` dose dates for a given schedule starting from `startDate`.
 * All dates are returned in UTC at midnight.
 */
export function generateScheduleDates(schedule: Schedule, startDate: Date, count: number): Date[] {
  const results: Date[] = [];
  const start = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  );

  switch (schedule.frequency) {
    case 'Daily': {
      for (let i = 0; i < count; i++) {
        results.push(addDays(start, i));
      }
      break;
    }
    case 'EOD': {
      for (let i = 0; i < count; i++) {
        results.push(addDays(start, i * 2));
      }
      break;
    }
    case 'SpecificDaysOfWeek': {
      const targetIndices = schedule.daysOfWeek.map((d) => DAY_INDEX[d]).sort((a, b) => a - b);
      let cursor = new Date(start);
      while (results.length < count) {
        const dow = cursor.getUTCDay();
        if (targetIndices.includes(dow)) {
          results.push(new Date(cursor));
        }
        cursor = addDays(cursor, 1);
        // Guard: prevent infinite loop if no days specified
        if (targetIndices.length === 0) break;
      }
      break;
    }
    case 'CustomInterval': {
      const interval = Math.max(1, schedule.intervalDays);
      for (let i = 0; i < count; i++) {
        results.push(addDays(start, i * interval));
      }
      break;
    }
  }

  return results;
}
