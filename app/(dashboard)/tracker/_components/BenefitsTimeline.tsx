'use client';

import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle2, Sparkles, Clock, Calendar, Check, AlertCircle } from 'lucide-react';
import type { Protocol } from '@/lib/tracker/domain/types';
import type { BenefitTimelineItem } from '@/lib/reference/domain/types';
import { calculateElapsedWeeks } from '@/lib/tracker/domain/benefits';
import { toggleObservedBenefitAction } from '@/app/actions/tracker/toggle-observed-benefit';

interface SerializedProtocol extends Omit<Protocol, 'startDate' | 'endDate'> {
  startDate: string;
  endDate: string | null;
}

interface Props {
  activeProtocols: (SerializedProtocol & {
    compound: {
      name: string;
      slug: string;
      profile: {
        benefitTimeline: BenefitTimelineItem[] | null;
      } | null;
    };
  })[];
  currentDateISO?: string;
}

export function BenefitsTimeline({ activeProtocols, currentDateISO }: Props) {
  const now = currentDateISO ? new Date(currentDateISO) : new Date();

  // Initialize client state for experienced observed benefits mapping
  const [localObserved, setLocalObserved] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    activeProtocols.forEach((p) => {
      initial[p.id] = Array.isArray(p.observedBenefits) ? (p.observedBenefits as string[]) : [];
    });
    return initial;
  });

  const [error, setError] = useState<string | null>(null);

  // Keep state synced with props changes
  useEffect(() => {
    const initial: Record<string, string[]> = {};
    activeProtocols.forEach((p) => {
      initial[p.id] = Array.isArray(p.observedBenefits) ? (p.observedBenefits as string[]) : [];
    });
    setLocalObserved(initial);
  }, [activeProtocols]);

  // Determine all milestone weeks we want to show:
  // - All weeks defined in the compound profiles' database timelines
  // - The user's actual current elapsed week for each active compound
  const weekSet = new Set<number>();
  activeProtocols.forEach((p) => {
    const timeline = p.compound.profile?.benefitTimeline || [];
    timeline.forEach((item) => weekSet.add(item.week));

    const startDate = new Date(p.startDate);
    const elapsedWeeks = calculateElapsedWeeks(startDate, now);
    if (elapsedWeeks > 0) {
      weekSet.add(elapsedWeeks);
    }
  });

  const sortedWeeks = Array.from(weekSet).sort((a, b) => a - b);

  interface GroupedBenefitItem {
    protocolId: string;
    startDate: Date;
    compoundName: string;
    compoundSlug: string;
    benefits: string[];
    elapsedWeeks: number;
    status: 'EXPERIENCED' | 'CURRENT' | 'UPCOMING';
    countdownText?: string;
    ongoingNote?: string;
  }

  const allTimelineItemsByWeek: Record<number, GroupedBenefitItem[]> = {};

  sortedWeeks.forEach((weekVal) => {
    activeProtocols.forEach((p) => {
      const dbTimeline = p.compound.profile?.benefitTimeline || [];
      const startDate = new Date(p.startDate);
      const elapsedWeeks = calculateElapsedWeeks(startDate, now);

      const dbItem = dbTimeline.find((item) => item.week === weekVal);

      if (dbItem) {
        const isCurrent = elapsedWeeks === weekVal;
        const isExperienced = elapsedWeeks > weekVal;
        const status = isExperienced ? 'EXPERIENCED' : (isCurrent ? 'CURRENT' : 'UPCOMING');

        let countdownText: string | undefined;
        if (status === 'UPCOMING') {
          const milestoneDate = new Date(startDate.getTime());
          milestoneDate.setUTCDate(milestoneDate.getUTCDate() + (weekVal - 1) * 7);

          const milestoneUtc = Date.UTC(milestoneDate.getUTCFullYear(), milestoneDate.getUTCMonth(), milestoneDate.getUTCDate());
          const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
          const diffMs = milestoneUtc - nowUtc;
          const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

          if (daysRemaining <= 0) {
            countdownText = 'Starts today';
          } else if (daysRemaining >= 14) {
            countdownText = `Starts in ${Math.ceil(daysRemaining / 7)} weeks`;
          } else {
            countdownText = `Starts in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`;
          }
        }

        if (!allTimelineItemsByWeek[weekVal]) {
          allTimelineItemsByWeek[weekVal] = [];
        }

        allTimelineItemsByWeek[weekVal].push({
          protocolId: p.id,
          startDate,
          compoundName: p.compound.name,
          compoundSlug: p.compound.slug,
          benefits: dbItem.benefits,
          elapsedWeeks,
          status,
          countdownText,
        });
      } else if (elapsedWeeks === weekVal) {
        const previousMilestones = dbTimeline
          .filter((item) => item.week < weekVal)
          .sort((a, b) => b.week - a.week);

        const closestMilestone = previousMilestones[0];
        const benefits = closestMilestone ? closestMilestone.benefits : ['Initial protocol adaptation'];
        const note = closestMilestone ? `Ongoing from Week ${closestMilestone.week} milestone` : undefined;

        if (!allTimelineItemsByWeek[weekVal]) {
          allTimelineItemsByWeek[weekVal] = [];
        }

        allTimelineItemsByWeek[weekVal].push({
          protocolId: p.id,
          startDate,
          compoundName: p.compound.name,
          compoundSlug: p.compound.slug,
          benefits,
          elapsedWeeks,
          status: 'CURRENT',
          ongoingNote: note,
        });
      }
    });
  });

  const handleToggleObserved = async (protocolId: string, weekVal: number, benefitText: string) => {
    setError(null);
    const key = `${weekVal}:${benefitText}`;
    const currentList = localObserved[protocolId] || [];
    const isAlreadyObserved = currentList.includes(key);

    // Optimistic Update
    const newList = isAlreadyObserved
      ? currentList.filter((x) => x !== key)
      : [...currentList, key];

    setLocalObserved((prev) => ({
      ...prev,
      [protocolId]: newList,
    }));

    try {
      const res = await toggleObservedBenefitAction({
        protocolId,
        week: weekVal,
        benefitText,
      });

      if (!res.ok) {
        // Rollback on server error
        setLocalObserved((prev) => ({
          ...prev,
          [protocolId]: currentList,
        }));
        setError(res.message || 'Failed to save benefit status.');
      }
    } catch {
      // Rollback on network error
      setLocalObserved((prev) => ({
        ...prev,
        [protocolId]: currentList,
      }));
      setError('A network error occurred. Please try again.');
    }
  };

  if (sortedWeeks.length === 0) {
    return null;
  }

  return (
    <section className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-900 p-5 shadow-sm space-y-5 animate-page-enter">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse-slow" />
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Expected Benefits Timeline</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Combined adaptation timeline across all active protocols.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center justify-between gap-2 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[10px] hover:underline font-bold text-destructive shrink-0">
            Dismiss
          </button>
        </div>
      )}

      <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100 dark:before:bg-gray-900">
        {sortedWeeks.map((weekNum) => {
          const items = allTimelineItemsByWeek[weekNum];
          if (!items || items.length === 0) return null;

          // Sort compounds within the week: CURRENT first, then EXPERIENCED, then UPCOMING
          const sortedItems = [...items].sort((a, b) => {
            const weight = { CURRENT: 1, EXPERIENCED: 2, UPCOMING: 3 };
            return weight[a.status] - weight[b.status];
          });

          const allUpcoming = items.every((i) => i.status === 'UPCOMING');
          const allExperienced = items.every((i) => i.status === 'EXPERIENCED');
          const anyCurrent = items.some((i) => i.status === 'CURRENT');
          const anyExperienced = items.some((i) => i.status === 'EXPERIENCED');

          let nodeStatus: 'ACHIEVED' | 'CURRENT' | 'MIXED' | 'UPCOMING' = 'UPCOMING';
          if (anyCurrent) {
            nodeStatus = 'CURRENT';
          } else if (allExperienced) {
            nodeStatus = 'ACHIEVED';
          } else if (anyExperienced) {
            nodeStatus = 'MIXED';
          } else if (allUpcoming) {
            nodeStatus = 'UPCOMING';
          }

          return (
            <div key={weekNum} className="relative group">
              {/* Stepper Dot/Indicator */}
              <div
                className={`absolute -left-[23px] top-1.5 h-4.5 w-4.5 rounded-full border-2 flex items-center justify-center transition-all bg-card ${
                  nodeStatus === 'ACHIEVED'
                    ? 'bg-success border-success text-success-foreground'
                    : nodeStatus === 'CURRENT'
                    ? 'border-primary text-primary shadow-sm animate-pulse-slow'
                    : nodeStatus === 'MIXED'
                    ? 'border-indigo-400 dark:border-indigo-600 text-indigo-500'
                    : 'border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600'
                }`}
              >
                {nodeStatus === 'ACHIEVED' ? (
                  <CheckCircle2 className="h-3 w-3 stroke-[3px]" />
                ) : nodeStatus === 'CURRENT' ? (
                  <Clock className="h-2.5 w-2.5 stroke-[3px]" />
                ) : nodeStatus === 'MIXED' ? (
                  <Calendar className="h-2.5 w-2.5 stroke-[3.5]" />
                ) : (
                  <Lock className="h-2 w-2 stroke-[3px]" />
                )}
              </div>

              {/* Stepper Content */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      nodeStatus === 'ACHIEVED'
                        ? 'text-success'
                        : nodeStatus === 'CURRENT'
                        ? 'text-primary font-extrabold'
                        : nodeStatus === 'MIXED'
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    Week {weekNum} Milestone
                  </span>
                  {nodeStatus === 'CURRENT' && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-extrabold animate-pulse">
                      Current Phase
                    </span>
                  )}
                  {nodeStatus === 'MIXED' && (
                    <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold border border-indigo-100 dark:border-indigo-900/30">
                      Active
                    </span>
                  )}
                </div>

                {/* Sub list per compound */}
                <div className="space-y-3 pl-1">
                  {sortedItems.map((item, idx) => {
                    const isExp = item.status === 'EXPERIENCED';
                    const isCur = item.status === 'CURRENT';
                    const isExpOrCur = isExp || isCur;

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3 space-y-1.5 transition-colors ${
                          isCur
                            ? 'bg-primary/[0.02] border-primary/20 dark:bg-primary/[0.04] dark:border-primary/30'
                            : isExp
                            ? 'bg-emerald-500/[0.02] border-emerald-500/10 dark:bg-emerald-500/[0.04] dark:border-emerald-500/20'
                            : 'bg-gray-50/30 border-gray-100 dark:bg-gray-900/10 dark:border-gray-900 opacity-70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs text-gray-800 dark:text-gray-200">
                              {item.compoundName}
                            </span>
                            {item.ongoingNote && (
                              <span className="text-[9px] text-gray-400 dark:text-gray-500 italic mt-0.5">
                                {item.ongoingNote}
                              </span>
                            )}
                          </div>
                          
                          {/* Compound specific status label */}
                          {isCur ? (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary uppercase tracking-wide border border-primary/20">
                              Current Phase
                            </span>
                          ) : isExp ? (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 uppercase tracking-wide border border-emerald-100 dark:border-emerald-900/20">
                              Experienced
                            </span>
                          ) : (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase tracking-wide border border-gray-200 dark:border-gray-700">
                              {item.countdownText}
                            </span>
                          )}
                        </div>

                        <ul className="space-y-1.5">
                          {item.benefits.map((benefit, bIdx) => {
                            const benefitKey = `${weekNum}:${benefit}`;
                            const isChecked = (localObserved[item.protocolId] || []).includes(benefitKey);

                            if (isExpOrCur) {
                              return (
                                <li key={bIdx} className="text-xs">
                                  <button
                                    onClick={() => handleToggleObserved(item.protocolId, weekNum, benefit)}
                                    className="flex items-start text-left gap-2 w-full hover:bg-gray-100/50 dark:hover:bg-gray-800/40 p-1 -m-1 rounded transition-colors text-gray-750 dark:text-gray-300 font-medium group"
                                  >
                                    <span
                                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center transition-all ${
                                        isChecked
                                          ? 'bg-primary border-primary text-primary-foreground'
                                          : 'border-gray-300 dark:border-gray-700 group-hover:border-primary dark:group-hover:border-primary'
                                      }`}
                                    >
                                      {isChecked && (
                                        <Check className="h-2.5 w-2.5 stroke-[4px] text-white" />
                                      )}
                                    </span>
                                    <span className={isChecked ? 'text-gray-900 dark:text-gray-100 font-semibold' : ''}>
                                      {benefit}
                                    </span>
                                  </button>
                                </li>
                              );
                            }

                            // Disabled upcoming benefit:
                            return (
                              <li
                                key={bIdx}
                                className="text-xs flex items-start gap-2 leading-relaxed text-gray-400 dark:text-gray-600 select-none"
                              >
                                <span className="mt-1 h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                                  <Lock className="h-2 w-2 stroke-[3px]" />
                                </span>
                                <span>{benefit}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
