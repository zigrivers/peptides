'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Check, Calendar, AlertCircle, Edit2, Info, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import type { Protocol, DoseLog, InjectionSite } from '@/lib/tracker/domain/types';
import type { CompoundProfile } from '@/lib/reference/domain/types';
import { getScheduledDatesInRange } from '@/lib/tracker/domain/ScheduleGenerator';
import { logDoseAction } from '@/app/actions/tracker/log-dose';
import { rescheduleDoseAction } from '@/app/actions/tracker/reschedule-dose';
import { batchLogDatesAction } from '@/app/actions/tracker/batch-log-dates';
import { getCapColor } from '@/lib/reconstitution/domain/syringe';
import { sitesEqualLegacy, getSitesForRoute, suggestNextSite, getSitesMeta } from '@/lib/tracker/domain/SiteRotation';
import type { DoseUnitsDisplay } from '@/lib/reconstitution/domain/doseUnits';
import { calculateStreak, type StreakResult } from '@/lib/tracker/domain/streak';
import { ConfettiCanvas } from '@/app/(dashboard)/dashboard/_components/ConfettiCanvas';
import { SitePicker, type SiteData, formatSiteLabel, formatSiteUseAgeForSentence } from './SitePicker';
import { toUTCDay } from '@/lib/shared/date';

type CalendarEvent = {
  id: string;
  protocolId: string;
  compoundId: string;
  compoundName: string;
  compoundSlug: string;
  doseAmount: string;
  doseUnit: string;
  type: 'LOGGED' | 'SKIPPED' | 'SCHEDULED' | 'PENDING' | 'RESCHEDULED';
  loggedAt?: Date;
  injectionSite?: InjectionSite;
  note?: string;
  isOffline?: boolean;
  scheduledDateStr?: string;
  administrationRoute?: string;
};

interface SerializedProtocol extends Omit<Protocol, 'startDate' | 'endDate'> {
  startDate: string | Date;
  endDate: string | Date | null;
}

interface Props {
  protocols: SerializedProtocol[];
  doseLogs: (Omit<DoseLog, 'loggedAt' | 'scheduledDate'> & { loggedAt: string; scheduledDate: string })[];
  compounds: Record<string, { name: string; slug: string; profile?: Partial<CompoundProfile> | null }>;
  siteSuggestions?: Record<string, SiteData>;
  initialDateISO: string;
  loggedDates?: string[];
  /** Server-computed "units to draw" per compound for SCHEDULED doses (no Decimals client-side). */
  doseUnitsByCompoundId?: Record<string, DoseUnitsDisplay>;
  syringeStandard?: 'U100' | 'U40';
  cycles?: Record<string, { startDate: string; endDate: string | null }>;
}

type SerializedDoseLog = Props['doseLogs'][number];

function getCompoundAbbreviation(name: string): string {
  if (!name) return '';
  const cleanName = name.trim();
  const lower = cleanName.toLowerCase();
  
  if (lower.startsWith('bpc-157') || lower.startsWith('bpc157')) return 'BPC';
  if (lower.startsWith('tb-500') || lower.startsWith('tb500')) return 'TB';
  if (lower.startsWith('tirzepatide')) return 'TIRZ';
  if (lower.startsWith('semaglutide')) return 'SEMA';
  if (lower.startsWith('ipamorelin')) return 'IPA';
  if (lower.startsWith('melanotan ii') || lower.startsWith('melanotan-ii') || lower.startsWith('melanotan 2') || lower.startsWith('melanotan2')) return 'MT2';
  if (lower.startsWith('sermorelin')) return 'SERM';
  if (lower.startsWith('cjc-1295') || lower.startsWith('cjc1295')) return 'CJC';
  if (lower.startsWith('aod-9604') || lower.startsWith('aod9604')) return 'AOD';
  if (lower.startsWith('epitalon')) return 'EPI';
  if (lower.startsWith('tesamorelin')) return 'TESA';
  if (lower.startsWith('mots-c') || lower.startsWith('motsc')) return 'MOTS';
  if (lower.startsWith('pt-141') || lower.startsWith('pt141')) return 'PT';

  if (cleanName.includes('-')) {
    const firstPart = cleanName.split('-')[0].trim();
    if (firstPart.length > 0) return firstPart.toUpperCase();
  }

  return cleanName.slice(0, 4).toUpperCase();
}

function toUTCDateString(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().split('T')[0];
}

