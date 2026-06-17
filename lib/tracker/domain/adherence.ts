import { isScheduledOn } from './ScheduleGenerator';
import { dosesPerDay } from './doseSlots';
import type { Schedule } from './types';

export type AdherenceProtocol = {
  id: string;
  schedule: Schedule;
  startDate: Date;
  endDate: Date | null;
  status: string;
};

export type AdherenceLog = {
  protocolId: string;
  scheduledDate: Date;
  status: string;
  doseSlot: number;
};

/** UTC YYYY-MM-DD key for a date. */
function utcKey(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
    .toISOString()
    .split('T')[0];
}

/**
 * Returns the set of YYYY-MM-DD dates (UTC) that are FULLY adhered: for every ACTIVE
 * protocol scheduled on that date, all `dosesPerDay(schedule)` slots have a LOGGED entry.
 *
 * Only considers dates that have at least one scheduled active protocol AND at least one
 * log (a day with zero logs can never be adhered). A date where NO active protocol is
 * scheduled (e.g. an EOD off-day) is NOT counted — matching the prior behavior where only
 * dates with logged doses contributed to the streak.
 *
 * SKIPPED (or any non-LOGGED status) does not count as a completed slot. Duplicate logs for
 * the same slot count once (distinct slots).
 *
 * Pure: no I/O. Result is sorted ascending.
 */
export function computeAdheredDates(
  protocols: AdherenceProtocol[],
  logs: AdherenceLog[]
): string[] {
  // Candidate dates: every date the user interacted with (has a log).
  const candidateDates = new Set<string>();
  for (const l of logs) {
    candidateDates.add(utcKey(l.scheduledDate));
  }

  // Index distinct LOGGED slots per (protocolId, dateKey).
  const loggedSlots = new Map<string, Set<number>>();
  for (const l of logs) {
    if (l.status !== 'LOGGED') continue;
    const key = `${l.protocolId}|${utcKey(l.scheduledDate)}`;
    let slots = loggedSlots.get(key);
    if (!slots) {
      slots = new Set<number>();
      loggedSlots.set(key, slots);
    }
    slots.add(l.doseSlot);
  }

  const activeProtocols = protocols.filter((p) => p.status === 'ACTIVE');

  const adhered: string[] = [];
  for (const dateKey of candidateDates) {
    const targetDate = new Date(`${dateKey}T00:00:00.000Z`);

    let anyScheduled = false;
    let allFull = true;
    for (const p of activeProtocols) {
      if (!isScheduledOn(p.schedule, p.startDate, p.endDate, targetDate)) continue;
      anyScheduled = true;
      const required = dosesPerDay(p.schedule);
      const logged = loggedSlots.get(`${p.id}|${dateKey}`)?.size ?? 0;
      if (logged < required) {
        allFull = false;
        break;
      }
    }

    if (anyScheduled && allFull) {
      adhered.push(dateKey);
    }
  }

  return adhered.sort();
}
