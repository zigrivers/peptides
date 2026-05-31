import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getDueTodayForBatch } from '@/lib/tracker/application/BatchLogService';
import { getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import { findCompoundsByIds, listCompounds } from '@/lib/reference/infrastructure/CompoundRepo';
import { getRecentDoseLogsForUser, getDoseLogsRange } from '@/lib/tracker/application/DoseLogService';
import { BatchLogReview } from './_components/BatchLogReview';
import { TrackerCalendar } from './_components/TrackerCalendar';
import { BenefitsTimeline } from './_components/BenefitsTimeline';
import { getSiteSuggestion } from '@/lib/tracker/application/SiteRotationService';
import type { SiteSuggestion } from '@/lib/tracker/domain/SiteRotation';
import type { CompoundProfile } from '@/lib/reference/domain/types';

export default async function TrackerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const streakLimitDays = 365;
  const streakSince = new Date();
  streakSince.setUTCDate(streakSince.getUTCDate() - streakLimitDays);

  const [protocols, dueToday, weekInfo, doseLogs, compoundsList, allDoseLogsForStreak] = await Promise.all([
    getProtocolsForUser(userId),
    getDueTodayForBatch(userId),
    getCurrentWeekInfo(userId),
    getRecentDoseLogsForUser(userId),
    listCompounds({ includeArchived: true }),
    getDoseLogsRange(userId, streakSince),
  ]);

  const compoundsMap = Object.fromEntries(
    compoundsList.map((c) => [c.id, { name: c.name, slug: c.slug, profile: c.profile }])
  );

  const serializedProtocols = protocols.map((p) => ({
    ...p,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
    observedBenefits: p.observedBenefits
      ? JSON.parse(JSON.stringify(p.observedBenefits))
      : null,
  }));

  const serializedDoseLogs = doseLogs.map((log) => ({
    ...log,
    loggedAt: log.loggedAt.toISOString(),
    scheduledDate: log.scheduledDate.toISOString(),
    amount: log.amount,
    injectionSite: log.injectionSite,
    status: log.status,
  }));

  // Resolve compound names for batch review display — single bulk query
  const compoundIds = [...new Set(dueToday.map((i) => i.protocol.compoundId))];
  const compoundNamesRaw = await findCompoundsByIds(compoundIds);
  // Fall back to the compound ID string if not found (e.g., seed data gap)
  const compoundNames: Record<string, string> = Object.fromEntries(
    compoundIds.map((id) => [id, compoundNamesRaw[id] ?? id])
  );

  // Bulk fetch site suggestions for all active protocols
  const siteSuggestions: Record<string, SiteSuggestion> = {};
  await Promise.all(
    protocols
      .filter((p) => p.status === 'ACTIVE')
      .map(async (p) => {
        try {
          const suggestion = await getSiteSuggestion(userId, p.id);
          siteSuggestions[p.id] = suggestion;
        } catch (e) {
          console.error(`Failed to fetch site suggestion for protocol ${p.id}:`, e);
        }
      })
  );

  const serializedDueToday = dueToday.map((item) => ({
    ...item,
    protocol: {
      ...item.protocol,
      startDate: item.protocol.startDate.toISOString(),
      endDate: item.protocol.endDate ? item.protocol.endDate.toISOString() : null,
    },
    existingLog: item.existingLog
      ? {
          ...item.existingLog,
          loggedAt: item.existingLog.loggedAt.toISOString(),
          scheduledDate: item.existingLog.scheduledDate.toISOString(),
        }
      : null,
    safetyWarnings: item.safetyWarnings || [],
  }));

  // Prepare active protocols with compound profiles for the Expected Benefits Timeline
  const serializedActiveProtocolsWithTimeline = serializedProtocols
    .filter((p) => p.status === 'ACTIVE')
    .map((p) => {
      const comp = compoundsMap[p.compoundId];
      return {
        ...p,
        compound: {
          name: comp?.name ?? 'Unknown',
          slug: comp?.slug ?? 'unknown',
          profile: (comp?.profile as CompoundProfile | null) ?? null,
        },
      };
    });

  const loggedDates = allDoseLogsForStreak
    .filter((log) => log.status === 'LOGGED')
    .map((log) => log.scheduledDate.toISOString().split('T')[0]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      {/* Page Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Daily Tracker</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Log your daily protocol doses, rotation sites, and track adaptation timelines.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Calendar navigation and action panel */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          <section>
            <TrackerCalendar
              protocols={serializedProtocols}
              doseLogs={serializedDoseLogs}
              compounds={compoundsMap}
              siteSuggestions={siteSuggestions}
              initialDateISO={todayUTC.toISOString()}
              loggedDates={loggedDates}
            />
          </section>

          {/* Batch Log review for pending / skipped (if any) */}
          {dueToday.length > 0 && (
            <section>
              <BatchLogReview items={serializedDueToday} compoundNames={compoundNames} />
            </section>
          )}
        </div>

        {/* Right Column: Sidebar utilities and adaptaion timeline */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          {/* Utilities: Active Cycle & Outcomes links */}
          <div className="flex flex-col gap-4">
            {weekInfo && (
              <Link
                href="/tracker/cycles"
                className="flex items-center justify-between rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 px-4 py-3 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors"
              >
                <div>
                  <p className="text-xs text-primary/70 font-semibold uppercase tracking-wider">Active Cycle</p>
                  <p className="text-sm font-bold text-primary mt-0.5">
                    {weekInfo.cycleName}
                    {' — '}
                    {weekInfo.totalWeeks
                      ? `Week ${weekInfo.weekNumber} of ${weekInfo.totalWeeks}`
                      : `Week ${weekInfo.weekNumber}`}
                  </p>
                </div>
                <span className="text-primary/60 text-sm">→</span>
              </Link>
            )}

            <Link
              href="/tracker/outcomes"
              className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 px-4 py-3 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
            >
              <div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">Outcomes</p>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  Log ratings & correlation →
                </p>
              </div>
            </Link>
          </div>

          {/* Expected Benefits Timeline */}
          <BenefitsTimeline
            activeProtocols={serializedActiveProtocolsWithTimeline}
            currentDateISO={todayUTC.toISOString()}
          />
        </div>
      </div>
    </main>
  );
}


