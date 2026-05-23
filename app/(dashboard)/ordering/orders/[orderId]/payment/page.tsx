import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails, getPriorWalletAddress } from '@/lib/ordering/application/OrderService';
import { confirmQuoteAction } from '../../_actions';

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function PaymentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;
  const order = await getOrderWithDetails(session.user.id, orderId);
  if (!order) notFound();

  if (order.status !== 'SENT' && order.status !== 'STALE') {
    redirect(`/ordering/orders/${orderId}`);
  }

  const priorWallet = await getPriorWalletAddress(session.user.id, order.vendorId);

  const action = confirmQuoteAction.bind(null, orderId);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href={`/ordering/orders/${orderId}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to order
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Capture Vendor Reply</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter the wallet address and amount from {order.vendor.name}&apos;s Telegram reply.
        </p>
      </div>

      {priorWallet && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">Prior wallet address on file:</p>
          <p className="font-mono break-all">{priorWallet}</p>
          <p className="text-xs mt-1">Verify the current reply matches or update below.</p>
        </div>
      )}

      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-1">
            Wallet Address
          </label>
          <input
            id="walletAddress"
            name="walletAddress"
            type="text"
            required
            placeholder="e.g. TQn9Y2khDD2bHM4dK..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              id="amount"
              name="amount"
              type="text"
              required
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="w-32">
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              defaultValue="USDT"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option>USDT</option>
              <option>BTC</option>
              <option>ETH</option>
              <option>USDC</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Review Payment →
        </button>
      </form>
    </main>
  );
}
