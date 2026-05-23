import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listVendorsForUser } from '@/lib/ordering/application/VendorService';
import { VendorStatusBadge } from './_components/VendorStatusBadge';

export default async function OrderingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const vendors = await listVendorsForUser(session.user.id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/ordering/orders"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Order History
          </Link>
          <Link
            href="/ordering/new"
            className="rounded-md bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            + Add Vendor
          </Link>
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm mb-4">No vendors configured yet.</p>
          <Link href="/ordering/new" className="text-indigo-600 text-sm font-medium hover:underline">
            Add your first vendor →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {vendors.map((v) => (
            <li key={v.id}>
              <Link
                href={`/ordering/${v.id}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-indigo-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{v.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">@{v.telegramUsername} · {v.preferredCurrency}</p>
                  </div>
                  <VendorStatusBadge status={v.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
