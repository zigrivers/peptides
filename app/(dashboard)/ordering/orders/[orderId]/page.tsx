import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails, NON_TERMINAL_STATUSES } from '@/lib/ordering/application/OrderService';
import { OrderStatusBadge } from '../../_components/OrderStatusBadge';
import { CancelOrderButton } from '../_components/CancelOrderButton';

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;
  const order = await getOrderWithDetails(session.user.id, orderId);

  if (!order) notFound();

  const telegramDeepLink = `tg://resolve?domain=${order.vendor.telegramUsername}`;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/ordering/orders" className="text-sm text-indigo-600 hover:underline">
          ← Order History
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{order.vendor.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Created {order.createdAt.toLocaleDateString(undefined, { timeZone: 'UTC' })}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {order.status === 'SENT' && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
          <p className="text-sm font-semibold text-blue-800 mb-1">
            Sent — waiting for vendor confirmation
          </p>
          {order.sentAt && (
            <p className="text-xs text-blue-600 mb-3">
              Sent on {order.sentAt.toLocaleString(undefined, { timeZone: 'UTC' })}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={telegramDeepLink}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Open vendor chat in Telegram ↗
            </a>
            <Link
              href={`/ordering/orders/${order.id}/payment`}
              className="inline-flex items-center justify-center rounded-md border border-blue-600 text-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Capture vendor reply →
            </Link>
          </div>
        </section>
      )}

      {order.status === 'STALE' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ This order is stale — no vendor reply received within 14 days. Check Telegram and update or cancel.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Items</h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm text-gray-700">
              <span>
                {item.compound.name} — {item.form.toLowerCase().replace('_', ' ')} {item.vialSizeMg.toString()}mg
              </span>
              <span className="font-medium">× {item.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm space-y-1.5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Timeline</h2>
        <TimelineRow label="Created" date={order.createdAt} />
        {order.sentAt && <TimelineRow label="Sent" date={order.sentAt} />}
        {order.staleFlaggedAt && <TimelineRow label="Flagged stale" date={order.staleFlaggedAt} />}
        {order.cancelledAt && <TimelineRow label="Cancelled" date={order.cancelledAt} />}
      </section>

      {(NON_TERMINAL_STATUSES as readonly string[]).includes(order.status) && (
        <div className="flex justify-end">
          <CancelOrderButton orderId={order.id} />
        </div>
      )}
    </main>
  );
}

function TimelineRow({ label, date }: { label: string; date: Date }) {
  return (
    <div className="flex justify-between text-sm text-gray-600">
      <span className="text-gray-500">{label}</span>
      <span>{date.toLocaleString(undefined, { timeZone: 'UTC' })}</span>
    </div>
  );
}
