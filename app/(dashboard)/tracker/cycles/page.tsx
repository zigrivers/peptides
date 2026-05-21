import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getCyclesForUser, getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';

export default async function CyclesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const [cycles, weekInfo] = await Promise.all([
    getCyclesForUser(userId),
    getCurrentWeekInfo(userId),
  ]);

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/tracker" className="text-sm text-gray-500 hover:text-gray-700">
          ← Protocols
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Cycles</h1>
        <Link
          href="/tracker/cycles/new"
          className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Cycle
        </Link>
      </div>

      {weekInfo && (
        <div className="mb-6 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <p className="text-sm font-medium text-indigo-800">
            {weekInfo.cycleName}
            {' — '}
            {weekInfo.totalWeeks
              ? `Week ${weekInfo.weekNumber} of ${weekInfo.totalWeeks}`
              : `Week ${weekInfo.weekNumber}`}
          </p>
        </div>
      )}

      {cycles.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm mb-4">No cycles yet.</p>
          <Link href="/tracker/cycles/new" className="text-indigo-600 text-sm font-medium hover:underline">
            Create your first cycle →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {cycles.map((c) => (
            <li key={c.id}>
              <Link
                href={`/tracker/cycles/${c.id}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-indigo-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {c.startDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}
                      {c.endDate && ` – ${c.endDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}`}
                    </p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${c.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
