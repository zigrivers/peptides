import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getProtocolById } from '@/lib/tracker/application/ProtocolService';
import { getTodaysDoseLog } from '@/lib/tracker/application/DoseLogService';
import { findCompoundById } from '@/lib/reference/infrastructure/CompoundRepo';
import { formatSchedule } from '@/lib/tracker/domain/formatters';
import { ProtocolActions } from './_components/ProtocolActions';
import { DoseLogActions } from './_components/DoseLogActions';

export default async function ProtocolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;
  const protocol = await getProtocolById(id, session.user.id);
  if (!protocol) notFound();

  const [compound, todaysDoseLog] = await Promise.all([
    findCompoundById(protocol.compoundId),
    protocol.status === 'ACTIVE' ? getTodaysDoseLog(session.user.id, id) : Promise.resolve(null),
  ]);

  const nowUTC = new Date();
  const todayISO = `${nowUTC.getUTCFullYear()}-${String(nowUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(nowUTC.getUTCDate()).padStart(2, '0')}`;

  const statusColors: Record<string, string> = {
    ACTIVE: 'text-green-700 bg-green-50',
    PAUSED: 'text-yellow-700 bg-yellow-50',
    COMPLETED: 'text-gray-600 bg-gray-100',
    DEACTIVATED: 'text-red-700 bg-red-50',
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/tracker" className="text-sm text-gray-500 hover:text-gray-700">
          ← Protocols
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {compound?.name ?? protocol.compoundId}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {protocol.dose.amount} {protocol.dose.unit} — {formatSchedule(protocol.schedule)}
          </p>
        </div>
        <span className={`text-xs rounded-full px-2 py-1 font-medium ${statusColors[protocol.status] ?? 'text-gray-600 bg-gray-100'}`}>
          {protocol.status.charAt(0) + protocol.status.slice(1).toLowerCase()}
        </span>
      </div>

      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Route</dt>
          <dd className="font-medium text-gray-900">{protocol.administrationRoute}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">Start date</dt>
          <dd className="font-medium text-gray-900">{protocol.startDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}</dd>
        </div>
        {protocol.endDate && (
          <div className="flex justify-between">
            <dt className="text-gray-500">End date</dt>
            <dd className="font-medium text-gray-900">{protocol.endDate.toLocaleDateString(undefined, { timeZone: 'UTC' })}</dd>
          </div>
        )}
        {protocol.notes && (
          <div>
            <dt className="text-gray-500 mb-1">Notes</dt>
            <dd className="text-gray-700 whitespace-pre-wrap">{protocol.notes}</dd>
          </div>
        )}
      </dl>

      {protocol.status !== 'DEACTIVATED' && (
        <div className="mt-6">
          <Link
            href={`/tracker/protocols/${protocol.id}/edit`}
            className="text-sm text-indigo-600 hover:underline"
          >
            Edit protocol →
          </Link>
        </div>
      )}

      {protocol.status === 'ACTIVE' && (
        <div className="mt-6 border-t pt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Today&apos;s dose</h2>
          <DoseLogActions
            protocolId={protocol.id}
            scheduledDate={todayISO}
            amount={protocol.dose}
            existingStatus={todaysDoseLog?.status as 'LOGGED' | 'SKIPPED' | undefined}
          />
        </div>
      )}

      <ProtocolActions protocol={protocol} />
    </main>
  );
}
