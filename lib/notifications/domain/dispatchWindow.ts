/**
 * Pure helpers for the dose-reminder dispatch decision. All functions are
 * timezone-aware and side-effect free — the dispatcher composes them inside
 * a single transaction so the cron logic is easy to test independently of
 * Prisma / web-push.
 */

export const WINDOW_MINUTES = 15;
export const MINUTES_PER_DAY = 1440;

/** Parses `HH:MM` (24h) into minutes-since-midnight. Throws on malformed input. */
export function parseHHMM(input: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(input);
  if (!m) throw new Error('invalid_hhmm');
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Returns the user's wall-clock view of `now` in `timezone` as { hh, mm, yyyymmdd }.
 *
 * Uses `Intl.DateTimeFormat` with an explicit locale and h23 hour cycle so the
 * output is stable across runtime locales (Node's default locale on Railway
 * could otherwise leak through).
 */
export function localPartsOf(
  now: Date,
  timezone: string
): { hh: number; mm: number; yyyymmdd: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hourRaw = get('hour');
  const minuteRaw = get('minute');
  // h23 returns "24" for midnight in some Node versions — normalise to "00".
  const hh = hourRaw === '24' ? 0 : Number(hourRaw);
  const mm = Number(minuteRaw);
  return { hh, mm, yyyymmdd: `${year}-${month}-${day}` };
}

/**
 * In-window predicate. The reminder fires when the user's local minute-of-day
 * is in [prefMinutes, prefMinutes + WINDOW_MINUTES) modulo 1440 — wrap-around
 * across midnight is handled correctly.
 */
export function isInDispatchWindow(localMinutes: number, prefMinutes: number): boolean {
  const start = prefMinutes;
  const end = (prefMinutes + WINDOW_MINUTES) % MINUTES_PER_DAY;
  if (start <= end) {
    return localMinutes >= start && localMinutes < end;
  }
  // Wrap-around (e.g. pref = 23:55 → window 23:55..00:10)
  return localMinutes >= start || localMinutes < end;
}

/**
 * Has this user already been dispatched on their current local calendar day?
 * Comparing local date strings (`YYYY-MM-DD`) avoids UTC offset bugs at the
 * day boundary.
 */
export function alreadyDispatchedToday(
  now: Date,
  lastDispatchedAt: Date | null,
  timezone: string
): boolean {
  if (!lastDispatchedAt) return false;
  const nowDay = localPartsOf(now, timezone).yyyymmdd;
  const lastDay = localPartsOf(lastDispatchedAt, timezone).yyyymmdd;
  return nowDay === lastDay;
}
