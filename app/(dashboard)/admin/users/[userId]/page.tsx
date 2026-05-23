import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getManagedUserDoseHistory } from '@/lib/admin/application/AdminService';

interface Props {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const STATUS_STYLES: Record<string, string> = {
  LOGGED: 'bg-green-50 text-green-700 border-green-200',
  SKIPPED: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-gray-100 text-gray-500 border-gray-200',
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function ManagedUserDoseHistoryPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (session.user.role === 'MANAGED_USER') redirect('/dashboard?error=forbidden');

  const { userId } = await params;
  const sp = await searchParams;
  const daysParam = Array.isArray(sp.days) ? sp.days[0] : sp.days;
  const days = Math.min(90, Math.max(7, parseInt(daysParam ?? '30', 10) || 30));

  let history: Awaited<ReturnType<typeof getManagedUserDoseHistory>>;
  try {
    history = await getManagedUserDoseHistory(session.user.id, userId, days);
  } catch (err) {
    if (err instanceof Error && err.message === 'managed_user_not_found') notFound();
    throw err;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-indigo-600 hover:underline">
          ← Managed Users
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Dose History</h1>
        <div className="flex gap-3 mt-2">
          {[7, 14, 30, 60].map((d) => (
            <Link
              key={d}
              href={`?days=${d}`}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                days === d
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 text-gray-600 hover:border-indigo-400'
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No dose logs in the last {days} days.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-2"
            >
              <div>
                <p className="font-medium text-sm text-gray-900">{entry.compoundName}</p>
                <p className="text-xs text-gray-400">
                  {formatDate(entry.scheduledDate)}
                  {typeof entry.amount === 'object' && entry.amount !== null && 'value' in entry.amount && (
                    <> &middot; {String((entry.amount as { value: unknown }).value)}{' '}{String((entry.amount as { unit: unknown }).unit)}</>
                  )}
                </p>
              </div>
              <span
                className={`text-xs rounded-full px-2 py-0.5 border font-medium whitespace-nowrap ${
                  STATUS_STYLES[entry.status] ?? 'bg-gray-100 text-gray-500 border-gray-200'
                }`}
              >
                {entry.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
