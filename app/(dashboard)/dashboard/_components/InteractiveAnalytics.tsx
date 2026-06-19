'use client';

import React, { useState, useEffect } from 'react';
import { DoseOutcomeChart } from './DoseOutcomeChart';
import { ConfettiCanvas } from './ConfettiCanvas';
import type { DoseAmount } from '@/lib/tracker/domain/types';

type SerializedDoseLog = {
  id: string;
  protocolId: string;
  compoundId: string;
  scheduledDate: string;
  amount: DoseAmount;
  status: 'LOGGED' | 'SKIPPED' | 'PENDING' | 'RESCHEDULED';
};

type SerializedOutcomeLog = {
  id: string;
  scheduledDate: string;
  overallRating: number;
  tags: string[];
  note: string | null;
};

interface Props {
  doseLogs: SerializedDoseLog[];
  outcomeLogs: SerializedOutcomeLog[];
  compounds: Record<string, { name: string; slug: string }>;
  todayScheduledCount: number;
  todayLogsCount: number;
}

function getCapColor(compoundSlug: string): string {
  const knownColors: Record<string, string> = {
    'tirzepatide': '--compound-tirzepatide',
    'semaglutide': '--compound-semaglutide',
    'bpc-157': '--compound-bpc157',
  };
  if (knownColors[compoundSlug]) return `hsl(var(${knownColors[compoundSlug]}))`;
  return 'hsl(215 16% 47%)';
}

export function InteractiveAnalytics({
  doseLogs,
  outcomeLogs,
  compounds,
  todayScheduledCount,
  todayLogsCount,
}: Props) {
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [triggerConfetti, setTriggerConfetti] = useState(false);

  // Daily Adherence Completed Confetti Guard (F-004)
  useEffect(() => {
    const isAdherenceCompleted = todayScheduledCount > 0 && todayLogsCount === todayScheduledCount;
    if (isAdherenceCompleted) {
      const todayDateStr = new Date().toISOString().split('T')[0];
      const lastCelebrated = sessionStorage.getItem('lastCelebratedAdherenceDate');
      if (lastCelebrated !== todayDateStr) {
        setTriggerConfetti(true);
        sessionStorage.setItem('lastCelebratedAdherenceDate', todayDateStr);
      }
    }
  }, [todayScheduledCount, todayLogsCount]);

  const outcome = selectedDateStr
    ? outcomeLogs.find((o) => o.scheduledDate.startsWith(selectedDateStr))
    : null;

  const dayDoses = selectedDateStr
    ? doseLogs.filter((l) => l.scheduledDate.startsWith(selectedDateStr) && l.status === 'LOGGED')
    : [];

  return (
    <div className="space-y-4">
      {/* Confetti Explosion Celebration */}
      {triggerConfetti && (
        <ConfettiCanvas onComplete={() => setTriggerConfetti(false)} />
      )}

      {/* Outcome & Dose Correlation Chart */}
      <DoseOutcomeChart
        doseLogs={doseLogs}
        outcomeLogs={outcomeLogs}
        compounds={compounds}
        onSelectDate={setSelectedDateStr}
      />

      {/* Drill-down Detail Side-Drawer */}
      {selectedDateStr && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm z-50 flex justify-end animate-[fadeIn_0.2s_ease-out]"
          onClick={() => setSelectedDateStr(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-[slideInRight_0.25s_ease-out] select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-150">
                    {new Date(selectedDateStr).toLocaleDateString(undefined, {
                      timeZone: 'UTC',
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h3>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
                    Day Analytics Drill-Down
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDateStr(null)}
                  className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 text-sm font-bold p-1"
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              {/* Wellbeing Details */}
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                    Wellbeing Sentiment
                  </h4>
                  {outcome ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1 text-2xl font-black text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < outcome.overallRating ? '★' : '☆'}</span>
                        ))}
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 pl-1">
                          {outcome.overallRating}/5 Rating
                        </span>
                      </div>
                      {outcome.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {outcome.tags.map((t) => (
                            <span
                              key={t}
                              className="bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-950/20 dark:border-indigo-900/40 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {outcome.note && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            Notes
                          </span>
                          <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800/60 leading-relaxed">
                            &ldquo;{outcome.note}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 py-2">
                      No wellbeing outcome rated for this date.
                    </p>
                  )}
                </div>

                {/* Dosage Details */}
                <div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                    Doses Logged
                  </h4>
                  {dayDoses.length > 0 ? (
                    <ul className="space-y-2.5">
                      {dayDoses.map((log) => {
                        const comp = compounds[log.protocolId] ?? { name: 'Compound', slug: 'unknown' };
                        const color = getCapColor(comp.slug);
                        return (
                          <li
                            key={log.id}
                            className="flex items-center justify-between text-xs bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800/60"
                          >
                            <span className="flex items-center gap-2 font-semibold">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                              {comp.name}
                            </span>
                            <span className="font-mono bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-105 dark:border-slate-700/60 font-bold">
                              {log.amount.amount} {log.amount.unit}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 py-2">No doses logged on this date.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Close Button */}
            <button
              onClick={() => setSelectedDateStr(null)}
              className="w-full bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold rounded-xl py-2.5 text-xs transition-colors shadow"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default InteractiveAnalytics;
