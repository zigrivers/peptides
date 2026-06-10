import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getCycleById, getCurrentWeekInfo } from '@/lib/tracker/application/CycleService';
import { RestartCycleButton } from './_components/RestartCycleButton';

export default async function CycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;
  const [cycle, weekInfo] = await Promise.all([
    getCycleById(session.user.id, id),
    getCurrentWeekInfo(session.user.id),
  ]);

  if (!cycle) notFound();

  const isCurrentCycle = weekInfo?.cycleId === cycle.id;

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/tracker/cycles"
          className="inline-flex min-h-9 items-center rounded-md px-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          ← Cycles
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{cycle.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cycle.startDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}
            {cycle.endDate && ` – ${cycle.endDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}`}
          </p>
        </div>
        <span className={`text-xs rounded-full px-2 py-1 font-medium ${cycle.status === 'ACTIVE' ? 'text-green-700 bg-green-50' : 'text-gray-600 bg-gray-100'}`}>
          {cycle.status.charAt(0) + cycle.status.slice(1).toLowerCase()}
        </span>
      </div>

      {isCurrentCycle && weekInfo && (
        <div className="mb-6 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <p className="text-sm font-medium text-indigo-800">
            {weekInfo.totalWeeks
              ? `Week ${weekInfo.weekNumber} of ${weekInfo.totalWeeks}`
              : `Week ${weekInfo.weekNumber}`}
          </p>
        </div>
      )}

      <div className="mt-6 border-t pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Actions</h2>
        <RestartCycleButton cycleId={cycle.id} />
      </div>
    </main>
  );
}
