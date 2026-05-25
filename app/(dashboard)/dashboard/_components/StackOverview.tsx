'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Flame } from 'lucide-react';
import type { CycleWeekInfo } from '@/lib/tracker/domain/types';
import type { AdherenceResult } from '@/lib/tracker/application/OutcomeLogService';
import type { SerializedVial } from '@/app/(dashboard)/reconstitution/_components/VialInventory';

const LOW_SUPPLY_DAYS = 14;

export function isVialLowSupply(v: { daysUntilExpiry: number | null; badges: string[] }): boolean {
  if (v.badges.some((b) => b === 'LOW_INVENTORY' || b === 'EXPIRED')) return true;
  return v.daysUntilExpiry !== null && v.daysUntilExpiry < LOW_SUPPLY_DAYS;
}

interface Props {
  weekInfo: CycleWeekInfo | null;
  vials: SerializedVial[];
  ratingAvg: number | null;
  adherence: AdherenceResult;
  hasActiveProtocols: boolean;
  hasDoseToday: boolean;
  userRole: 'POWER_USER' | 'MANAGED_USER';
  fetchedAt: string; // ISO string
  streak?: {
    currentStreak: number;
    longestStreak: number;
    isCapped: boolean;
  };
}

function RatingStars({ rating }: { rating: number }) {
  const rounded = Math.floor(rating);
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? 'text-amber-400' : 'text-border'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

function useStaleMinutes(fetchedAt: string): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  return Math.floor((now - new Date(fetchedAt).getTime()) / 60_000);
}

