import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails, NON_TERMINAL_STATUSES } from '@/lib/ordering/application/OrderService';
import { buildFallbackDeepLink, getSessionStatus } from '@/lib/ordering/application/TelegramAuthService';
import { OrderStatusBadge } from '../../_components/OrderStatusBadge';
import { CancelOrderButton } from '../_components/CancelOrderButton';
import { SendOrderPanel } from './_components/SendOrderPanel';

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;
  const order = await getOrderWithDetails(session.user.id, orderId);

  if (!order) notFound();

  const telegramDeepLink = buildFallbackDeepLink(order.vendor.telegramUsername);
  const { linked } = await getSessionStatus(session.user.id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <div>
        <Link
          href="/ordering/orders"
          className="inline-flex min-h-9 items-center rounded-md px-1 text-sm text-primary hover:bg-primary/10"
        >
          ← Order History
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{order.vendor.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Created {order.createdAt.toLocaleDateString(undefined, { timeZone: 'UTC' })}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {order.status === 'DRAFT' && (
        <SendOrderPanel
          orderId={order.id}
          initialSendMethod={order.sendMethod}
          initialMessageText={order.messageText}
          telegramDeepLink={telegramDeepLink}
          isTelegramLinked={linked}
        />
      )}

      {(order.status === 'SENT' || order.status === 'STALE') && (
        <section className={`rounded-xl border px-5 py-4 ${order.status === 'STALE' ? 'border-warning/20 bg-warning/10 text-warning' : 'border-primary/20 bg-primary/10 text-primary'}`}>
          <p className={`text-sm font-semibold mb-1 ${order.status === 'STALE' ? 'text-warning font-semibold' : 'text-primary font-semibold'}`}>
            {order.status === 'STALE'
              ? 'No vendor reply after 14 days — check Telegram or capture a late reply'
              : 'Sent — waiting for vendor confirmation'}
          </p>
          {order.sentAt && (
            <p className={`text-xs mb-3 ${order.status === 'STALE' ? 'text-warning/80' : 'text-primary/80'}`}>
              Sent on {order.sentAt.toLocaleString(undefined, { timeZone: 'UTC' })}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={telegramDeepLink}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Open vendor chat in Telegram ↗
            </a>
            <Link
              href={`/ordering/orders/${order.id}/payment`}
              className="inline-flex items-center justify-center rounded-md border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
            >
              Capture vendor reply →
            </Link>
          </div>
        </section>
      )}

      {order.status === 'CONFIRMED' && (
        <section className="rounded-xl border border-success/20 bg-success/10 text-success px-5 py-4">
          <p className="text-sm font-semibold text-success mb-1">Vendor quote confirmed</p>
          <Link
            href={`/ordering/orders/${order.id}/confirm`}
            className="inline-flex items-center justify-center rounded-md bg-success text-success-foreground px-4 py-2 text-sm font-medium hover:bg-success/90 transition-colors"
          >
            Review &amp; Mark Payment Sent →
          </Link>
        </section>
      )}

      {order.status === 'PAYMENT_SENT' && (
        <section className="rounded-xl border border-primary/20 bg-primary/10 text-primary px-5 py-4">
          <p className="text-sm font-semibold text-primary mb-3">Payment sent — waiting for delivery</p>
          <Link
            href={`/ordering/orders/${order.id}/receive`}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Mark as Received →
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Items</h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm text-foreground">
              <span>
                {item.compound.name} — {item.form.toLowerCase().replace('_', ' ')} {item.vialSizeMg.toString()}mg
              </span>
              <span className="font-medium text-muted-foreground">× {item.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm space-y-1.5">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Timeline</h2>
        <TimelineRow label="Created" date={order.createdAt} />
        {order.sentAt && <TimelineRow label="Sent" date={order.sentAt} />}
        {order.confirmedAt && <TimelineRow label="Quote confirmed" date={order.confirmedAt} />}
        {order.paymentSentAt && <TimelineRow label="Payment sent" date={order.paymentSentAt} />}
        {order.receivedAt && <TimelineRow label="Received" date={order.receivedAt} />}
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
    <div className="flex justify-between text-sm text-foreground">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{date.toLocaleString(undefined, { timeZone: 'UTC' })}</span>
    </div>
  );
}
