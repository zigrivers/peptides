import { describe, it, expect } from 'vitest';
import { calculateElapsedWeeks } from './benefits';

describe('calculateElapsedWeeks', () => {
  it('returns 0 for a start date in the future', () => {
    const start = new Date('2026-06-01T00:00:00Z');
    const now = new Date('2026-05-25T12:00:00Z');
    expect(calculateElapsedWeeks(start, now)).toBe(0);
  });

  it('returns 1 for the exact start date (Day 0)', () => {
    const start = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-05-25T12:00:00Z');
    expect(calculateElapsedWeeks(start, now)).toBe(1);
  });

  it('returns 1 for Day 6 (end of first week)', () => {
    const start = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-05-31T23:59:59Z');
    expect(calculateElapsedWeeks(start, now)).toBe(1);
  });

  it('returns 2 for Day 7 (start of second week)', () => {
    const start = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    expect(calculateElapsedWeeks(start, now)).toBe(2);
  });

  it('returns 2 for Day 13', () => {
    const start = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-06-07T12:00:00Z');
    expect(calculateElapsedWeeks(start, now)).toBe(2);
  });

  it('returns 3 for Day 14', () => {
    const start = new Date('2026-05-25T00:00:00Z');
    const now = new Date('2026-06-08T00:00:00Z');
    expect(calculateElapsedWeeks(start, now)).toBe(3);
  });

  it('handles timezone differences by normalizing to UTC midnight', () => {
    const start = new Date('2026-05-25T23:00:00-04:00'); // equivalent to 2026-05-26T03:00:00Z
    const now = new Date('2026-06-01T01:00:00-04:00');  // equivalent to 2026-06-01T05:00:00Z
    // start UTC date: 26th. now UTC date: 1st. diff is 6 days = Week 1.
    expect(calculateElapsedWeeks(start, now)).toBe(1);
  });
});
