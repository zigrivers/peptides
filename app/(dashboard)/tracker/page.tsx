import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getDueTodayForBatch } from '@/lib/tracker/application/BatchLogService';
import { getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import { findCompoundsByIds, getCompoundsMinimal } from '@/lib/reference/infrastructure/CompoundRepo';
import { getRecentDoseLogsForUser } from '@/lib/tracker/application/DoseLogService';
import { BatchLogReview } from './_components/BatchLogReview';
import { TrackerCalendar } from './_components/TrackerCalendar';
import { getSiteSuggestion } from '@/lib/tracker/application/SiteRotationService';
import type { SiteSuggestion } from '@/lib/tracker/domain/SiteRotation';

export default async function TrackerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [protocols, dueToday, weekInfo, doseLogs, compoundsList] = await Promise.all([
    getProtocolsForUser(userId),
    getDueTodayForBatch(userId),
    getCurrentWeekInfo(userId),
    getRecentDoseLogsForUser(userId),
    getCompoundsMinimal(),
  ]);

  const compoundsMap = Object.fromEntries(
    compoundsList.map((c) => [c.id, { name: c.name, slug: c.slug }])
  );

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

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 animate-page-enter">
      {dueToday.length > 0 && (
        <section>
          <BatchLogReview items={dueToday} compoundNames={compoundNames} />
        </section>
      )}

      {weekInfo && (
        <section>
          <Link
            href="/tracker/cycles"
            className="flex items-center justify-between rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20 px-4 py-3 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors"
          >
            <div>
              <p className="text-xs text-primary/70 font-medium uppercase tracking-wide">Active Cycle</p>
              <p className="text-sm font-semibold text-primary mt-0.5">
                {weekInfo.cycleName}
                {' — '}
                {weekInfo.totalWeeks
                  ? `Week ${weekInfo.weekNumber} of ${weekInfo.totalWeeks}`
                  : `Week ${weekInfo.weekNumber}`}
              </p>
            </div>
            <span className="text-primary/60 text-sm">→</span>
          </Link>
        </section>
      )}

      <section>
        <Link
          href="/tracker/outcomes"
          className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 hover:bg-emerald-100 transition-colors"
        >
          <div>
            <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Outcomes</p>
            <p className="text-sm font-semibold text-emerald-800 mt-0.5">
              Log today&apos;s rating and see your dose-outcome correlation →
            </p>
          </div>
        </Link>
      </section>

      <section>
        <TrackerCalendar
          protocols={protocols}
          doseLogs={serializedDoseLogs}
          compounds={compoundsMap}
          siteSuggestions={siteSuggestions}
          initialDateISO={new Date().toISOString()}
        />
      </section>

      <section className="bg-white dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-900 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Regimen Overview</h2>
            <p className="text-xs text-gray-500 mt-0.5 animate-pulse-slow">
              {protocols.filter((p) => p.status === 'ACTIVE').length} active protocols running
            </p>
          </div>
          <Link
            href="/regimen"
            className="text-primary hover:text-primary/90 text-sm font-semibold flex items-center gap-1 transition-colors"
          >
            Manage Regimen →
          </Link>
        </div>

        {protocols.filter((p) => p.status === 'ACTIVE').length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No active protocols. Click Manage Protocols to configure.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {protocols.filter((p) => p.status === 'ACTIVE').map((p) => {
              const compName = compoundsMap[p.compoundId]?.name ?? 'Unknown Compound';
              return (
                <span
                  key={p.id}
                  className="inline-flex items-center rounded-md bg-gray-50 dark:bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200/50 dark:border-gray-800"
                >
                  <span className="font-semibold mr-1">{compName}</span>
                  <span className="text-gray-500">({p.dose.amount} {p.dose.unit})</span>
                </span>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
