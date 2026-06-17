import { describe, it, expect } from 'vitest';
import { computeAdheredDates, type AdherenceProtocol, type AdherenceLog } from './adherence';
import type { Schedule } from './types';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const daily: Schedule = { frequency: 'Daily' };
const twiceDaily: Schedule = { frequency: 'TwiceDaily' };
const eod: Schedule = { frequency: 'EOD' };

function protocol(overrides: Partial<AdherenceProtocol> & { id: string; schedule: Schedule }): AdherenceProtocol {
  return {
    startDate: utc('2026-01-01'),
    endDate: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

function log(overrides: Partial<AdherenceLog> & { protocolId: string; scheduledDate: Date }): AdherenceLog {
  return {
    status: 'LOGGED',
    doseSlot: 0,
    ...overrides,
  };
}

describe('computeAdheredDates', () => {
  describe('once-daily protocol', () => {
    it('counts a date with one LOGGED slot as adhered', () => {
      const protocols = [protocol({ id: 'p1', schedule: daily })];
      const logs = [log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') })];
      expect(computeAdheredDates(protocols, logs)).toEqual(['2026-01-05']);
    });

    it('does not count a scheduled date with zero logs', () => {
      const protocols = [protocol({ id: 'p1', schedule: daily })];
      // A different date has a log so the candidate set is non-empty, but 2026-01-06 has none.
      const logs = [log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') })];
      const result = computeAdheredDates(protocols, logs);
      expect(result).not.toContain('2026-01-06');
    });
  });

  describe('twice-daily protocol', () => {
    it('does NOT count a date with only slot 0 LOGGED', () => {
      const protocols = [protocol({ id: 'p1', schedule: twiceDaily })];
      const logs = [log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 0 })];
      expect(computeAdheredDates(protocols, logs)).toEqual([]);
    });

    it('counts a date with slots 0 AND 1 LOGGED', () => {
      const protocols = [protocol({ id: 'p1', schedule: twiceDaily })];
      const logs = [
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 0 }),
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 1 }),
      ];
      expect(computeAdheredDates(protocols, logs)).toEqual(['2026-01-05']);
    });

    it('does not double-count a duplicated slot toward the required count', () => {
      const protocols = [protocol({ id: 'p1', schedule: twiceDaily })];
      const logs = [
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 0 }),
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 0 }),
      ];
      expect(computeAdheredDates(protocols, logs)).toEqual([]);
    });
  });

  describe('SKIPPED handling', () => {
    it('does not count SKIPPED as LOGGED (slot0 LOGGED + slot1 SKIPPED → not adhered)', () => {
      const protocols = [protocol({ id: 'p1', schedule: twiceDaily })];
      const logs = [
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 0, status: 'LOGGED' }),
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05'), doseSlot: 1, status: 'SKIPPED' }),
      ];
      expect(computeAdheredDates(protocols, logs)).toEqual([]);
    });
  });

  describe('multiple active protocols due the same day', () => {
    it('counts the date only when BOTH protocols are fully logged', () => {
      const protocols = [
        protocol({ id: 'p1', schedule: daily }),
        protocol({ id: 'p2', schedule: twiceDaily }),
      ];
      const onlyOneFull = [
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') }),
        log({ protocolId: 'p2', scheduledDate: utc('2026-01-05'), doseSlot: 0 }),
      ];
      expect(computeAdheredDates(protocols, onlyOneFull)).toEqual([]);

      const bothFull = [
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') }),
        log({ protocolId: 'p2', scheduledDate: utc('2026-01-05'), doseSlot: 0 }),
        log({ protocolId: 'p2', scheduledDate: utc('2026-01-05'), doseSlot: 1 }),
      ];
      expect(computeAdheredDates(protocols, bothFull)).toEqual(['2026-01-05']);
    });
  });

  describe('inactive and off-schedule protocols', () => {
    it('does not require a non-ACTIVE protocol', () => {
      const protocols = [
        protocol({ id: 'p1', schedule: daily }),
        protocol({ id: 'p2', schedule: twiceDaily, status: 'COMPLETED' }),
      ];
      // p1 fully logged; p2 (inactive) only has slot 0 logged — should not block adherence.
      const logs = [
        log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') }),
        log({ protocolId: 'p2', scheduledDate: utc('2026-01-05'), doseSlot: 0 }),
      ];
      expect(computeAdheredDates(protocols, logs)).toEqual(['2026-01-05']);
    });

    it('does not require a protocol that has ended before the date', () => {
      const protocols = [
        protocol({ id: 'p1', schedule: daily }),
        protocol({ id: 'p2', schedule: twiceDaily, endDate: utc('2026-01-01') }),
      ];
      const logs = [log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') })];
      expect(computeAdheredDates(protocols, logs)).toEqual(['2026-01-05']);
    });

    it('does not count an EOD off-day (no active protocol scheduled)', () => {
      // EOD from 2026-01-01: scheduled on odd-diff days 01,03,05...; 2026-01-02 is an off-day.
      const protocols = [protocol({ id: 'p1', schedule: eod, startDate: utc('2026-01-01') })];
      // Log exists on an off day (e.g. a stray log) — date should NOT count since p1 isn't due.
      const logs = [log({ protocolId: 'p1', scheduledDate: utc('2026-01-02') })];
      expect(computeAdheredDates(protocols, logs)).toEqual([]);
    });

    it('counts an EOD on-day when fully logged', () => {
      const protocols = [protocol({ id: 'p1', schedule: eod, startDate: utc('2026-01-01') })];
      const logs = [log({ protocolId: 'p1', scheduledDate: utc('2026-01-03') })];
      expect(computeAdheredDates(protocols, logs)).toEqual(['2026-01-03']);
    });
  });

  it('returns an empty array when there are no logs', () => {
    const protocols = [protocol({ id: 'p1', schedule: daily })];
    expect(computeAdheredDates(protocols, [])).toEqual([]);
  });

  it('returns dates sorted ascending', () => {
    const protocols = [protocol({ id: 'p1', schedule: daily })];
    const logs = [
      log({ protocolId: 'p1', scheduledDate: utc('2026-01-07') }),
      log({ protocolId: 'p1', scheduledDate: utc('2026-01-05') }),
    ];
    expect(computeAdheredDates(protocols, logs)).toEqual(['2026-01-05', '2026-01-07']);
  });
});
