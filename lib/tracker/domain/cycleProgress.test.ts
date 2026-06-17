import { describe, it, expect } from 'vitest';
import { getWeekInfo } from './cycleProgress';

describe('getWeekInfo Unit Tests', () => {
  it('returns continuous info with elapsed milestone timing when cycleLengthWeeks is missing', () => {
    const res = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: null },
      '2026-05-15',
      null
    );
    expect(res).toEqual({
      isContinuous: true,
      weekNumber: 3,
      totalWeeks: 1,
      percent: null,
      restStartDate: null,
      elapsedDays: 14,
    });
  });

  it('returns null if proto is undefined', () => {
    const res = getWeekInfo(
      undefined,
      { cycleLengthWeeks: 8 },
      '2026-05-15',
      null
    );
    expect(res).toBeNull();
  });

  it('calculates correct week number and elapsed days for cycled protocols', () => {
    // Start date May 1, event date May 25 (24 days elapsed)
    const res = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: 8, restPeriodWeeks: 4 },
      '2026-05-25',
      null
    );
    expect(res).toEqual({
      isContinuous: false,
      weekNumber: 4, // 24 / 7 = 3, so week 4
      totalWeeks: 8,
      percent: 50,
      restStartDate: new Date('2026-06-26T00:00:00.000Z'), // 56 days after May 1
      elapsedDays: 24,
    });
  });

  it('correctly uses cycle database record for dates if cycleId matches', () => {
    const cycles = {
      'cycle-abc': {
        startDate: '2026-05-10T00:00:00.000Z',
        endDate: '2026-07-05T00:00:00.000Z',
      },
    };
    const res = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: 'cycle-abc' },
      { cycleLengthWeeks: 8 },
      '2026-05-15',
      cycles
    );
    expect(res?.elapsedDays).toBe(5); // May 15 - May 10
    expect(res?.weekNumber).toBe(1);
    expect(res?.restStartDate).toEqual(new Date('2026-07-06T00:00:00.000Z')); // uses cycleEndDate + 1 day (since endDate is inclusive)
  });

  it('handles exact cycle boundary (last day and overflow day)', () => {
    // Start date May 1, totalWeeks = 8
    // Last day of cycle: 8 weeks * 7 = 56 days. Index 55 is the 56th day (June 25)
    const resLast = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: 8 },
      '2026-06-25',
      null
    );
    expect(resLast?.weekNumber).toBe(8);
    expect(resLast?.percent).toBe(100);

    // Overflow/exact boundary day (June 26, 56 days elapsed)
    const resOverflow = getWeekInfo(
      { startDate: '2026-05-01', endDate: null, cycleId: null },
      { cycleLengthWeeks: 8 },
      '2026-06-26',
      null
    );
    expect(resOverflow?.weekNumber).toBe(8);
    expect(resOverflow?.percent).toBe(100);
  });
});
