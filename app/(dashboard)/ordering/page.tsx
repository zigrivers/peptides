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
    <main className="max-w-4xl mx-auto px-4 py-8 animate-page-enter">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Vendors</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/ordering/orders"
            className="mr-1 inline-flex min-h-9 items-center rounded-md px-1 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Order History
          </Link>
          <Link
            href="/ordering/orders/create"
            className="rounded-md bg-secondary text-secondary-foreground border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary/80 transition-colors"
          >
            Create Order
          </Link>
          <Link
            href="/ordering/new"
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            + Add Vendor
          </Link>
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm mb-4">No vendors configured yet.</p>
          <Link
            href="/ordering/new"
            className="inline-flex min-h-9 items-center rounded-md px-1 text-sm font-medium text-primary hover:bg-primary/10"
          >
            Add your first vendor →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {vendors.map((v) => (
            <li key={v.id}>
              <Link
                href={`/ordering/${v.id}`}
                className="block rounded-lg border border-border bg-card text-card-foreground p-4 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground text-sm">{v.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">@{v.telegramUsername} · {v.preferredCurrency}</p>
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
