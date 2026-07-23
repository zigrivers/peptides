import { describe, expect, it } from 'vitest';
import {
  buildProtocolSnapshotLabels,
  formatFrequency,
  formatPreferredTime,
  formatProtocolSchedule,
  formatSupplementSchedule,
  hasDisplayFrequency,
} from './protocolLabels';

describe('protocolLabels', () => {
  it('formats frequency and preferred-time enums like Catalog', () => {
    expect(formatFrequency(null)).toBe('Not Specified');
    expect(formatFrequency('TWICE_WEEKLY')).toBe('Twice Weekly');
    expect(formatPreferredTime(null)).toBe('N/A');
    expect(formatPreferredTime('MORNING_AND_NIGHT')).toBe('Morning and Night');
  });

  it('builds daily on/off protocol schedules', () => {
    expect(
      formatProtocolSchedule({
        dosingFrequency: 'DAILY',
        customFrequencyDescription: null,
        daysOn: 5,
        daysOff: 2,
        dosesPerDay: 2,
      })
    ).toBe('2x Daily: 5 Days On / 2 Off');
  });

  it('builds Catalog-equivalent snapshot labels including defaults', () => {
    const rich = buildProtocolSnapshotLabels({
      cycleLengthWeeks: 8,
      restPeriodWeeks: 4,
      dosingFrequency: 'DAILY',
      customFrequencyDescription: null,
      daysOn: 5,
      daysOff: 2,
      dosesPerDay: 2,
      preferredTime: 'MORNING_AND_NIGHT',
    });
    expect(rich).toEqual({
      cycleLabel: '8 Weeks',
      restLabel: '4 Weeks Washout',
      scheduleLabel: '2x Daily: 5 Days On / 2 Off',
      preferredTimeLabel: 'Morning and Night',
    });

    const sparse = buildProtocolSnapshotLabels({
      cycleLengthWeeks: null,
      restPeriodWeeks: null,
      dosingFrequency: null,
      customFrequencyDescription: null,
      daysOn: null,
      daysOff: null,
      dosesPerDay: null,
      preferredTime: null,
    });
    expect(sparse).toEqual({
      cycleLabel: 'Continuous',
      restLabel: 'N/A',
      scheduleLabel: 'Not Specified',
      preferredTimeLabel: 'N/A',
    });
  });

  it('formats supplement schedules and frequency display guards', () => {
    expect(
      formatSupplementSchedule({ dosingFrequency: 'DAILY', dosesPerDay: 2 })
    ).toBe('Daily (2x daily)');
    expect(hasDisplayFrequency('Once daily')).toBe(true);
    expect(hasDisplayFrequency('N/A')).toBe(false);
    expect(hasDisplayFrequency(undefined)).toBe(false);
  });
});
