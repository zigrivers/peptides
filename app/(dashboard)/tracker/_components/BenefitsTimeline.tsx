'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Clock, Sparkles } from 'lucide-react';
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

type BenefitStatus = 'EXPERIENCED' | 'CURRENT' | 'UPCOMING';

type BenefitMoment = {
  protocolId: string;
  compoundName: string;
  week: number;
  benefits: string[];
  status: BenefitStatus;
  timingLabel: string;
  daysUntil: number;
  ongoingNote?: string;
};

function milestoneDate(startDate: Date, week: number): Date {
  const date = new Date(startDate.getTime());
  date.setUTCDate(date.getUTCDate() + Math.max(0, week - 1) * 7);
  return date;
}

function daysBetweenUTC(startDate: Date, endDate: Date): number {
  const startUtc = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const endUtc = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.ceil((endUtc - startUtc) / (1000 * 60 * 60 * 24));
}

function formatCountdown(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Starts today';
  if (daysRemaining >= 14) {
    return `Starts in ${Math.ceil(daysRemaining / 7)} weeks`;
  }
  return `Starts in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
}

function buildBenefitMoments(activeProtocols: Props['activeProtocols'], now: Date): BenefitMoment[] {
  const moments: BenefitMoment[] = [];

  activeProtocols.forEach((protocol) => {
    const timeline = protocol.compound.profile?.benefitTimeline ?? [];
    const validTimeline = timeline
      .filter((item) => item && typeof item.week === 'number' && Array.isArray(item.benefits) && item.benefits.length > 0)
      .sort((a, b) => a.week - b.week);
    if (validTimeline.length === 0) return;

    const startDate = new Date(protocol.startDate);
    const elapsedWeeks = calculateElapsedWeeks(startDate, now);

    validTimeline.forEach((item) => {
      const status: BenefitStatus =
        elapsedWeeks > item.week ? 'EXPERIENCED' : elapsedWeeks === item.week ? 'CURRENT' : 'UPCOMING';
      const date = milestoneDate(startDate, item.week);
      const daysUntil = Math.max(0, daysBetweenUTC(now, date));

      moments.push({
        protocolId: protocol.id,
        compoundName: protocol.compound.name,
        week: item.week,
        benefits: item.benefits,
        status,
        daysUntil,
        timingLabel:
          status === 'CURRENT'
            ? 'Current'
            : status === 'EXPERIENCED'
              ? 'Experienced'
              : formatCountdown(daysUntil),
      });
    });

    const hasCurrentTimelineItem = validTimeline.some((item) => item.week === elapsedWeeks);
    if (elapsedWeeks > 0 && !hasCurrentTimelineItem) {
      const closestPast = [...validTimeline].filter((item) => item.week < elapsedWeeks).pop();
      if (closestPast) {
        moments.push({
          protocolId: protocol.id,
          compoundName: protocol.compound.name,
          week: elapsedWeeks,
          benefits: closestPast.benefits,
          status: 'CURRENT',
          daysUntil: 0,
          timingLabel: 'Current',
          ongoingNote: `Ongoing from Week ${closestPast.week}`,
        });
      }
    }
  });

  return moments;
}

export function BenefitsTimeline({ activeProtocols, currentDateISO }: Props) {
  const now = useMemo(() => (currentDateISO ? new Date(currentDateISO) : new Date()), [currentDateISO]);

  // Initialize client state for experienced observed benefits mapping
  const [localObserved, setLocalObserved] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    activeProtocols.forEach((p) => {
      initial[p.id] = Array.isArray(p.observedBenefits) ? (p.observedBenefits as string[]) : [];
    });
    return initial;
  });

  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Keep state synced with props changes
  useEffect(() => {
    const initial: Record<string, string[]> = {};
    activeProtocols.forEach((p) => {
      initial[p.id] = Array.isArray(p.observedBenefits) ? (p.observedBenefits as string[]) : [];
    });
    setLocalObserved(initial);
  }, [activeProtocols]);

  const moments = useMemo(() => buildBenefitMoments(activeProtocols, now), [activeProtocols, now]);

  const previewItems = useMemo(() => {
    const current = moments
      .filter((item) => item.status === 'CURRENT')
      .sort((a, b) => a.compoundName.localeCompare(b.compoundName));
    const upcoming = moments
      .filter((item) => item.status === 'UPCOMING')
      .sort((a, b) => a.daysUntil - b.daysUntil || a.week - b.week || a.compoundName.localeCompare(b.compoundName));
    const fallback = moments
      .filter((item) => item.status === 'EXPERIENCED')
      .sort((a, b) => b.week - a.week || a.compoundName.localeCompare(b.compoundName));

    return [...current, ...upcoming].slice(0, 4).length > 0
      ? [...current, ...upcoming].slice(0, 4)
      : fallback.slice(0, 3);
  }, [moments]);

  const reviewItems = useMemo(
    () =>
      moments
        .filter((item) => item.status === 'CURRENT' || item.status === 'EXPERIENCED')
        .sort((a, b) => {
          const statusWeight = { CURRENT: 0, EXPERIENCED: 1, UPCOMING: 2 };
          return statusWeight[a.status] - statusWeight[b.status] || b.week - a.week || a.compoundName.localeCompare(b.compoundName);
        }),
    [moments]
  );

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

  if (moments.length === 0) {
    return null;
  }

  const renderBenefit = (item: BenefitMoment, benefit: string, index: number) => {
    const benefitKey = `${item.week}:${benefit}`;
    const isChecked = (localObserved[item.protocolId] || []).includes(benefitKey);
    const canTrack = item.status === 'CURRENT' || item.status === 'EXPERIENCED';

    if (!canTrack) {
      return (
        <li
          key={`${item.protocolId}-${item.week}-${benefit}-${index}`}
          className="rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-medium leading-snug text-gray-600 dark:bg-gray-900/50 dark:text-gray-400"
        >
          {benefit}
        </li>
      );
    }

    return (
      <li key={`${item.protocolId}-${item.week}-${benefit}-${index}`}>
        <button
          type="button"
          onClick={() => handleToggleObserved(item.protocolId, item.week, benefit)}
          className="flex min-h-9 w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <span
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              isChecked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-gray-300 dark:border-gray-700'
            }`}
            aria-hidden="true"
          >
            {isChecked && <Check className="h-3 w-3 stroke-[3px]" aria-hidden="true" />}
          </span>
          <span className={isChecked ? 'font-semibold text-gray-950 dark:text-gray-100' : ''}>
            {benefit}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-900 dark:bg-gray-950">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-gray-900 text-pretty dark:text-gray-100">What To Expect Next</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Compact preview from active regimens.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="min-h-6 shrink-0 rounded text-[10px] font-bold text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {previewItems.map((item) => {
          const isCurrent = item.status === 'CURRENT';
          const isExperienced = item.status === 'EXPERIENCED';
          return (
            <article
              key={`${item.protocolId}-${item.week}-${item.status}-${item.ongoingNote ?? ''}`}
              className={`rounded-lg border p-3 ${
                isCurrent
                  ? 'border-primary/25 bg-primary/[0.03]'
                  : isExperienced
                    ? 'border-success/20 bg-success/[0.03]'
                    : 'border-gray-100 bg-gray-50/60 dark:border-gray-900 dark:bg-gray-900/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.compoundName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Week {item.week}
                    {item.ongoingNote ? ` · ${item.ongoingNote}` : ''}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    isCurrent
                      ? 'border-primary/25 bg-primary/10 text-primary'
                      : isExperienced
                        ? 'border-success/25 bg-success/10 text-success'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400'
                  }`}
                >
                  {isCurrent ? (
                    <Clock className="h-3 w-3" aria-hidden="true" />
                  ) : isExperienced ? (
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  ) : null}
                  {item.timingLabel}
                </span>
              </div>

              <ul className="mt-2 space-y-1">
                {item.benefits.slice(0, 2).map((benefit, index) => renderBenefit(item, benefit, index))}
              </ul>
            </article>
          );
        })}
      </div>

      {reviewItems.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-900">
          <button
            type="button"
            onClick={() => setReviewOpen((open) => !open)}
            aria-expanded={reviewOpen}
            className="flex min-h-9 w-full items-center justify-between rounded-lg px-2 text-left text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-400 dark:hover:bg-gray-900"
          >
            <span>Review observed benefits</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${reviewOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {reviewOpen && (
            <div className="mt-2 space-y-2">
              {reviewItems.map((item) => (
                <div
                  key={`review-${item.protocolId}-${item.week}-${item.status}`}
                  className="rounded-lg border border-gray-100 p-3 dark:border-gray-900"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-gray-900 dark:text-gray-100">{item.compoundName}</p>
                      <p className="text-[10px] text-gray-500">Week {item.week}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                      {item.timingLabel}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {item.benefits.map((benefit, index) => renderBenefit(item, benefit, index))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
