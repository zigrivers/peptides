import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails } from '@/lib/ordering/application/OrderService';
import { receiveOrderAction } from '../../_actions';

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

  const action = receiveOrderAction.bind(null, orderId);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href={`/ordering/orders/${orderId}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to order
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Confirm Receipt</h1>
        <p className="text-sm text-gray-500 mt-1">
          The following items will be added to your inventory as dry vials ready for reconstitution.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Items</h2>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm text-gray-700">
              <span>
                {item.compound.name} — {item.form.toLowerCase().replace('_', ' ')} {item.vialSizeMg.toString()}mg
              </span>
              <span className="font-medium">
                × {item.quantity} vial{item.quantity !== 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-400 mt-3">
          Total: {order.items.reduce((sum, i) => sum + i.quantity, 0)} vials added to inventory
        </p>
      </section>

      <form action={action}>
        <button
          type="submit"
          className="w-full rounded-md bg-green-600 text-white px-4 py-3 text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          Confirm Receipt &amp; Add to Inventory
        </button>
      </form>
    </main>
  );
}
