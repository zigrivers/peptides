import { describe, it, expect } from 'vitest';
import { formatScheduleFrequency } from './schedule';

describe('formatScheduleFrequency', () => {
  it('Daily', () => expect(formatScheduleFrequency({ frequency: 'Daily' })).toBe('Daily'));
  it('TwiceDaily', () => expect(formatScheduleFrequency({ frequency: 'TwiceDaily' })).toBe('Twice daily'));
  it('EOD', () => expect(formatScheduleFrequency({ frequency: 'EOD' })).toBe('Every other day'));
  it('CustomInterval', () =>
    expect(formatScheduleFrequency({ frequency: 'CustomInterval', intervalDays: 3 })).toBe('Every 3 days'));
  it('CustomInterval of 1 day', () =>
    expect(formatScheduleFrequency({ frequency: 'CustomInterval', intervalDays: 1 })).toBe('Every day'));
  it('SpecificDaysOfWeek', () =>
    expect(formatScheduleFrequency({ frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Wed', 'Fri'] })).toBe('Mon, Wed, Fri'));
  it('TwiceSpecificDaysOfWeek', () =>
    expect(formatScheduleFrequency({ frequency: 'TwiceSpecificDaysOfWeek', daysOfWeek: ['Mon', 'Thu'] })).toBe('Twice daily on Mon, Thu'));
  it('empty specific days falls back gracefully', () =>
    expect(formatScheduleFrequency({ frequency: 'SpecificDaysOfWeek', daysOfWeek: [] })).toBe('Custom schedule'));
});
