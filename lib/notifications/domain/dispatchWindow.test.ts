import { describe, it, expect } from 'vitest';
import {
  parseHHMM,
  isInDispatchWindow,
  alreadyDispatchedToday,
  localPartsOf,
  WINDOW_MINUTES,
} from './dispatchWindow';

describe('parseHHMM', () => {
  it('returns minutes-since-midnight for valid input', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('07:00')).toBe(7 * 60);
    expect(parseHHMM('23:59')).toBe(23 * 60 + 59);
  });
  it('throws on malformed input', () => {
    expect(() => parseHHMM('7:00')).toThrow();
    expect(() => parseHHMM('24:00')).toThrow();
    expect(() => parseHHMM('12:60')).toThrow();
    expect(() => parseHHMM('')).toThrow();
  });
});

describe('isInDispatchWindow', () => {
  it('matches the exact preferred minute', () => {
    expect(isInDispatchWindow(7 * 60, 7 * 60)).toBe(true);
  });
  it(`matches anywhere in the ${WINDOW_MINUTES}-minute window`, () => {
    for (let offset = 0; offset < WINDOW_MINUTES; offset++) {
      expect(isInDispatchWindow(7 * 60 + offset, 7 * 60)).toBe(true);
    }
  });
  it('rejects values exactly at the window end', () => {
    expect(isInDispatchWindow(7 * 60 + WINDOW_MINUTES, 7 * 60)).toBe(false);
  });
  it('rejects values before the window', () => {
    expect(isInDispatchWindow(7 * 60 - 1, 7 * 60)).toBe(false);
  });
  it('handles wrap-around across midnight (pref = 23:50)', () => {
    expect(isInDispatchWindow(23 * 60 + 55, 23 * 60 + 50)).toBe(true);
    expect(isInDispatchWindow(4, 23 * 60 + 50)).toBe(true);
    expect(isInDispatchWindow(WINDOW_MINUTES + 1, 23 * 60 + 50)).toBe(false);
  });
  it('handles midnight preferred time (00:00)', () => {
    expect(isInDispatchWindow(0, 0)).toBe(true);
    expect(isInDispatchWindow(WINDOW_MINUTES - 1, 0)).toBe(true);
    expect(isInDispatchWindow(WINDOW_MINUTES, 0)).toBe(false);
    expect(isInDispatchWindow(1440 - 1, 0)).toBe(false);
  });
});

describe('alreadyDispatchedToday', () => {
  // 2026-05-23 14:00 UTC. In America/Denver this is 2026-05-23 08:00 (MDT).
  const noon = new Date('2026-05-23T14:00:00Z');

  it('returns false when no prior dispatch', () => {
    expect(alreadyDispatchedToday(noon, null, 'America/Denver')).toBe(false);
  });

  it('returns true when last dispatch was earlier the same local day', () => {
    const earlier = new Date('2026-05-23T13:00:00Z'); // 07:00 local
    expect(alreadyDispatchedToday(noon, earlier, 'America/Denver')).toBe(true);
  });

  it('returns false when last dispatch was the previous local day', () => {
    const yesterday = new Date('2026-05-22T13:00:00Z'); // previous day local
    expect(alreadyDispatchedToday(noon, yesterday, 'America/Denver')).toBe(false);
  });

  it('respects timezone for day boundaries', () => {
    // 2026-05-23 03:00 UTC is still 2026-05-22 in America/Denver (21:00 MDT prev day)
    const utcEarly = new Date('2026-05-23T03:00:00Z');
    const utcLater = new Date('2026-05-23T07:00:00Z'); // also still 2026-05-23 in UTC, but 01:00 local on 23rd
    expect(alreadyDispatchedToday(utcLater, utcEarly, 'America/Denver')).toBe(false);
    // And both fall on 2026-05-23 in UTC, so a naive UTC-day comparison would
    // incorrectly say "same day" — the localPartsOf-based check must catch this.
  });
});

describe('localPartsOf', () => {
  it('formats a UTC instant in America/Denver', () => {
    const parts = localPartsOf(new Date('2026-05-23T14:00:00Z'), 'America/Denver');
    expect(parts.yyyymmdd).toBe('2026-05-23');
    expect(parts.hh).toBe(8); // MDT = UTC-6
    expect(parts.mm).toBe(0);
  });
  it('formats a UTC instant in Pacific/Auckland (next-day rollover)', () => {
    // 2026-05-23 14:00 UTC is 2026-05-24 02:00 in Pacific/Auckland (NZST=+12)
    const parts = localPartsOf(new Date('2026-05-23T14:00:00Z'), 'Pacific/Auckland');
    expect(parts.yyyymmdd).toBe('2026-05-24');
    expect(parts.hh).toBe(2);
  });
});
