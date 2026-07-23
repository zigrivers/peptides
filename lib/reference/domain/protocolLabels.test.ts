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
      // Prefers effective duration; plain language (no leading t½)
      bodyDurationLabel: 'Lasts 7–8 days',
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

  it('formats body duration in plain language without leading t½', () => {
    expect(formatDurationHours(0.5)).toBe('30 min');
    expect(formatDurationHours(2)).toBe('2 hours');
    expect(formatDurationHours(168)).toBe('7 days');
    // Prefers effective duration over half-life for “how long it lasts”
    expect(
      formatBodyDurationLabel({
        halfLifeHours: 2,
        halfLifeHoursMax: null,
        effectiveDurationHours: 12,
        effectiveDurationHoursMax: null,
        certainty: 'UNCERTAIN',
        frequencyImplication: 'Daily research dosing.',
      })
    ).toBe('Lasts 12 hours (uncertain)');
    // Half-life only still uses plain “Lasts …” (not t½)
    expect(
      formatBodyDurationLabel({
        halfLifeHours: 2,
        halfLifeHoursMax: null,
        effectiveDurationHours: null,
        effectiveDurationHoursMax: null,
        certainty: 'ESTIMATED',
        frequencyImplication: 'Twice daily research dosing.',
      })
    ).toBe('Lasts 2 hours (estimate)');
    expect(formatBodyDurationLabel(null)).toBe('N/A');
    expect(
      formatBodyDurationLabel({
        halfLifeHours: 0.25,
        halfLifeHoursMax: 0.5,
        effectiveDurationHours: 4,
        effectiveDurationHoursMax: 12,
        certainty: 'UNCERTAIN',
        frequencyImplication: 'Once or twice daily.',
      })
    ).toBe('Lasts 4–12 hours (uncertain)');
    // Primary wording must not be half-life jargon
    const label = formatBodyDurationLabel({
      halfLifeHours: 165,
      halfLifeHoursMax: 184,
      effectiveDurationHours: 168,
      effectiveDurationHoursMax: 192,
      certainty: 'ESTABLISHED',
      frequencyImplication: 'Weekly.',
    });
    expect(label.startsWith('t')).toBe(false);
    expect(label.toLowerCase().includes('half-life')).toBe(false);
    expect(label.startsWith('Lasts ')).toBe(true);
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
