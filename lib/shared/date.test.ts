import { describe, it, expect } from 'vitest';
import { localDayAnchoredUTC } from './date';

describe('localDayAnchoredUTC (timezone-resilient "today")', () => {
  // The helper reads LOCAL getters (getFullYear/getMonth/getDate) and anchors them
  // to UTC midnight. We inject a `now` whose LOCAL day differs from its UTC day to
  // prove "today" follows the viewer's wall-clock day, not UTC. Using a stub that
  // ONLY exposes local getters also guards against a regression to getUTC*: that
  // would throw here rather than silently pass.
  const fakeNow = (year: number, monthIndex: number, day: number): Date =>
    ({ getFullYear: () => year, getMonth: () => monthIndex, getDate: () => day }) as Date;

  it('uses the viewer LOCAL calendar day, not the UTC day', () => {
    // Real-world scenario: 8pm Sunday June 14 in Mountain time is already
    // 02:00 Monday June 15 in UTC. The viewer's local day is the 14th, so a UTC
    // derivation (the old bug) would wrongly show the 15th. Here the injected
    // `now` reports local day = 14 → result must anchor to the 14th.
    expect(localDayAnchoredUTC(fakeNow(2026, 5, 14)).toISOString()).toBe('2026-06-14T00:00:00.000Z');
  });

  it('anchors to UTC midnight (zeroed time component)', () => {
    const result = localDayAnchoredUTC(fakeNow(2026, 2, 10));
    expect(result.toISOString()).toBe('2026-03-10T00:00:00.000Z');
  });

  it('handles a local day that has rolled into the new year', () => {
    expect(localDayAnchoredUTC(fakeNow(2027, 0, 1)).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('defaults to the current time when called with no argument', () => {
    const result = localDayAnchoredUTC();
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});
