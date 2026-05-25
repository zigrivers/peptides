'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Protocol, DoseLog, InjectionSite } from '@/lib/tracker/domain/types';
import { getScheduledDatesInRange } from '@/lib/tracker/domain/ScheduleGenerator';
import { SitePicker } from './SitePicker';
import type { SiteData } from './SitePicker';
import { logDoseAction } from '@/app/actions/tracker/log-dose';
import { rescheduleDoseAction } from '@/app/actions/tracker/reschedule-dose';
import { batchLogDatesAction } from '@/app/actions/tracker/batch-log-dates';
import { sitesEqual } from '@/lib/tracker/domain/SiteRotation';

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
  injectionSite?: string;
  note?: string;
  isOffline?: boolean;
};

interface Props {
  protocols: Protocol[];
  doseLogs: (Omit<DoseLog, 'loggedAt' | 'scheduledDate'> & { loggedAt: string; scheduledDate: string })[];
  compounds: Record<string, { name: string; slug: string }>;
  siteSuggestions?: Record<string, SiteData>;
  initialDateISO: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCapColor(compoundSlug: string): string {
  const knownColors: Record<string, string> = {
    'tirzepatide': '--compound-tirzepatide',
    'semaglutide': '--compound-semaglutide',
    'bpc-157': '--compound-bpc157',
  };
  if (knownColors[compoundSlug]) return `hsl(var(${knownColors[compoundSlug]}))`;
  return 'hsl(215 16% 47%)';
}

function CalendarQuickLog({
  protocolId,
  amount,
  scheduledDate,
  siteData,
  onSuccess,
}: {
  protocolId: string;
  amount: { amount: string; unit: 'mcg' | 'mg' | 'IU' | 'mL' };
  scheduledDate: string;
  siteData?: SiteData;
  onSuccess: (newLog?: unknown) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedSite, setSelectedSite] = useState<InjectionSite | null>(
    siteData?.suggestion ?? null
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const requiresSite = (siteData?.validSites.length ?? 0) > 0;
  const siteRequired = requiresSite && selectedSite === null;

  function handleLog(status: 'LOGGED' | 'SKIPPED') {
    setError(null);
    if (status === 'LOGGED' && siteRequired) {
      setError('Please select an injection site.');
      return;
    }

    const isCurrentlyOffline = typeof window !== 'undefined' && !navigator.onLine;

    const performOfflineEnqueue = async () => {
      try {
        const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
        const q = new OfflineQueue();
        const dateStr = scheduledDate.split('T')[0];
        const res = await q.enqueue({
          protocolId,
          scheduledDate: dateStr,
          deviceId: 'web-client',
          amount,
          status,
          injectionSite: status === 'LOGGED' ? (selectedSite ?? undefined) : undefined,
          note: note.trim() || undefined,
        });
        if (res.ok) {
          window.dispatchEvent(new Event('offline-sync-queue-updated'));
          onSuccess({
            id: res.id,
            protocolId,
            status,
            scheduledDate,
            amount,
            loggedAt: new Date().toISOString(),
            isOffline: true,
            note: note.trim() || null,
          });
        } else {
          setError(res.error || 'Failed to queue dose offline.');
        }
      } catch (e) {
        console.error('[offlineEnqueue] error:', e);
        setError('Failed to queue dose offline.');
      }
    };

    if (isCurrentlyOffline) {
      performOfflineEnqueue();
      return;
    }

    startTransition(async () => {
      try {
        const result = await logDoseAction({
          protocolId,
          amount,
          status,
          injectionSite: status === 'LOGGED' ? (selectedSite ?? undefined) : undefined,
          note: note.trim() || undefined,
          scheduledDate,
        });
        if (result.ok) {
          router.refresh();
          onSuccess();
        } else {
          setError(result.message);
        }
      } catch (err) {
        console.error('[CalendarQuickLog] logDoseAction error:', err);
        const isNetworkErr = err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));
        if (isNetworkErr) {
          await performOfflineEnqueue();
        } else {
          setError('An unexpected error occurred.');
        }
      }
    });
  }

  const lastUsedSite = siteData?.recentSites?.[0] ?? null;
  const isConflict = selectedSite !== null && lastUsedSite !== null && sitesEqual(selectedSite, lastUsedSite);

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {error && (
        <p role="alert" className="text-xs text-destructive font-medium">{error}</p>
      )}

      {isConflict && (
        <div role="alert" className="text-[10px] text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded p-2 flex items-start gap-1">
          <span className="font-bold shrink-0">&#9888;</span>
          <span>
            <strong>Rotation Alert:</strong> Selected site matches last use. We recommend rotating to a rested site.
          </span>
        </div>
      )}