function toUTCDateFromString(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function buildSiteDataForCalendarEvent(
  event: CalendarEvent,
  protocols: Protocol[],
  logs: SerializedDoseLog[],
  targetDateStr: string,
  fallbackSiteData?: SiteData
): SiteData | null {
  const validSites = getSitesForRoute(event.administrationRoute ?? '');
  if (validSites.length === 0) return null;

  const currentProtocol = protocols.find((p) => p.id === event.protocolId);
  if (!currentProtocol) {
    return fallbackSiteData ?? {
      suggestion: null,
      validSites,
      siteMeta: validSites.map((site) => ({ site, lastUsed: null, daysSinceLastUse: null, isRested: true })),
      recentSites: [],
    };
  }

  const targetDate = toUTCDateFromString(targetDateStr);
  const protocolsById = new Map(protocols.map((protocol) => [protocol.id, protocol]));

  const relevantLogs = logs
    .filter((log) => {
      if (log.id === event.id) return false;
      if (log.status !== 'LOGGED' || !log.injectionSite) return false;

      const logProtocol = protocolsById.get(log.protocolId);
      if (!logProtocol) return false;
      if (logProtocol.userId !== currentProtocol.userId) return false;
      if (logProtocol.compoundId !== currentProtocol.compoundId) return false;

      return toUTCDateString(log.scheduledDate) <= targetDateStr;
    })
    .map((log) => ({
      injectionSite: log.injectionSite as InjectionSite,
      scheduledDate: toUTCDateFromString(toUTCDateString(log.scheduledDate)),
      loggedAt: new Date(log.loggedAt),
    }))
    .sort((a, b) => {
      const scheduledDelta = b.scheduledDate.getTime() - a.scheduledDate.getTime();
      if (scheduledDelta !== 0) return scheduledDelta;
      return b.loggedAt.getTime() - a.loggedAt.getTime();
    });

  const recentSites = relevantLogs.map((log) => log.injectionSite);

  return {
    suggestion: suggestNextSite(recentSites, validSites),
    validSites,
    siteMeta: getSitesMeta(relevantLogs, validSites, targetDate),
    recentSites,
  };
}

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
function parseAsUTCDay(s: string | Date | null | undefined): Date {
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
 * If the protocol is continuous, returns standard continuous info.
 * Otherwise, calculates week number, total weeks, completion percentage, rest start date,
 * and elapsed days since the start of the protocol or cycle.
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

  if (isContinuous) {
    return {
      isContinuous: true,
      weekNumber: 1,
      totalWeeks,
      percent: null,
      restStartDate: null,
      elapsedDays: 0,
    };
  }

  const cycle = proto.cycleId && cycles ? cycles[proto.cycleId] : null;
  const startUTC = parseAsUTCDay(cycle ? cycle.startDate : proto.startDate);
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
  const weekNumber = Math.min(totalWeeks, Math.floor(elapsedDays / 7) + 1);
  const percent = Math.min(100, Math.round((weekNumber / totalWeeks) * 100));

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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getSundayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = date.getUTCDate() - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
}

const EMPTY_DATES: string[] = [];
const EMPTY_DOSE_UNITS: Record<string, DoseUnitsDisplay> = {};

export function TrackerCalendar({ protocols: serializedProtocols, doseLogs, compounds, siteSuggestions = {}, initialDateISO, loggedDates = EMPTY_DATES, doseUnitsByCompoundId = EMPTY_DOSE_UNITS, cycles = {} }: Props) {
  const protocols = React.useMemo(() => {
    return serializedProtocols.map((p) => ({
      ...p,
      startDate: p.startDate instanceof Date ? p.startDate : new Date(p.startDate),
      endDate: p.endDate ? (p.endDate instanceof Date ? p.endDate : new Date(p.endDate)) : null,
    })) as Protocol[];
  }, [serializedProtocols]);

  const router = useRouter();
  const [localLogs, setLocalLogs] = useState(doseLogs);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return initialDateISO ? new Date(initialDateISO) : new Date();
  });

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = initialDateISO ? new Date(initialDateISO) : new Date();
    return getSundayOfWeek(d);
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editSite, setEditSite] = useState<Record<string, InjectionSite | null>>({});
  const [isLogPending, startLogTransition] = useTransition();
  const [logErrors, setLogErrors] = useState<Record<string, string>>({});

  // Drag-and-drop rescheduling state
  const [isRescheduling, startRescheduling] = useTransition();

  // Bulk select logging state
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkProtocolId, setBulkProtocolId] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [isBulkActionPending, startBulkAction] = useTransition();

  useEffect(() => {
    setLocalLogs(doseLogs);
  }, [doseLogs]);

  const [streak, setStreak] = useState<StreakResult | null>(null);
  const [triggerConfetti, setTriggerConfetti] = useState(false);

  // Client-side timezone-resilient streak calculation
  useEffect(() => {
    const now = new Date();
    const clientTodayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const calculated = calculateStreak(loggedDates, clientTodayUTC);
    setStreak(calculated);
  }, [loggedDates]);

  // Completed-day celebration triggers
  useEffect(() => {
    const selectedDateStr = selectedDate.toISOString().split('T')[0];
    const selectedEvents = eventsByDateString[selectedDateStr] || [];
    if (selectedEvents.length === 0) return;

    const loggedCount = selectedEvents.filter((e) => e.type === 'LOGGED' || e.type === 'SKIPPED').length;
    const totalCount = selectedEvents.length;
    const isCompleted = totalCount > 0 && loggedCount === totalCount;

    if (isCompleted) {
      const celebrateKey = `celebrated_tracker_${selectedDateStr}`;
      const hasSessionStorage = typeof window !== 'undefined' && window.sessionStorage;
      const lastCelebrated = hasSessionStorage ? sessionStorage.getItem(celebrateKey) : 'true';
      if (!lastCelebrated && hasSessionStorage) {
        setTriggerConfetti(true);
        sessionStorage.setItem(celebrateKey, 'true');
      }
    }
  }, [localLogs, selectedDate]);

  const handlePrevWeek = () => {
    setCurrentWeekStart((d) => {
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() - 7);
      return next;
    });
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart((d) => {
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    });
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    });
  };

  const handleJumpToToday = () => {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    setSelectedDate(todayUTC);
    setCurrentWeekStart(getSundayOfWeek(todayUTC));
  };

  const calendarStart = new Date(currentWeekStart);
  const calendarEnd = new Date(currentWeekStart);
  calendarEnd.setUTCDate(calendarEnd.getUTCDate() + 6);

  const eventsByDateString: Record<string, CalendarEvent[]> = {};

  const addEvent = (dateStr: string, event: CalendarEvent) => {
    if (!eventsByDateString[dateStr]) {
      eventsByDateString[dateStr] = [];
    }
    const exists = eventsByDateString[dateStr].some(
      (e) => e.protocolId === event.protocolId && e.type === event.type
    );
    if (!exists) {
      eventsByDateString[dateStr].push(event);
    }
  };

  // 1. Process database logs in the viewport
  localLogs.forEach((log) => {
    const logDate = new Date(log.scheduledDate);
    const dateStr = logDate.toISOString().split('T')[0];

    const proto = protocols.find((p) => p.id === log.protocolId);
    const slug = proto ? (compounds[proto.compoundId]?.slug ?? 'unknown') : 'unknown';
    const name = proto ? (compounds[proto.compoundId]?.name ?? 'Compound') : 'Compound';

    addEvent(dateStr, {
      id: log.id,
      protocolId: log.protocolId,
      compoundId: proto?.compoundId ?? 'unknown',
      compoundName: name,
      compoundSlug: slug,
      doseAmount: log.amount.amount,
      doseUnit: log.amount.unit,
      type: log.status as 'LOGGED' | 'SKIPPED' | 'PENDING' | 'RESCHEDULED',
      loggedAt: new Date(log.loggedAt),
      injectionSite: log.injectionSite ? (log.injectionSite as InjectionSite) : undefined,
      note: log.note || undefined,
      isOffline: 'isOffline' in log ? (log as { isOffline?: boolean }).isOffline : undefined,
      scheduledDateStr: dateStr,
      administrationRoute: proto?.administrationRoute,
    });
  });

  // 2. Compute future scheduled doses in viewport for active protocols
  protocols.forEach((p) => {
    if (p.status !== 'ACTIVE') return;

    const generationStart = selectedDate < calendarStart ? selectedDate : calendarStart;
    const generationEnd = selectedDate > calendarEnd ? selectedDate : calendarEnd;
    const dates = getScheduledDatesInRange(p.schedule, p.startDate, p.endDate, generationStart, generationEnd);
    
    dates.forEach((d) => {
      const dateStr = d.toISOString().split('T')[0];
      
      const alreadyLogged = eventsByDateString[dateStr]?.some(
        (e) => e.protocolId === p.id && (e.type === 'LOGGED' || e.type === 'SKIPPED' || e.type === 'PENDING' || e.type === 'RESCHEDULED')
      );
      if (alreadyLogged) return;

      const comp = compounds[p.compoundId] || { name: 'Compound', slug: 'unknown' };

      addEvent(dateStr, {
        id: `scheduled-${p.id}-${dateStr}`,
        protocolId: p.id,
        compoundId: p.compoundId,
        compoundName: comp.name,
        compoundSlug: comp.slug,
        doseAmount: p.dose.amount,
        doseUnit: p.dose.unit,
        type: 'SCHEDULED',
        scheduledDateStr: dateStr,
        administrationRoute: p.administrationRoute,
      });
    });
  });

  // Generate 7 weekly cells
  const cells: { date: Date; dateStr: string; events: CalendarEvent[] }[] = [];
  const cursor = new Date(calendarStart);

  for (let i = 0; i < 7; i++) {
    const dateStr = cursor.toISOString().split('T')[0];
    cells.push({
      date: new Date(cursor),
      dateStr,
      events: eventsByDateString[dateStr] || [],
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const selectedDateStr = selectedDate.toISOString().split('T')[0];
  const selectedEvents = eventsByDateString[selectedDateStr] || [];

  // Drag and Drop Event Handlers
  const handleDragStart = (ev: React.DragEvent, event: CalendarEvent, dateStr: string) => {
    ev.dataTransfer.setData('text/plain', JSON.stringify({
      doseLogId: (event.type !== 'SCHEDULED' && !event.id.startsWith('scheduled-')) ? event.id : undefined,
      protocolId: event.protocolId,
      sourceDate: dateStr,
    }));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (ev: React.DragEvent, targetDateStr: string) => {
    ev.preventDefault();
    try {
      const dataStr = ev.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const { doseLogId, protocolId, sourceDate } = JSON.parse(dataStr);
      if (sourceDate === targetDateStr) return;

      startRescheduling(async () => {
        const result = await rescheduleDoseAction({
          doseLogId,
          protocolId,
          sourceDate,
          targetDate: targetDateStr,
        });
        if (result.ok) {
          router.refresh();
        } else {
          alert(result.message);
        }
      });
    } catch (err) {
      console.error('[handleDrop] error:', err);
    }
  };

  // Bulk actions handling
  const handleCellClick = (date: Date, dateStr: string) => {
    if (isBulkMode) {
      setSelectedDates((prev) =>
        prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
      );
    } else {
      setSelectedDate(date);
    }
  };

  const handleBulkLog = (status: 'LOGGED' | 'SKIPPED') => {
    if (!bulkProtocolId || selectedDates.length === 0) return;

    startBulkAction(async () => {
      const result = await batchLogDatesAction({
        protocolId: bulkProtocolId,
        dates: selectedDates,
        status,
        note: bulkNote.trim() || undefined,
      });

      if (result.ok) {
        setIsBulkMode(false);
        setSelectedDates([]);
        setBulkNote('');
        router.refresh();
      } else {
        alert(result.message);
      }
    });
  };

  /**
   * Helper to format cycle progress bar information for display.
   * 
   * @param e - The calendar event.
   * @param info - Precalculated WeekInfo for this event/protocol.
   */
  const getCycleInfo = (e: CalendarEvent, info: WeekInfo | null) => {
    if (!info) return null;

    if (info.isContinuous) {
      return {
        isContinuous: true,
        text: 'Continuous',
        percent: null,
      };
    }

    // Rest period text
    let restText = '';
    const profile = compounds[e.compoundId]?.profile;
    const restWeeks = profile?.restPeriodWeeks;
    
    if (info.restStartDate) {
      const formattedRestStart = info.restStartDate.toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
      });
      
      if (restWeeks) {
        restText = ` — rest period of ${restWeeks} weeks starts ~${formattedRestStart}`;
      } else {
        restText = ` — rest period starts ~${formattedRestStart}`;
      }
    }

    return {
      isContinuous: false,
      text: `Week ${info.weekNumber} of ${info.totalWeeks} (${info.percent}%)${restText}`,
      percent: info.percent,
    };
  };

  /**
   * Helper to render the expected benefits milestone list for an event.
   * 
   * @param e - The calendar event.
   * @param info - Precalculated WeekInfo for this event/protocol.
   */
  const renderExpectedBenefits = (e: CalendarEvent, info: WeekInfo | null) => {
    if (e.type !== 'LOGGED') return null;

    const profile = compounds[e.compoundId]?.profile;
    const timeline = profile?.benefitTimeline;
    if (!timeline || timeline.length === 0) return null;

    if (!info || info.isContinuous) return null;

    const validTimeline = timeline.filter((item) => item && typeof item.week === 'number' && Array.isArray(item.benefits) && item.benefits.length > 0);
    const currentWeekItem = validTimeline.find((item) => item.week === info.weekNumber);
    const pastItems = validTimeline.filter((item) => item.week < info.weekNumber);
    const futureItems = validTimeline.filter((item) => item.week > info.weekNumber);

    // If there's no milestones to display, skip
    if (!currentWeekItem && pastItems.length === 0 && futureItems.length === 0) return null;

    return (
      <div className="pt-2 border-t border-gray-100 dark:border-gray-900/50 mt-2 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Expected Benefits (Week {info.weekNumber})</span>
        </div>

        {/* Current Milestone */}
        {currentWeekItem && currentWeekItem.benefits.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-primary tracking-wider">Current Milestone</p>
            <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-0.5 ml-1">
              {currentWeekItem.benefits.map((benefit, idx) => (
                <li key={idx}>{benefit}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Upcoming Milestones */}
        {futureItems.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Upcoming Milestones</p>
            <div className="space-y-2.5 ml-1">
              {futureItems.map((item, idx) => {
                const days = Math.max(0, (item.week - 1) * 7 - info.elapsedDays);
                const rel = days === 0 ? 'starts today' : `(starts in ~${days} ${days === 1 ? 'day' : 'days'})`;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-gray-700 dark:text-gray-200">Week {item.week}:</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                        {rel}
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-0.5 ml-2">
                      {item.benefits.map((benefit, bIdx) => (
                        <li key={bIdx} className="leading-relaxed">{benefit}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible Past Milestones */}
        {pastItems.length > 0 && (
          <div className="space-y-1">
            <details className="group/details text-xs text-gray-500">
              <summary className="hover:text-gray-700 outline-none text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider select-none cursor-pointer flex items-center gap-1">
                <span>Past Milestones</span>
                <span className="text-[9px] text-gray-500 dark:text-gray-400 lowercase font-normal group-open/details:hidden">
                  (click to show)
                </span>
              </summary>
              <div className="mt-1.5 ml-2 space-y-2.5 border-l-2 border-gray-100 dark:border-gray-800 pl-3 animate-[fadeIn_0.2s_ease-out]">
                {pastItems.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <span className="font-semibold text-xs text-gray-700 dark:text-gray-200 block">Week {item.week}:</span>
                    <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 space-y-0.5 ml-2">
                      {item.benefits.map((benefit, bIdx) => (
                        <li key={bIdx} className="leading-relaxed">{benefit}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  };

  const handleInlineSave = (event: CalendarEvent, status: 'LOGGED' | 'SKIPPED') => {
    setLogErrors((prev) => {
      const copy = { ...prev };
      delete copy[event.id];
      return copy;
    });
    const routeSites = getSitesForRoute(event.administrationRoute ?? '');
    const requiresSite = routeSites.length > 0;
    
    let eventSite = editSite[event.id] ?? event.injectionSite ?? null;
    if (eventSite && eventSite.bodyPart === 'abdomen') {
      eventSite = { ...eventSite, bodyPart: 'abdomen-lower' };
    }
    const eventNote = editNotes[event.id] ?? '';

    const targetDateStr = event.scheduledDateStr || selectedDateStr;

    if (status === 'LOGGED' && requiresSite && !eventSite) {
      setLogErrors((prev) => ({ ...prev, [event.id]: 'Please select an injection site.' }));
      return;
    }

    const performOfflineEnqueue = async () => {
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const res = await q.enqueue({
          protocolId: event.protocolId,
          scheduledDate: targetDateStr,
          deviceId: 'web-client',
          amount: { amount: event.doseAmount, unit: event.doseUnit as 'mcg' | 'mg' | 'IU' | 'mL' },
          status,
          injectionSite: status === 'LOGGED' ? (eventSite ?? undefined) : undefined,
          note: eventNote.trim(),
        });
        if (res.ok) {
          window.dispatchEvent(new Event('offline-sync-queue-updated'));
          const newLog = {
            id: res.id,
            protocolId: event.protocolId,
            status,
            scheduledDate: new Date(targetDateStr + 'T00:00:00.000Z').toISOString(),
            amount: { amount: event.doseAmount, unit: event.doseUnit as 'mcg' | 'mg' | 'IU' | 'mL' },
            loggedAt: new Date().toISOString(),
            isOffline: true,
            note: eventNote.trim() || null,
            injectionSite: status === 'LOGGED' ? eventSite : null,
          };
          setLocalLogs((prev) => [
            ...prev.filter(l => !(l.protocolId === event.protocolId && l.scheduledDate.startsWith(targetDateStr))),
            newLog as unknown as Props['doseLogs'][number]
          ]);
          setEditingEventId(null);
          setExpandedEventId(null);
          setEditNotes((prev) => {
            const copy = { ...prev };
            delete copy[event.id];
            return copy;
          });
          setEditSite((prev) => {
            const copy = { ...prev };
            delete copy[event.id];
            return copy;
          });
        } else {
          setLogErrors((prev) => ({ ...prev, [event.id]: res.error || 'Failed to queue dose offline.' }));
        }
      } catch (e) {
        console.error('[offlineEnqueue] error:', e);
        setLogErrors((prev) => ({ ...prev, [event.id]: 'Failed to queue dose offline.' }));
      }
    };

    if (typeof window !== 'undefined' && !navigator.onLine) {
      performOfflineEnqueue();
      return;
    }

    startLogTransition(async () => {
      try {
        const result = await logDoseAction({
          id: event.type !== 'SCHEDULED' && !event.id.startsWith('scheduled-') ? event.id : undefined,
          protocolId: event.protocolId,
          amount: { amount: event.doseAmount, unit: event.doseUnit },
          status,
          injectionSite: status === 'LOGGED' ? (eventSite ?? undefined) : undefined,
          note: eventNote.trim(),
          scheduledDate: targetDateStr,
        });
        if (result.ok) {
          setEditingEventId(null);
          setExpandedEventId(null);
          setEditNotes((prev) => {
            const copy = { ...prev };
            delete copy[event.id];
            return copy;
          });
          setEditSite((prev) => {
            const copy = { ...prev };
            delete copy[event.id];
            return copy;
          });
          router.refresh();
        } else {
          setLogErrors((prev) => ({ ...prev, [event.id]: result.message }));
        }
      } catch (err) {
        console.error('[handleInlineSave] error:', err);
        const isNetworkErr = err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));
        if (isNetworkErr) {
          await performOfflineEnqueue();
        } else {
          setLogErrors((prev) => ({ ...prev, [event.id]: 'An unexpected error occurred.' }));
        }
      }
    });
  };

  const headerMonthYear = currentWeekStart.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-900 rounded-2xl p-5 shadow-sm space-y-6 relative">
      
      {/* Confetti Celebration Overlay */}
      {triggerConfetti && (
        <ConfettiCanvas onComplete={() => setTriggerConfetti(false)} />
      )}

      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-150">
              {headerMonthYear}
            </h2>
          </div>
          {streak && streak.currentStreak > 0 && (
            <span className="flex items-center gap-1 text-[10px] md:text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/25 animate-pulse-slow">
              🔥 {streak.currentStreak} Day Streak
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsBulkMode(!isBulkMode);
              setSelectedDates([]);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isBulkMode
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/20 dark:border-indigo-900 dark:text-indigo-400'
                : 'bg-background hover:bg-accent border-input text-foreground'
            }`}
          >
            {isBulkMode ? 'Bulk Mode On' : 'Bulk Select'}
          </button>

          <button
            onClick={handleJumpToToday}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-input bg-background hover:bg-accent text-foreground transition-all"
          >
            Today
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-md border border-input hover:bg-accent text-gray-500 dark:text-gray-400 transition-colors"
              aria-label="Previous Week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-md border border-input hover:bg-accent text-gray-500 dark:text-gray-400 transition-colors"
              aria-label="Next Week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Week Grid */}
      <div className={`grid grid-cols-7 gap-2 transition-opacity duration-200 ${isRescheduling ? 'opacity-60' : ''}`}>
        {cells.map(({ date, dateStr, events }) => {
          const isToday = dateStr === todayStr;
          const isSelected = isBulkMode ? selectedDates.includes(dateStr) : selectedDateStr === dateStr;

          const loggedCount = events.filter((e) => e.type === 'LOGGED' || e.type === 'SKIPPED').length;
          const totalCount = events.length;

          // Status Ring Calculations
          const percent = totalCount > 0 ? (loggedCount / totalCount) * 100 : 0;
          const isRestDay = totalCount === 0;
          const isCompleted = totalCount > 0 && loggedCount === totalCount;
          const isPartial = totalCount > 0 && loggedCount > 0 && loggedCount < totalCount;

          const weekdayName = WEEKDAYS[date.getUTCDay()];

          return (
            <div
              key={dateStr}
              onClick={() => handleCellClick(date, dateStr)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={(ev) => handleDrop(ev, dateStr)}
              tabIndex={0}
              role="button"
              aria-label={`${date.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', day: 'numeric' })}: ${totalCount} scheduled`}
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleCellClick(date, dateStr);
                }
              }}
              className={`p-2 rounded-xl flex flex-col items-center justify-start min-h-[160px] md:min-h-[220px] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none border ${
                isSelected
                  ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                  : 'border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/50'
              }`}
            >
              <div className="text-center w-full">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                  {weekdayName}
                </p>
                <p className={`text-xs font-bold mt-0.5 ${isToday ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>
                  {date.getUTCDate()}
                </p>
              </div>

              {/* Graphical Circular Progress Indicator */}
              <div className="relative h-5 w-5 mt-1 flex items-center justify-center">
                {isRestDay ? (
                  <span className="text-gray-300 dark:text-gray-800 text-[10px] font-bold">—</span>
                ) : isCompleted ? (
                  <div className="h-4.5 w-4.5 rounded-full bg-success flex items-center justify-center text-success-foreground shadow-sm">
                    <Check className="h-2.5 w-2.5 stroke-[3px]" />
                  </div>
                ) : (
                  <svg className="w-5 h-5 transform -rotate-90">
                    <circle
                      cx="10"
                      cy="10"
                      r="7.5"
                      className="stroke-gray-100 dark:stroke-gray-900"
                      strokeWidth="2"
                      fill="transparent"
                    />
                    <circle
                      cx="10"
                      cy="10"
                      r="7.5"
                      className={`${isPartial ? 'stroke-amber-400' : 'stroke-blue-400'} transition-all duration-300`}
                      strokeWidth="2"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 7.5}
                      strokeDashoffset={2 * Math.PI * 7.5 * (1 - percent / 100)}
                    />
                  </svg>
                )}
              </div>

              {/* Compound Abbreviations badges */}
              {events.length > 0 && (
                <div className="w-full flex flex-wrap md:flex-col justify-center items-center gap-1 mt-2 overflow-hidden">
                  {events.map((e) => {
                    const abbrev = getCompoundAbbreviation(e.compoundName);
                    const isEvLogged = e.type === 'LOGGED';
                    const isEvSkipped = e.type === 'SKIPPED';

                    let badgeClasses = '';
                    if (isEvLogged) {
                      badgeClasses = 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
                    } else if (isEvSkipped) {
                      badgeClasses = 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 line-through';
                    } else {
                      badgeClasses = 'bg-blue-50/50 dark:bg-blue-950/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/30';
                    }

                    const scheduledUnits =
                      !isEvLogged && !isEvSkipped
                        ? doseUnitsByCompoundId[e.compoundId]?.unitsText
                        : null;

                    return (
                      <span
                        key={e.id}
                        className={`text-[8px] md:text-[9px] font-bold px-1 py-0.5 rounded border leading-none select-none truncate w-[20px] md:w-full text-center transition-all ${badgeClasses}`}
                        title={`${e.compoundName} (${e.doseAmount} ${e.doseUnit}${scheduledUnits ? ` ${scheduledUnits}` : ''}) - ${e.type}`}
                      >
                        <span className="md:hidden block truncate max-w-full">
                          {abbrev.slice(0, 2)}
                        </span>
                        <span className="hidden md:block truncate max-w-full">
                          {abbrev}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Daily Action Panel for Selected Date */}
      {!isBulkMode && (
        <div className="pt-4 border-t border-gray-50 dark:border-gray-900 space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-xs text-gray-800 dark:text-gray-200 uppercase tracking-wider">
              Doses for {selectedDate.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            {selectedEvents.length > 0 && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                {selectedEvents.filter(e => e.type === 'LOGGED' || e.type === 'SKIPPED').length} of {selectedEvents.length} Processed
              </span>
            )}
          </div>

          {selectedEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center gap-1">
              <Info className="h-4 w-4 text-gray-400 mb-1" />
              <span>Rest Day — No doses scheduled for this date.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((e) => {
                const color = getCapColor(e.compoundSlug, e.compoundId);
                const isLogged = e.type === 'LOGGED';
                const isSkipped = e.type === 'SKIPPED';
                const isProcessed = isLogged || isSkipped;
                const isEditing = editingEventId === e.id;
                const targetDateStr = e.scheduledDateStr ?? selectedDateStr;
                const siteData = buildSiteDataForCalendarEvent(
                  e,
                  protocols,
                  localLogs,
                  targetDateStr,
                  siteSuggestions[e.protocolId]
                );

                const isExpanded = !isProcessed || expandedEventId === e.id || isEditing;

                // Precompute weekInfo once to avoid duplicate calculations in getCycleInfo and renderExpectedBenefits
                const proto = protocols.find((p) => p.id === e.protocolId);
                const profile = compounds[e.compoundId]?.profile;
                const weekInfo = isExpanded
                  ? getWeekInfo(proto, profile ?? undefined, targetDateStr, cycles)
                  : null;

                return (
                  <div
                    key={e.id}
                    draggable={!isProcessed}
                    onDragStart={(ev) => handleDragStart(ev, e, targetDateStr)}
                    className="border border-gray-100 dark:border-gray-900 rounded-xl bg-card overflow-hidden flex flex-col transition-all shadow-sm"
                    style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                  >
                    {/* Header Row */}
                    <div
                      role={isProcessed && !isEditing ? "button" : undefined}
                      tabIndex={isProcessed && !isEditing ? 0 : undefined}
                      aria-expanded={isProcessed && !isEditing ? isExpanded : undefined}
                      onClick={isProcessed && !isEditing ? () => setExpandedEventId(isExpanded ? null : e.id) : undefined}
                      onKeyDown={isProcessed && !isEditing ? (evt) => {
                        if (evt.key === ' ' || evt.key === 'Enter') {
                          evt.preventDefault();
                          setExpandedEventId(isExpanded ? null : e.id);
                        }
                      } : undefined}
                      className={`p-3 flex items-center justify-between gap-4 select-none ${isProcessed && !isEditing ? 'cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:z-10' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2 flex-wrap">
                          <span>{e.compoundName}</span>
                          <span className="text-xs font-normal text-gray-500">
                            {e.doseAmount} {e.doseUnit}
                            {!isProcessed && doseUnitsByCompoundId[e.compoundId]?.unitsText && (
                              <span className="text-gray-400"> ({doseUnitsByCompoundId[e.compoundId].unitsText})</span>
                            )}
                          </span>
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px] sm:max-w-md">
                          {isLogged ? (
                            <>
                              {e.injectionSite ? formatSiteLabel(e.injectionSite) : 'No Site'}
                              {e.note && ` • "${e.note}"`}
                            </>
                          ) : isSkipped ? (
                            <>
                              Skipped
                              {e.note && ` • "${e.note}"`}
                            </>
                          ) : (
                            e.administrationRoute ? (e.administrationRoute.charAt(0).toUpperCase() + e.administrationRoute.slice(1).toLowerCase()) : 'Subcutaneous'
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {e.isOffline && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
                            Offline Sync
                          </span>
                        )}
                        <span
                          className={`text-[9px] rounded-md px-2 py-0.5 font-bold uppercase tracking-wider border ${
                            isLogged
                              ? 'bg-success/5 border-success/20 text-success'
                              : isSkipped
                              ? 'bg-gray-100 border-gray-200 text-gray-500 dark:bg-gray-900 dark:border-gray-800'
                              : 'bg-blue-50 border-blue-200 text-blue-500 dark:bg-blue-950/10 dark:border-blue-900/30'
                          }`}
                        >
                          {e.type}
                        </span>
                        {isProcessed && !isEditing && (
                          isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                          )
                        )}
                      </div>
                    </div>

                    {/* Site Suggestion & Metadata / Logged Expanded */}
                    {isExpanded && isProcessed && !isEditing && (
                      <div className="px-4 pb-4 text-xs text-gray-500 space-y-1.5 border-t border-gray-50/50 dark:border-gray-900/30 pt-3">
                        {e.injectionSite && (
                          <p>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Injection Site:</span> {formatSiteLabel(e.injectionSite)}
                          </p>
                        )}
                        {e.note && (
                          <p className="italic text-gray-600 dark:text-gray-400">
                            &ldquo;{e.note}&rdquo;
                          </p>
                        )}
                        
                        {/* Cycle Progress Bar */}
                        {isLogged && (() => {
                          const cycleInfo = getCycleInfo(e, weekInfo);
                          if (!cycleInfo) return null;
                          if (cycleInfo.isContinuous) {
                            return (
                              <div className="pt-2 border-t border-gray-100 dark:border-gray-900/50 mt-2">
                                <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/20 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/30">
                                  Continuous Protocol
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-900/50 mt-2 space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-gray-700 dark:text-gray-300">Cycle Progress</span>
                                <span className="text-gray-500">{cycleInfo.text}</span>
                              </div>
                              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className="bg-primary h-full rounded-full transition-all duration-300"
                                  style={{ width: `${cycleInfo.percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {/* Expected Benefits */}
                        {renderExpectedBenefits(e, weekInfo)}

                        <div className="pt-2 flex justify-end gap-3">
                          <Link
                            href={`/tracker/protocols/${e.protocolId}/edit`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:underline text-xs flex items-center gap-1 font-semibold"
                          >
                            <Edit2 className="h-3 w-3" /> Edit Protocol
                          </Link>
                          <button
                            onClick={(evt) => {
                              evt.stopPropagation();
                              setExpandedEventId(e.id);
                              setEditingEventId(e.id);
                              setEditNotes((prev) => ({ ...prev, [e.id]: e.note || '' }));
                              // Set injection site if available
                              if (e.injectionSite) {
                                setEditSite((prev) => ({
                                  ...prev,
                                  [e.id]: e.injectionSite as InjectionSite
                                }));
                              }
                            }}
                            className="text-primary hover:underline text-xs flex items-center gap-1 font-semibold"
                          >
                            <Edit2 className="h-3 w-3" /> Edit Log
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline Logging Form (Unlogged Expanded or Editing) */}
                    {isExpanded && (!isProcessed || isEditing) && (
                      <div className="px-4 pb-4 pt-3 border-t border-gray-50 dark:border-gray-900 space-y-4 bg-gray-50/30 dark:bg-gray-950/20">
                        {logErrors[e.id] && (
                          <div className="text-xs text-destructive font-medium flex items-center gap-1" role="alert">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>{logErrors[e.id]}</span>
                          </div>
                        )}

                        {/* suggested site banner */}
                        {siteData && siteData.suggestion && !(editSite[e.id] ?? null) && (
                          <div className="text-[10px] text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-950 rounded p-2 flex items-center justify-between">
                            <span>
                              💡 Suggested Site: <strong>{formatSiteLabel(siteData.suggestion)}</strong>
                            </span>
                            <button
                              onClick={() => setEditSite((prev) => ({ ...prev, [e.id]: siteData.suggestion }))}
                              className="text-[9px] font-bold text-primary hover:underline"
                            >
                              Use Site
                            </button>
                          </div>
                        )}

                        {/* Interactive site picker */}
                        {siteData && siteData.validSites.length > 0 && (
                          <div className="scale-95 origin-top-left space-y-2">
                            {/* Rotation Alert */}
                            {(() => {
                              const selectedSite = editSite[e.id] ?? null;
                              const lastUsedSite = siteData?.recentSites?.[0] ?? null;
                              const isConflict = selectedSite !== null && lastUsedSite !== null && sitesEqualLegacy(selectedSite, lastUsedSite);
                              if (isConflict && selectedSite !== null) {
                                const selectedSiteMeta = siteData.siteMeta.find((meta) => sitesEqualLegacy(meta.site, selectedSite));
                                const relativeUseAge = formatSiteUseAgeForSentence(selectedSiteMeta?.daysSinceLastUse);
                                return (
                                  <div role="alert" className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-1.5 animate-[fadeIn_0.2s_ease-out] mb-2 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-400">
                                    <span className="shrink-0 font-bold">&#9888;</span>
                                    <span>
                                      <strong>Rotation Alert:</strong> {formatSiteLabel(selectedSite)} was your last {e.compoundName} site {relativeUseAge}. Choose a rested site (marked in green/teal) to prevent scar tissue build-up.
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <SitePicker
                              siteData={siteData}
                              selectedSite={editSite[e.id] ?? null}
                              onSelect={(site) => setEditSite((prev) => ({ ...prev, [e.id]: site }))}
                            />
                          </div>
                        )}

                        {/* note text input */}
                        <div className="space-y-1">
                          <label htmlFor={`notes-${e.id}`} className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            Notes (optional)
                          </label>
                          <input
                            id={`notes-${e.id}`}
                            type="text"
                            placeholder="e.g. slight fatigue, felt good"
                            value={editNotes[e.id] ?? ''}
                            onChange={(evt) => setEditNotes((prev) => ({ ...prev, [e.id]: evt.target.value }))}
                            className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus-visible:ring-1 focus-visible:ring-primary outline-none"
                            disabled={isLogPending}
                          />
                        </div>

                        {/* inline buttons */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingEventId(e.id);
                                handleInlineSave(e, 'LOGGED');
                              }}
                              disabled={isLogPending}
                              className="rounded-lg bg-success text-success-foreground px-3 py-1.5 text-xs font-semibold hover:bg-success/90 disabled:opacity-60 transition-colors"
                            >
                              {isLogPending ? 'Saving...' : 'Log Dose'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingEventId(e.id);
                                handleInlineSave(e, 'SKIPPED');
                              }}
                              disabled={isLogPending}
                              className="rounded-lg border border-input bg-background text-foreground px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60 transition-colors"
                            >
                              Skip
                            </button>
                          </div>

                          {!isEditing && (
                            <Link
                              href={`/tracker/protocols/${e.protocolId}/edit`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 transition-colors"
                            >
                              <Edit2 className="h-2.5 w-2.5" /> Edit Protocol
                            </Link>
                          )}

                          {isEditing && (
                            <button
                              onClick={() => {
                                setEditingEventId(null);
                                setEditNotes((prev) => {
                                  const copy = { ...prev };
                                  delete copy[e.id];
                                  return copy;
                                });
                                setEditSite((prev) => {
                                  const copy = { ...prev };
                                  delete copy[e.id];
                                  return copy;
                                });
                                setLogErrors((prev) => {
                                  const copy = { ...prev };
                                  delete copy[e.id];
                                  return copy;
                                });
                              }}
                              className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Glassmorphism Bulk Action Bar */}
      {isBulkMode && selectedDates.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4 shadow-2xl z-40 flex flex-wrap items-center gap-4 animate-[fadeIn_0.2s_ease-out] w-[90%] max-w-xl">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-wider">Bulk Logging</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {selectedDates.length} Date{selectedDates.length > 1 ? 's' : ''} Selected
            </span>
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex-1 flex flex-wrap gap-3 items-center">
            <select
              value={bulkProtocolId}
              onChange={(e) => setBulkProtocolId(e.target.value)}
              className="text-xs rounded-lg border border-input bg-background px-3 py-1.5 text-foreground focus-visible:ring-1 focus-visible:ring-primary outline-none max-w-[150px] flex-1"
            >
              <option value="">Select Protocol</option>
              {protocols.filter(p => p.status === 'ACTIVE').map(p => (
                <option key={p.id} value={p.id}>
                  {compounds[p.compoundId]?.name || 'Compound'} ({p.dose.amount} {p.dose.unit})
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Notes (optional)"
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              className="text-xs rounded-lg border border-input bg-background px-3 py-1.5 text-foreground focus-visible:ring-1 focus-visible:ring-primary outline-none max-w-[150px] flex-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBulkLog('LOGGED')}
              disabled={!bulkProtocolId || isBulkActionPending}
              className="rounded-lg bg-success text-success-foreground px-3 py-1.5 text-xs font-semibold hover:bg-success/90 disabled:opacity-50 transition-all shadow"
            >
              {isBulkActionPending ? 'Saving...' : 'Log'}
            </button>
            <button
              onClick={() => handleBulkLog('SKIPPED')}
              disabled={!bulkProtocolId || isBulkActionPending}
              className="rounded-lg border border-input bg-background text-foreground px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50 transition-all shadow"
            >
              Skip
            </button>
            <button
              onClick={() => {
                setSelectedDates([]);
                setIsBulkMode(false);
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1 py-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default TrackerCalendar;
