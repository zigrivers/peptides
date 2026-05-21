import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import type { Protocol } from '@/lib/tracker/domain/types';

function formatSchedule(schedule: Protocol['schedule']): string {
  switch (schedule.frequency) {
    case 'Daily': return 'Daily';
    case 'EOD': return 'Every other day';
    case 'SpecificDaysOfWeek':
      return schedule.daysOfWeek.join(', ');
    case 'CustomInterval':
      return `Every ${schedule.intervalDays} days`;
  }
}

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

  const protocols = await getProtocolsForUser(session.user.id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Protocols</h1>
        <Link
          href="/tracker/protocols/new"
          className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Protocol
        </Link>
      </div>

      {protocols.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm mb-4">No protocols yet.</p>
          <Link
            href="/tracker/protocols/new"
            className="text-indigo-600 text-sm font-medium hover:underline"
          >
            Create your first protocol →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {protocols.map((p) => (
            <li key={p.id}>
              <Link
                href={`/tracker/protocols/${p.id}/edit`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-indigo-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">
                      {p.dose.amount} {p.dose.unit} — {formatSchedule(p.schedule)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.administrationRoute} · Started {p.startDate.toLocaleDateString()}
                    </p>
                  </div>
                  {statusBadge(p.status)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
