import { describe, it, expect } from 'vitest';
import type { Schedule } from './types';
import { dosesPerDay, getDoseSlots } from './doseSlots';

describe('dosesPerDay', () => {
  it('returns 1 for Daily', () => {
    expect(dosesPerDay({ frequency: 'Daily' })).toBe(1);
  });

  it('returns 1 for EOD', () => {
    expect(dosesPerDay({ frequency: 'EOD' })).toBe(1);
  });

  it('returns 1 for SpecificDaysOfWeek', () => {
    expect(dosesPerDay({ frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Thu'] })).toBe(1);
  });

  it('returns 1 for CustomInterval', () => {
    expect(dosesPerDay({ frequency: 'CustomInterval', intervalDays: 3 })).toBe(1);
  });

  it('returns 2 for TwiceDaily', () => {
    expect(dosesPerDay({ frequency: 'TwiceDaily' })).toBe(2);
  });

  it('returns 2 for TwiceSpecificDaysOfWeek', () => {
    expect(dosesPerDay({ frequency: 'TwiceSpecificDaysOfWeek', daysOfWeek: ['Tue', 'Fri'] })).toBe(2);
  });
});

describe('getDoseSlots', () => {
  it('returns a single empty-label slot for a once-daily schedule', () => {
    const schedule: Schedule = { frequency: 'Daily' };
    expect(getDoseSlots(schedule)).toEqual([{ slot: 0, label: '' }]);
  });

  it('returns a single empty-label slot for a once-per-scheduled-day SpecificDaysOfWeek schedule', () => {
    const schedule: Schedule = { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Thu'] };
    expect(getDoseSlots(schedule, 'MORNING_AND_NIGHT')).toEqual([{ slot: 0, label: '' }]);
  });

  it('returns Morning/Evening for twice-daily with MORNING_AND_NIGHT preferredTime', () => {
    const schedule: Schedule = { frequency: 'TwiceDaily' };
    expect(getDoseSlots(schedule, 'MORNING_AND_NIGHT')).toEqual([
      { slot: 0, label: 'Morning' },
      { slot: 1, label: 'Evening' },
    ]);
  });

  it('returns Morning/Evening for TwiceSpecificDaysOfWeek with MORNING_AND_NIGHT preferredTime', () => {
    const schedule: Schedule = { frequency: 'TwiceSpecificDaysOfWeek', daysOfWeek: ['Tue', 'Fri'] };
    expect(getDoseSlots(schedule, 'MORNING_AND_NIGHT')).toEqual([
      { slot: 0, label: 'Morning' },
      { slot: 1, label: 'Evening' },
    ]);
  });

  it('returns 1st/2nd dose for twice-daily with a different preferredTime', () => {
    const schedule: Schedule = { frequency: 'TwiceDaily' };
    expect(getDoseSlots(schedule, 'MORNING_AFTERNOON_NIGHT')).toEqual([
      { slot: 0, label: '1st dose' },
      { slot: 1, label: '2nd dose' },
    ]);
  });

  it('returns 1st/2nd dose for twice-daily with undefined preferredTime', () => {
    const schedule: Schedule = { frequency: 'TwiceDaily' };
    expect(getDoseSlots(schedule, undefined)).toEqual([
      { slot: 0, label: '1st dose' },
      { slot: 1, label: '2nd dose' },
    ]);
  });

  it('returns 1st/2nd dose for twice-daily with null preferredTime', () => {
    const schedule: Schedule = { frequency: 'TwiceDaily' };
    expect(getDoseSlots(schedule, null)).toEqual([
      { slot: 0, label: '1st dose' },
      { slot: 1, label: '2nd dose' },
    ]);
  });

  it('returns 1st/2nd dose for twice-daily with no preferredTime argument', () => {
    const schedule: Schedule = { frequency: 'TwiceDaily' };
    expect(getDoseSlots(schedule)).toEqual([
      { slot: 0, label: '1st dose' },
      { slot: 1, label: '2nd dose' },
    ]);
  });
});
