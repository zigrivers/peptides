import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails } from '@/lib/ordering/application/OrderService';
import { receiveOrderAction } from '../../_actions';
import { ReceiveOrderForm } from './_components/ReceiveOrderForm';

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function ReceivePage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;
  const order = await getOrderWithDetails(session.user.id, orderId);
  if (!order) notFound();

  if (order.status !== 'PAYMENT_SENT') {
    redirect(`/ordering/orders/${orderId}`);
  }

  const boundAction = receiveOrderAction.bind(null, orderId);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <div>
        <Link href={`/ordering/orders/${orderId}`} className="text-sm text-primary hover:underline">
          ← Back to order
        </Link>
        <h1 className="text-2xl font-semibold text-foreground mt-2">Confirm Receipt</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm you have received the following items. Pre-mixed solutions are added directly to your
          active inventory. Powder items should be reconstituted in the tracker before tracking doses.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Items</h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm text-foreground">
              <span>
                {item.compound.name} — {item.form.toLowerCase().replace('_', ' ')} {item.vialSizeMg.toString()}mg
              </span>
              <span className="font-medium text-muted-foreground">
                × {item.quantity} vial{item.quantity !== 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground/80 mt-3">
          Total: {order.items.reduce((sum, i) => sum + i.quantity, 0)} vials
        </p>
      </section>

      <ReceiveOrderForm action={boundAction} />
    </main>
  );
}
