import { toUTCDay } from '@/lib/shared/date';

export interface WeekInfo {
  isContinuous: boolean;
  weekNumber: number;
  totalWeeks: number;
  percent: number | null;
  restStartDate: Date | null;
  elapsedDays: number;
}

/**
 * Parses a date string or Date object as a UTC day, appending 'T00:00:00Z'
 * to YYYY-MM-DD strings to ensure standard UTC day interpretation.
 *
 * @param s - The date string or Date object to parse.
 * @returns A Date object representing the parsed UTC day.
 */
export function parseAsUTCDay(s: string | Date | null | undefined): Date {
  if (!s) {
    return new Date(NaN);
  }
  if (s instanceof Date) {
    return toUTCDay(s);
  }
  let str = s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    str += 'T00:00:00Z';
  }
  return toUTCDay(new Date(str));
}

/**
 * Computes week info for a given protocol and compound profile at a specific event date.
 * For continuous protocols, calculates elapsed milestone timing without cycle progress.
 * For cycled protocols, calculates week number, total weeks, completion percentage,
 * rest start date, and elapsed days since the start of the protocol or cycle.
 *
 * @param proto - The protocol details.
 * @param profile - The compound profile details, including scheduling config.
 * @param eventDateStr - The target date string to compute week info for.
 * @param cycles - Map of cycle details.
 * @returns A WeekInfo object or null if protocol is not defined.
 */
export function getWeekInfo(
  proto: { startDate: Date | string; endDate: Date | string | null; cycleId: string | null } | undefined,
  profile: { cycleLengthWeeks?: number | null; restPeriodWeeks?: number | null } | undefined,
  eventDateStr: string,
  cycles: Record<string, { startDate: string; endDate: string | null }> | null | undefined
): WeekInfo | null {
  if (!proto) {
    return null;
  }

  const isContinuous = !profile || !profile.cycleLengthWeeks;
  const totalWeeks = profile?.cycleLengthWeeks ?? 1;

  const cycle = proto.cycleId && cycles ? cycles[proto.cycleId] : null;
  const startUTC = parseAsUTCDay(!isContinuous && cycle ? cycle.startDate : proto.startDate);
  const eventUTC = parseAsUTCDay(eventDateStr);

  if (isNaN(startUTC.getTime()) || isNaN(eventUTC.getTime())) {
    return {
      isContinuous: true,
      weekNumber: 1,
      totalWeeks: 1,
      percent: null,
      restStartDate: null,
      elapsedDays: 0,
    };
  }

  const elapsedMs = eventUTC.getTime() - startUTC.getTime();
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  const elapsedWeekNumber = Math.floor(elapsedDays / 7) + 1;
  const weekNumber = isContinuous ? elapsedWeekNumber : Math.min(totalWeeks, elapsedWeekNumber);
  const percent = Math.min(100, Math.round((weekNumber / totalWeeks) * 100));

  if (isContinuous) {
    return {
      isContinuous: true,
      weekNumber,
      totalWeeks,
      percent: null,
      restStartDate: null,
      elapsedDays,
    };
  }

  let restStartDate: Date | null = null;
  const cycleEndDate = cycle ? cycle.endDate : proto.endDate;
  if (cycleEndDate) {
    const endUTC = parseAsUTCDay(cycleEndDate);
    if (!isNaN(endUTC.getTime())) {
      restStartDate = parseAsUTCDay(new Date(endUTC.getTime() + 86400000));
    }
  } else {
    restStartDate = parseAsUTCDay(new Date(startUTC.getTime() + totalWeeks * 7 * 86400000));
  }

  return {
    isContinuous: false,
    weekNumber,
    totalWeeks,
    percent,
    restStartDate,
    elapsedDays,
  };
}