function StaleIndicator({ fetchedAt }: { fetchedAt: string }) {
  const minutesAgo = useStaleMinutes(fetchedAt);
  if (minutesAgo === null || minutesAgo < 30) return null;
  return (
    <p aria-hidden="true" className="text-xs text-amber-600 mt-1">
      &#9888; Last refreshed {new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

function StaleAnnouncer({ fetchedAt }: { fetchedAt: string }) {
  const minutesAgo = useStaleMinutes(fetchedAt);
  if (minutesAgo === null || minutesAgo < 30) return null;
  return (
    <p role="status" aria-live="polite" className="sr-only">
      Dashboard data was last refreshed {new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

// AC-8 (inline Confirm/Skip card for managed users) is deferred to a follow-on story.
// This view is the approved interim: cycle info + link to /tracker.
function ManagedUserActiveView({ weekInfo, fetchedAt }: { weekInfo: CycleWeekInfo | null; fetchedAt: string }) {
  return (
    <div className="space-y-4">
      <StaleAnnouncer fetchedAt={fetchedAt} />
      {weekInfo && (
        <div className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Current Cycle</p>
          <p className="text-lg font-bold text-foreground">
            {weekInfo.cycleName} — Week {weekInfo.weekNumber}
            {weekInfo.totalWeeks && (
              <span className="text-muted-foreground font-normal text-sm"> of {weekInfo.totalWeeks}</span>
            )}
          </p>
          <StaleIndicator fetchedAt={fetchedAt} />
        </div>
      )}
      <Link
        href="/tracker"
        className="block rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-5 py-6 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors shadow-sm text-center"
      >
        <p className="text-base font-semibold text-primary">View Today&#x27;s Doses &rarr;</p>
        <p className="text-sm text-muted-foreground mt-1">Confirm or skip your scheduled doses</p>
      </Link>
    </div>
  );
}

function EmptyState({ userRole }: { userRole: 'POWER_USER' | 'MANAGED_USER' }) {
  if (userRole === 'MANAGED_USER') {
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-card text-card-foreground px-6 py-8 text-center shadow-sm"
      >
        <p className="text-foreground font-medium">No dose scheduled today</p>
        <p className="text-sm text-muted-foreground mt-1">Your administrator will configure your protocol.</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-primary/10 bg-primary/5 dark:bg-primary/10 px-6 py-8 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-primary mb-4">Get started</h2>
      <div className="flex flex-col gap-3">
        <Link
          href="/reference"
          className="rounded-md bg-white dark:bg-card border border-primary/20 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors text-center"
        >
          Browse Catalog
        </Link>
        <Link
          href="/tracker/protocols/new"
          className="rounded-md bg-white dark:bg-card border border-primary/20 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors text-center"
        >
          Create Protocol
        </Link>
        <Link
          href="/tracker"
          className="rounded-md bg-white dark:bg-card border border-primary/20 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors text-center"
        >
          Log First Dose
        </Link>
      </div>
    </div>
  );
}

export function StackOverview({
  weekInfo,
  vials,
  ratingAvg,
  adherence,
  hasActiveProtocols,
  hasDoseToday,
  userRole,
  fetchedAt,
  streak = { currentStreak: 0, longestStreak: 0, isCapped: false },
}: Props) {
  const lowSupplyVials = vials.filter(isVialLowSupply);

  if (!hasActiveProtocols) {
    return <EmptyState userRole={userRole} />;
  }

  if (userRole === 'MANAGED_USER') {
    if (!hasDoseToday) {
      return (
        <div
          role="status"
          className="rounded-xl border border-border bg-card text-card-foreground px-6 py-8 text-center shadow-sm"
        >
          <p className="text-foreground font-medium">No dose scheduled today</p>
          <p className="text-sm text-muted-foreground mt-1">Check back on your next scheduled day.</p>
        </div>
      );
    }
    return <ManagedUserActiveView weekInfo={weekInfo} fetchedAt={fetchedAt} />;
  }

  return (
    <div className="space-y-4">
      {/* Single aria-live region for stale announcements (prevents duplicate screen reader reads) */}
      <StaleAnnouncer fetchedAt={fetchedAt} />
      {/* Cycle Week tile */}
      {weekInfo && (
        <div className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Current Cycle</p>
          <p className="text-lg font-bold text-foreground">
            {weekInfo.cycleName} — Week {weekInfo.weekNumber}
            {weekInfo.totalWeeks && (
              <span className="text-muted-foreground font-normal text-sm"> of {weekInfo.totalWeeks}</span>
            )}
          </p>
          <StaleIndicator fetchedAt={fetchedAt} />
        </div>
      )}

      {/* Vial supply tile */}
      {vials.length > 0 && (
        <div className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vial Supply</p>
          {lowSupplyVials.length > 0 ? (
            <ul className="space-y-1" aria-label="Low-supply vials">
              {lowSupplyVials.map((v) => {
                const daysUntil = v.daysUntilExpiry;
                const isExpired = v.badges.includes('EXPIRED') || (daysUntil !== null && daysUntil <= 0);
                const isLowInventory = v.badges.includes('LOW_INVENTORY');
                const label = isExpired ? 'Expired' : isLowInventory ? 'Low inventory' : `${daysUntil}d left`;
                const ariaLabel = isExpired ? 'Expired' : isLowInventory ? 'Low inventory warning' : 'Low supply warning';
                const style = isExpired
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-400'
                  : isLowInventory
                  ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900/30 dark:text-orange-400'
                  : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400';
                const icon = isExpired ? '✕' : '⚠';
                return (
                  <li key={v.id} className="flex items-center gap-2 text-sm">
                    <span
                      aria-label={ariaLabel}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-xs font-medium ${style}`}
                    >
                      <span aria-hidden="true">{icon}</span>
                      {label}
                    </span>
                    <span className="text-foreground">{v.compoundName}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">&#10003; All vials have at least {LOW_SUPPLY_DAYS} days supply</p>
          )}
          <StaleIndicator fetchedAt={fetchedAt} />
        </div>
      )}

      {/* Ratings, Adherence, & Streak tile */}
      <div className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Stats Overview</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Wellbeing Avg */}
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Wellbeing Avg</p>
              {ratingAvg !== null ? (
                <div>
                  <RatingStars rating={ratingAvg} />
                  <p className="text-xs text-muted-foreground mt-1">{ratingAvg.toFixed(1)} / 5</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/60">No ratings yet</p>
              )}
            </div>
          </div>

          {/* Adherence Circular Progress Ring */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle cx="24" cy="24" r="20" className="stroke-muted fill-none" strokeWidth="4" />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  className="stroke-primary fill-none transition-all duration-500 ease-out"
                  strokeWidth="4"
                  strokeDasharray={2 * Math.PI * 20}
                  strokeDashoffset={2 * Math.PI * 20 * (1 - (adherence.total > 0 ? adherence.percent : 0) / 100)}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-xs font-bold text-foreground">{Math.round(adherence.percent)}%</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Adherence</p>
              {adherence.total > 0 ? (
                <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                  {adherence.logged}/{adherence.total} logged
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-0.5">No doses yet</p>
              )}
            </div>
          </div>

          {/* Timezone-Agnostic Streak Counter */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/20 text-orange-500 flex items-center justify-center shrink-0">
              <Flame className="w-6 h-6 fill-orange-500 animate-pulse" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Streak</p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {streak.currentStreak}
                {streak.isCapped && '+'}
                <span className="text-xs font-normal text-muted-foreground ml-1">days</span>
              </p>
              <p className="text-[10px] text-muted-foreground">Longest: {streak.longestStreak}d</p>
            </div>
          </div>
        </div>
        <StaleIndicator fetchedAt={fetchedAt} />
      </div>

      {/* Quick link to tracker */}
      <Link
        href="/tracker"
        className="block rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 px-5 py-4 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors shadow-sm text-center"
      >
        <span className="text-sm font-semibold text-primary">View Today&#x27;s Doses &rarr;</span>
      </Link>
    </div>
  );
}
