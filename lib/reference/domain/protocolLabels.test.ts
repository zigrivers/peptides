import { describe, expect, it } from 'vitest';
import {
  buildProtocolSnapshotLabels,
  formatBodyDurationLabel,
  formatDurationHours,
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
      bodyDuration: {
        halfLifeHours: 165,
        halfLifeHoursMax: 184,
        effectiveDurationHours: 168,
        effectiveDurationHoursMax: 192,
        certainty: 'ESTABLISHED',
        frequencyImplication: 'Supports once-weekly dosing.',
      },
    });
    expect(rich).toEqual({
      cycleLabel: '8 Weeks',
      restLabel: '4 Weeks Washout',
      scheduleLabel: '2x Daily: 5 Days On / 2 Off',
      preferredTimeLabel: 'Morning and Night',
      bodyDurationLabel: 't½ 165 h (~6.9 d)–184 h (~7.7 d)',
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
      bodyDurationLabel: 'N/A',
    });
  });

  it('formats body duration hours and uncertainty markers', () => {
    expect(formatDurationHours(0.5)).toBe('0.5 h (~30 min)');
    expect(formatDurationHours(2)).toBe('2 h');
    expect(formatDurationHours(168)).toBe('168 h (~7 d)');
    expect(
      formatBodyDurationLabel({
        halfLifeHours: 2,
        halfLifeHoursMax: null,
        effectiveDurationHours: 12,
        effectiveDurationHoursMax: null,
        certainty: 'UNCERTAIN',
        frequencyImplication: 'Daily research dosing.',
      })
    ).toBe('t½ 2 h (uncertain)');
    expect(formatBodyDurationLabel(null)).toBe('N/A');
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
