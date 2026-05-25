import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getDueTodayForBatch } from '@/lib/tracker/application/BatchLogService';
import { getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import { findCompoundsByIds, getCompoundsMinimal } from '@/lib/reference/infrastructure/CompoundRepo';
import { getRecentDoseLogsForUser } from '@/lib/tracker/application/DoseLogService';
import type { Protocol } from '@/lib/tracker/domain/types';
import { formatSchedule } from '@/lib/tracker/domain/formatters';
import { BatchLogReview } from './_components/BatchLogReview';
import { TrackerCalendar } from './_components/TrackerCalendar';
import { getSiteSuggestion } from '@/lib/tracker/application/SiteRotationService';
import type { SiteSuggestion } from '@/lib/tracker/domain/SiteRotation';

function statusBadge(status: Protocol['status']) {
  const styles: Record<Protocol['status'], string> = {
    ACTIVE: 'bg-green-50 text-green-700',
    PAUSED: 'bg-yellow-50 text-yellow-700',
    COMPLETED: 'bg-gray-100 text-gray-600',
    DEACTIVATED: 'bg-red-50 text-red-700',
  };
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

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

      <section>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Protocols</h1>
          <Link
            href="/tracker/protocols/new"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            + New Protocol
          </Link>
        </div>

        {protocols.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm mb-4">No protocols yet.</p>
            <Link
              href="/tracker/protocols/new"
              className="text-primary text-sm font-medium hover:underline"
            >
              Create your first protocol →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {protocols.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/tracker/protocols/${p.id}`}
                  className="block rounded-lg border border-gray-200 p-4 hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">
                        <span className="font-mono">{p.dose.amount}</span> {p.dose.unit} — {formatSchedule(p.schedule)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.administrationRoute} · Started {p.startDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}
                      </p>
                    </div>
                    {statusBadge(p.status)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
