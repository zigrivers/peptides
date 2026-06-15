export function utcMidnightToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The viewer's LOCAL calendar day, anchored to UTC midnight.
 *
 * The tracker calendar operates entirely in UTC-anchored date strings, but "today"
 * must reflect the user's wall-clock day, not the UTC day. Deriving today from UTC
 * (e.g. getUTCDate / `new Date().toISOString()`) rolls the day forward for users
 * behind UTC in the evening — 8pm Mountain is already next-day 02:00 UTC — so the
 * app highlights tomorrow as "today". Reading LOCAL getters and anchoring to UTC
 * midnight keeps "today" correct while staying in the calendar's date-string space.
 *
 * @param now defaults to the current time; injectable for testing.
 */
export function localDayAnchoredUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function utcMidnightOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function toUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Strictly parses a YYYY-MM-DD string into a UTC midnight Date object.
 * Returns null if the format or calendar day is invalid.
 */
export function parseStrictUTCDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