      {siteData && siteData.validSites.length > 0 && (
        <div className="scale-95 origin-top-left py-1">
          <SitePicker
            siteData={siteData}
            selectedSite={selectedSite}
            onSelect={setSelectedSite}
          />
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor={`quick-log-note-${protocolId}`} className="text-[10px] font-medium text-muted-foreground">
          Notes (optional)
        </label>
        <input
          id={`quick-log-note-${protocolId}`}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. slight fatigue, felt good"
          className="w-full text-xs rounded border border-input bg-background px-2 py-1 text-foreground focus-visible:ring-1 focus-visible:ring-primary outline-none"
          disabled={isPending}
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-2">
          <button
            disabled={isPending || siteRequired}
            onClick={() => handleLog('LOGGED')}
            className="rounded bg-success text-success-foreground px-3 py-1.5 text-xs font-semibold hover:bg-success/90 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Logging...' : 'Log Dose'}
          </button>
          <button
            disabled={isPending}
            onClick={() => handleLog('SKIPPED')}
            className="rounded border border-input bg-background text-foreground px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-60 transition-colors"
          >
            Skip
          </button>
        </div>

        <a
          href={`/tracker/protocols/${protocolId}`}
          className="text-xs text-primary hover:underline font-medium"
        >
          View Protocol Details
        </a>
      </div>
    </div>
  );
}

export function TrackerCalendar({ protocols, doseLogs, compounds, siteSuggestions = {}, initialDateISO }: Props) {
  const router = useRouter();
  const [localLogs, setLocalLogs] = useState(doseLogs);

  useEffect(() => {
    setLocalLogs(doseLogs);
  }, [doseLogs]);

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = initialDateISO ? new Date(initialDateISO) : new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  });

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Drag and drop rescheduling state
  const [isRescheduling, startRescheduling] = useTransition();

  // Bulk select logging state
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkProtocolId, setBulkProtocolId] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [isBulkActionPending, startBulkAction] = useTransition();

  const handlePrevMonth = () => {
    setCurrentDate((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  };

  const handleNextMonth = () => {
    setCurrentDate((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  };

  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();

  const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
  const startDayOfWeek = firstDayOfMonth.getUTCDay();

  const calendarStart = new Date(firstDayOfMonth);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - startDayOfWeek);

  const calendarEnd = new Date(calendarStart);
  calendarEnd.setUTCDate(calendarEnd.getUTCDate() + 41);

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
      injectionSite: log.injectionSite ? `${log.injectionSite.side} ${log.injectionSite.bodyPart}` : undefined,
      note: log.note || undefined,
      isOffline: 'isOffline' in log ? (log as { isOffline?: boolean }).isOffline : undefined,
    });
  });

  // 2. Compute future scheduled doses in viewport for active protocols
  protocols.forEach((p) => {
    if (p.status !== 'ACTIVE') return;

    const dates = getScheduledDatesInRange(p.schedule, p.startDate, p.endDate, calendarStart, calendarEnd);
    
    dates.forEach((d) => {
      const dateStr = d.toISOString().split('T')[0];
      
      // If there is already a log (logged, skipped, pending, or rescheduled) for this protocol on this day, skip adding the pending schedule event
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
      });
    });
  });

  // Generate 42 grid cells
  const cells: { date: Date; dateStr: string; isCurrentMonth: boolean; events: CalendarEvent[] }[] = [];
  const cursor = new Date(calendarStart);

  for (let i = 0; i < 42; i++) {
    const dateStr = cursor.toISOString().split('T')[0];
    cells.push({
      date: new Date(cursor),
      dateStr,
      isCurrentMonth: cursor.getUTCMonth() === month,
      events: eventsByDateString[dateStr] || [],
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const selectedDateStr = selectedDate ? selectedDate.toISOString().split('T')[0] : '';
  const selectedEvents = selectedDate ? (eventsByDateString[selectedDateStr] || []) : [];

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

  // Bulk Actions
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

  return (
    <div className="border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm space-y-6 relative">
      
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <span>📅</span>
          <span>
            {currentDate.toLocaleDateString(undefined, {
              timeZone: 'UTC',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </h2>
        <div className="flex items-center gap-3">
          {/* Bulk Action Toggle Switch */}
          <button
            onClick={() => {
              setIsBulkMode(!isBulkMode);
              setSelectedDates([]);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isBulkMode
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/20 dark:border-indigo-900 dark:text-indigo-400'
                : 'bg-background hover:bg-accent border-input text-foreground'
            }`}
          >
            {isBulkMode ? 'Bulk Mode On' : 'Bulk Select'}
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-md border border-input hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
              aria-label="Previous Month"
            >
              ←
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-md border border-input hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
              aria-label="Next Month"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Weekdays Grid */}
      <div className="grid grid-cols-7 gap-px text-center text-xs font-bold text-muted-foreground border-b border-border pb-2">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className={`grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border transition-opacity ${isRescheduling ? 'opacity-60' : ''}`}>
        {cells.map(({ date, dateStr, isCurrentMonth, events }) => {
          const isToday = dateStr === todayStr;
          const isSelected = isBulkMode ? selectedDates.includes(dateStr) : selectedDateStr === dateStr;

          const loggedCount = events.filter((e) => e.type === 'LOGGED').length;
          const totalCount = events.length;

          const ariaLabel = `${date.toLocaleDateString(undefined, {
            timeZone: 'UTC',
            month: 'long',
            day: 'numeric',
          })}: ${totalCount} event${totalCount !== 1 ? 's' : ''}`;

          return (
            <div
              key={dateStr}
              onClick={() => handleCellClick(date, dateStr)}
              onDragOver={(ev) => ev.preventDefault()}
              onDrop={(ev) => handleDrop(ev, dateStr)}
              tabIndex={0}
              role="button"
              aria-label={ariaLabel}
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleCellClick(date, dateStr);
                }
              }}
              className={`min-h-[68px] sm:min-h-[92px] p-1.5 flex flex-col justify-between transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary select-none cursor-pointer ${
                isCurrentMonth
                  ? 'bg-card text-foreground'
                  : 'bg-muted/40 text-muted-foreground/60'
              } ${isToday ? 'ring-2 ring-primary ring-inset' : ''} ${
                isSelected 
                  ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/15 dark:bg-indigo-950/10' 
                  : 'hover:bg-accent/50 dark:hover:bg-accent/20'
              }`}
            >
              {/* Cell Day Indicator */}
              <div className="flex justify-between items-center">
                <span
                  className={`text-xs font-bold ${
                    isToday
                      ? 'bg-primary text-primary-foreground h-5 w-5 rounded-full flex items-center justify-center'
                      : ''
                  }`}
                >
                  {date.getUTCDate()}
                </span>
                {totalCount > 0 && (
                  <span className="hidden sm:inline-flex text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
                    {loggedCount}/{totalCount} Logged
                  </span>
                )}
              </div>

              {/* Events display area */}
              <div className="mt-1 flex-1 flex flex-col justify-end space-y-1">
                {/* Desktop layout: color coded capsules */}
                <div className="hidden sm:flex flex-col gap-1 w-full">
                  {events.slice(0, 3).map((e) => {
                    const color = getCapColor(e.compoundSlug);
                    let borderClass = 'border-border text-muted-foreground bg-card';
                    const bgStyle = { borderLeftColor: color, borderLeftWidth: '3px' };

                    if (e.type === 'LOGGED') {
                      borderClass = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/10 dark:text-green-400 dark:border-green-900/30';
                    } else if (e.type === 'SKIPPED') {
                      borderClass = 'bg-muted text-muted-foreground border-border';
                    } else if (e.type === 'PENDING') {
                      borderClass = 'bg-blue-50/50 text-blue-700 border-dashed border-blue-300 dark:bg-blue-950/10 dark:text-blue-400 dark:border-blue-900/30';
                    } else if (e.type === 'RESCHEDULED') {
                      borderClass = 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/10 dark:text-purple-400 dark:border-purple-900/30';
                    }

                    return (
                      <div
                        key={e.id}
                        draggable={e.type === 'SCHEDULED' || e.type === 'PENDING'}
                        onDragStart={(ev) => handleDragStart(ev, e, dateStr)}
                        style={bgStyle}
                        className={`text-[9px] rounded-md px-1 py-0.5 border leading-tight truncate font-semibold tracking-wide flex items-center justify-between cursor-grab active:cursor-grabbing ${borderClass}`}
                      >
                        <span className="truncate flex items-center gap-1">
                          {e.compoundName}
                          {e.isOffline && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" title="Pending Sync" />
                          )}
                        </span>
                        <span className="shrink-0 scale-90 opacity-90">{e.doseAmount} {e.doseUnit}</span>
                      </div>
                    );
                  })}
                  {events.length > 3 && (
                    <div className="text-[9px] text-muted-foreground font-semibold pl-1.5">
                      +{events.length - 3} more
                    </div>
                  )}
                </div>

                {/* Mobile layout */}
                <div className="sm:hidden flex justify-center items-center h-4 w-full">
                  {totalCount === 1 ? (
                    <span
                      style={{ backgroundColor: getCapColor(events[0].compoundSlug) }}
                      className="h-2 w-2 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                    />
                  ) : totalCount > 1 ? (
                    <span className="h-4 min-w-[16px] px-1 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center">
                      {totalCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date detail Modal Overlay */}
      {selectedDate && !isBulkMode && (
        <div
          className="fixed inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]"
          onClick={() => setSelectedDate(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-card border border-border text-card-foreground rounded-xl max-w-md w-full p-6 shadow-2xl relative space-y-4 animate-[scaleUp_0.18s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-2 border-b border-border">
              <div>
                <h3 className="font-bold text-foreground text-lg">
                  {selectedDate.toLocaleDateString(undefined, {
                    timeZone: 'UTC',
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">
                  Schedule Overview
                </p>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold p-1"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Event Lists */}
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No doses scheduled or logged for this date.
              </p>
            ) : (
              <ul className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {selectedEvents.map((e) => {
                  const capColor = getCapColor(e.compoundSlug);
                  
                  return (
                    <li
                      key={e.id}
                      className="border border-border rounded-lg p-3 bg-muted/30 flex gap-3 items-start"
                    >
                      <span
                        style={{ backgroundColor: capColor }}
                        className="h-3 w-3 rounded-full mt-1.5 shrink-0 shadow-sm"
                      />
                      
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-foreground">
                            {e.compoundName}
                          </h4>
                          <div className="flex items-center gap-1.5">
                            {e.isOffline && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400 px-1.5 py-0.5 rounded font-semibold">
                                Pending Sync
                              </span>
                            )}
                            <span
                              className={`text-[9px] rounded px-1.5 py-0.5 border font-bold uppercase tracking-wider ${
                                e.type === 'LOGGED'
                                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30'
                                  : e.type === 'SKIPPED'
                                  ? 'bg-muted text-muted-foreground border-border'
                                  : e.type === 'PENDING'
                                  ? 'bg-blue-50 text-blue-700 border-dashed border-blue-300 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30'
                                  : e.type === 'RESCHEDULED'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30'
                                  : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-450 dark:border-blue-900/30'
                              }`}
                            >
                              {e.type}
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          Dose: <span className="font-mono font-semibold text-foreground">{e.doseAmount}</span> {e.doseUnit}
                        </p>

                        {e.injectionSite && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Site: <span className="font-medium text-foreground">{e.injectionSite}</span>
                          </p>
                        )}
                        {e.note && (
                          <p className="text-[10px] text-muted-foreground mt-1 italic">
                            &ldquo;{e.note}&rdquo;
                          </p>
                        )}

                        {/* Quick logging handles both regular scheduled and pending rescheduled doses */}
                        {(e.type === 'SCHEDULED' || e.type === 'PENDING') && (
                          <CalendarQuickLog
                            protocolId={e.protocolId}
                            amount={{ amount: e.doseAmount, unit: e.doseUnit as 'mcg' | 'mg' | 'IU' | 'mL' }}
                            scheduledDate={selectedDate.toISOString().slice(0, 10)}
                            siteData={siteSuggestions[e.protocolId]}
                            onSuccess={(newLog) => {
                              if (newLog) {
                                setLocalLogs((prev) => [...prev, newLog as Props['doseLogs'][number]]);
                              }
                              setSelectedDate(null);
                            }}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="pt-2">
              <button
                onClick={() => setSelectedDate(null)}
                className="w-full bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg py-2 text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Glassmorphism Bulk Action Bar */}
      {isBulkMode && selectedDates.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl px-6 py-4 shadow-2xl z-40 flex flex-wrap items-center gap-4 animate-[fadeIn_0.2s_ease-out] w-[90%] max-w-xl">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Bulk Logging</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-250">
              {selectedDates.length} Date{selectedDates.length > 1 ? 's' : ''} Selected
            </span>
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex-1 flex flex-wrap gap-3 items-center">
            {/* Protocol Selector */}
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

            {/* Note Input */}
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
              className="rounded-lg bg-success text-success-foreground px-3 py-1.5 text-xs font-semibold hover:bg-success/90 disabled:opacity-50 transition-all shadow btn-tactile"
            >
              {isBulkActionPending ? 'Saving...' : 'Log'}
            </button>
            <button
              onClick={() => handleBulkLog('SKIPPED')}
              disabled={!bulkProtocolId || isBulkActionPending}
              className="rounded-lg border border-input bg-background text-foreground px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50 transition-all shadow btn-tactile"
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
