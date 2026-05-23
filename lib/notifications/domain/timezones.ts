/**
 * Builds the list of IANA timezone identifiers shown as autocomplete
 * suggestions in the reminders form. Prefers `Intl.supportedValuesOf` when
 * available (Node ≥ 18.13 / modern browsers) so the list stays current with
 * the runtime's TZ database; falls back to a small curated list of common
 * zones for older runtimes.
 *
 * Optionally hoists the user's current timezone to the top so it appears
 * first in the dropdown.
 */
const FALLBACK_TIMEZONES: readonly string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Athens',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
];

export function buildTimezoneSuggestions(preferredFirst?: string | null): readonly string[] {
  const supported = typeof (Intl as unknown as {
    supportedValuesOf?: (key: 'timeZone') => string[];
  }).supportedValuesOf === 'function';

  const base = supported
    ? ((Intl as unknown as { supportedValuesOf: (key: 'timeZone') => string[] }).supportedValuesOf(
        'timeZone'
      ) as string[])
    : [...FALLBACK_TIMEZONES];

  if (!preferredFirst) return base;
  if (base.includes(preferredFirst)) {
    return [preferredFirst, ...base.filter((tz) => tz !== preferredFirst)];
  }
  return [preferredFirst, ...base];
}
