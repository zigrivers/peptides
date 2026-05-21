'use client';

import Link from 'next/link';
import type { CycleWeekInfo } from '@/lib/tracker/domain/types';
import type { AdherenceResult } from '@/lib/tracker/application/OutcomeLogService';
import type { SerializedVial } from '@/app/(dashboard)/reconstitution/_components/VialInventory';

const LOW_SUPPLY_DAYS = 14;

interface Props {
  weekInfo: CycleWeekInfo | null;
  vials: SerializedVial[];
  ratingAvg: number | null;
  adherence: AdherenceResult;
  hasActiveProtocols: boolean;
  userRole: 'POWER_USER' | 'MANAGED_USER';
  fetchedAt: string; // ISO string
}

function RatingStars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? 'text-amber-400' : 'text-gray-300'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

function StaleIndicator({ fetchedAt }: { fetchedAt: string }) {
  const fetchedDate = new Date(fetchedAt);
  const minutesAgo = Math.floor((Date.now() - fetchedDate.getTime()) / 60_000);
  if (minutesAgo < 30) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-xs text-amber-600 mt-1"
    >
      &#9888; Last refreshed {fetchedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

function EmptyState({ userRole }: { userRole: 'POWER_USER' | 'MANAGED_USER' }) {
  if (userRole === 'MANAGED_USER') {
    return (
      <div
        role="status"
        className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center shadow-sm"
      >
        <p className="text-gray-600 font-medium">No dose scheduled today</p>
        <p className="text-sm text-gray-400 mt-1">Your administrator will configure your protocol.</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-indigo-100 bg-indigo-50 px-6 py-8 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-indigo-900 mb-4">Get started</h2>
      <div className="flex flex-col gap-3">
        <Link
          href="/reference"
          className="rounded-md bg-white border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors text-center"
        >
          Browse Catalog
        </Link>
        <Link
          href="/tracker/protocols/new"
          className="rounded-md bg-white border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors text-center"
        >
          Create Protocol
        </Link>
        <Link
          href="/tracker"
          className="rounded-md bg-white border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors text-center"
        >
          Log First Dose
        </Link>
      </div>
    </div>
  );
}

export function StackOverview({ weekInfo, vials, ratingAvg, adherence, hasActiveProtocols, userRole, fetchedAt }: Props) {
  const lowSupplyVials = vials.filter((v) => {
    if (!v.expiresAt) return false;
    const daysUntil = (new Date(v.expiresAt).getTime() - Date.now()) / 86400_000;
    return daysUntil < LOW_SUPPLY_DAYS;
  });

  if (!hasActiveProtocols) {
    return <EmptyState userRole={userRole} />;
  }

  return (
    <div className="space-y-4">
      {/* Cycle Week tile */}
      {weekInfo && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Current Cycle</p>
          <p className="text-lg font-bold text-gray-900">
            {weekInfo.cycleName} — Week {weekInfo.weekNumber}
            {weekInfo.totalWeeks && (
              <span className="text-gray-400 font-normal text-sm"> of {weekInfo.totalWeeks}</span>
            )}
          </p>
          <StaleIndicator fetchedAt={fetchedAt} />
        </div>
      )}

      {/* Vial supply tile */}
      {vials.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Vial Supply</p>
          {lowSupplyVials.length > 0 ? (
            <ul className="space-y-1" aria-label="Low-supply vials">
              {lowSupplyVials.map((v) => {
                const daysUntil = v.expiresAt
                  ? Math.ceil((new Date(v.expiresAt).getTime() - Date.now()) / 86400_000)
                  : null;
                const isPast = daysUntil !== null && daysUntil <= 0;
                return (
                  <li key={v.id} className="flex items-center gap-2 text-sm">
                    <span
                      aria-label={isPast ? 'Expired' : 'Low supply warning'}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border text-xs font-medium ${
                        isPast
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}
                    >
                      <span aria-hidden="true">{isPast ? '✕' : '⚠'}</span>
                      {isPast ? 'Expired' : `${daysUntil}d left`}
                    </span>
                    <span className="text-gray-700">{v.compoundName}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-green-700 font-medium">&#10003; All vials have at least {LOW_SUPPLY_DAYS} days supply</p>
          )}
          <StaleIndicator fetchedAt={fetchedAt} />
        </div>
      )}

      {/* Ratings & Adherence tile */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Last 7 Days</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Wellbeing avg</p>
            {ratingAvg !== null ? (
              <div>
                <RatingStars rating={ratingAvg} />
                <p className="text-xs text-gray-500 mt-0.5">{ratingAvg.toFixed(1)} / 5</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No ratings yet</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Adherence</p>
            {adherence.total > 0 ? (
              <div>
                <p className="text-xl font-bold text-gray-900">{Math.round(adherence.percent)}%</p>
                <p className="text-xs text-gray-500">
                  {adherence.logged}/{adherence.total} doses logged
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No doses yet</p>
            )}
          </div>
        </div>
        <StaleIndicator fetchedAt={fetchedAt} />
      </div>

      {/* Quick link to tracker */}
      <Link
        href="/tracker"
        className="block rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 hover:bg-indigo-100 transition-colors shadow-sm text-center"
      >
        <span className="text-sm font-semibold text-indigo-700">View Today&#x27;s Doses &rarr;</span>
      </Link>
    </div>
  );
}
