import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listOrders, NON_TERMINAL_STATUSES } from '@/lib/ordering/application/OrderService';
import { OrderStatusBadge } from '../_components/OrderStatusBadge';
import { CancelOrderButton } from './_components/CancelOrderButton';

export default async function OrderHistoryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const orders = await listOrders(session.user.id);
  const staleOrders = orders.filter((o) => o.status === 'STALE');

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/ordering" className="text-sm text-indigo-600 hover:underline">← Vendors</Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">Order History</h1>
        </div>
      </div>

      {staleOrders.length > 0 && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ {staleOrders.length} order{staleOrders.length > 1 ? 's' : ''} may be stale — check Telegram and update or cancel.
        </div>
      )}

      {orders.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-16">No orders yet.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/ordering/orders/${order.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-600 truncate"
                      >
                        {order.vendorName}
                      </Link>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.itemCount} item{order.itemCount !== 1 ? 's' : ''} ·{' '}
                      {order.createdAt.toLocaleDateString(undefined, { timeZone: 'UTC' })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Link href={`/ordering/orders/${order.id}`} className="text-xs text-indigo-600 hover:underline">
                      View
                    </Link>
                    {(NON_TERMINAL_STATUSES as readonly string[]).includes(order.status) && (
                      <CancelOrderButton orderId={order.id} />
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
