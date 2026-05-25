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

/**
 * Returns true if targetDate is a scheduled dose day for the given schedule + protocol bounds.
 * All dates must be UTC midnight.
 */
export function isScheduledOn(
  schedule: Schedule,
  startDate: Date,
  endDate: Date | null,
  targetDate: Date
): boolean {
  const startUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const targetUTC = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));

  if (targetUTC < startUTC) return false;
  if (endDate) {
    const endUTC = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
    if (targetUTC > endUTC) return false;
  }

  const diffDays = Math.round((targetUTC.getTime() - startUTC.getTime()) / 86_400_000);

  switch (schedule.frequency) {
    case 'Daily':
      return true;
    case 'EOD':
      return diffDays % 2 === 0;
    case 'SpecificDaysOfWeek': {
      const dow = targetUTC.getUTCDay();
      return schedule.daysOfWeek.some((d) => DAY_INDEX[d] === dow);
    }
    case 'CustomInterval': {
      const interval = Math.max(1, schedule.intervalDays);
      return diffDays % interval === 0;
    }
  }
}

/**
 * Resolves all scheduled dates for a given protocol schedule within a specific viewport range [rangeStart, rangeEnd].
 * All input dates and output dates are normalized to UTC midnight.
 * Optimized range-based lookup to avoid O(N * M) calendar cell loops (MMR F-003).
 */
export function getScheduledDatesInRange(
  schedule: Schedule,
  protocolStart: Date,
  protocolEnd: Date | null,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const pStartUTC = new Date(Date.UTC(protocolStart.getUTCFullYear(), protocolStart.getUTCMonth(), protocolStart.getUTCDate()));
  const pEndUTC = protocolEnd 
    ? new Date(Date.UTC(protocolEnd.getUTCFullYear(), protocolEnd.getUTCMonth(), protocolEnd.getUTCDate()))
    : null;
  const rStartUTC = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()));
  const rEndUTC = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), rangeEnd.getUTCDate()));

  const startBound = new Date(Math.max(pStartUTC.getTime(), rStartUTC.getTime()));
  const endBound = new Date(pEndUTC ? Math.min(pEndUTC.getTime(), rEndUTC.getTime()) : rEndUTC.getTime());

  if (startBound > endBound) return [];

  const results: Date[] = [];
  let cursor = new Date(Date.UTC(startBound.getUTCFullYear(), startBound.getUTCMonth(), startBound.getUTCDate()));
  const limitUTC = new Date(Date.UTC(endBound.getUTCFullYear(), endBound.getUTCMonth(), endBound.getUTCDate()));

  switch (schedule.frequency) {
    case 'Daily': {
      while (cursor <= limitUTC) {
        results.push(new Date(cursor));
        cursor = addDays(cursor, 1);
      }
      break;
    }
    case 'EOD': {
      const diffDays = Math.round((cursor.getTime() - pStartUTC.getTime()) / 86_400_000);
      const remainder = diffDays % 2;
      if (remainder !== 0) {
        cursor = addDays(cursor, (2 - remainder));
      }
      while (cursor <= limitUTC) {
        results.push(new Date(cursor));
        cursor = addDays(cursor, 2);
      }
      break;
    }
    case 'SpecificDaysOfWeek': {
      const targetIndices = schedule.daysOfWeek.map((d) => DAY_INDEX[d]);
      if (targetIndices.length === 0) break;
      while (cursor <= limitUTC) {
        if (targetIndices.includes(cursor.getUTCDay())) {
          results.push(new Date(cursor));
        }
        cursor = addDays(cursor, 1);
      }
      break;
    }
    case 'CustomInterval': {
      const interval = Math.max(1, schedule.intervalDays);
      const diffDays = Math.round((cursor.getTime() - pStartUTC.getTime()) / 86_400_000);
      const remainder = diffDays % interval;
      if (remainder !== 0) {
        cursor = addDays(cursor, (interval - remainder));
      }
      while (cursor <= limitUTC) {
        results.push(new Date(cursor));
        cursor = addDays(cursor, interval);
      }
      break;
    }
  }

  return results;
}

