import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails, getPriorWalletAddress } from '@/lib/ordering/application/OrderService';
import { MarkPaymentSentButton } from './_components/MarkPaymentSentButton';
import { CopyAddressButton } from './_components/CopyAddressButton';

interface Props {
  params: Promise<{ orderId: string }>;
}

function chunkAddress(address: string, chunkSize = 4): string {
  return address.replace(/\S{1,4}/g, (m) => m).match(/.{1,4}/g)?.join(' ') ?? address;
}

export default async function ConfirmPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;
  const order = await getOrderWithDetails(session.user.id, orderId);
  if (!order) notFound();

  if (order.status !== 'CONFIRMED') {
    redirect(`/ordering/orders/${orderId}`);
  }

  const conf = order.paymentConfirmation as { walletAddress: string; amount: string; currency: string } | null;
  if (!conf) redirect(`/ordering/orders/${orderId}/payment`);

  const priorWallet = await getPriorWalletAddress(session.user.id, order.vendorId);
  const hasPrior = !!priorWallet && priorWallet !== conf.walletAddress;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href={`/ordering/orders/${orderId}/payment`} className="text-sm text-indigo-600 hover:underline">
          ← Edit vendor reply
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Verify Payment Details</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review carefully — crypto payments are irreversible.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</p>
        <p className="text-2xl font-bold text-gray-900 font-mono">
          {conf.amount} <span className="text-base font-semibold text-gray-500">{conf.currency}</span>
        </p>

        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3">Wallet Address</p>
        <p className="font-mono text-sm text-gray-900 break-all tracking-wide leading-relaxed">
          {chunkAddress(conf.walletAddress)}
        </p>

        <div className="flex gap-2 pt-1">
          <CopyAddressButton address={conf.walletAddress} />
        </div>
      </section>

      {hasPrior && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Previous wallet address for {order.vendor.name}:</p>
          <p className="font-mono text-xs text-amber-700 break-all">{chunkAddress(priorWallet!)}</p>
          <p className="text-xs text-amber-600">The address above differs from the prior order. Verify with the vendor&apos;s current Telegram reply.</p>
        </section>
      )}

      <MarkPaymentSentButton orderId={orderId} hasPriorDiff={hasPrior} />
    </main>
  );
}
