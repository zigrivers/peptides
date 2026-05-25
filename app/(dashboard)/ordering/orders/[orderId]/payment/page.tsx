import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getOrderWithDetails, getPriorWalletAddress } from '@/lib/ordering/application/OrderService';
import { confirmQuoteAction } from '../../_actions';
import { CaptureVendorReplyForm } from './_components/CaptureVendorReplyForm';

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function PaymentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;
  const order = await getOrderWithDetails(session.user.id, orderId);
  if (!order) notFound();

  if (order.status !== 'SENT' && order.status !== 'STALE' && order.status !== 'CONFIRMED') {
    redirect(`/ordering/orders/${orderId}`);
  }

  const existingConf =
    order.status === 'CONFIRMED'
      ? (order.paymentConfirmation as { walletAddress: string; amount: string; currency: string } | null)
      : null;

  // When re-editing a CONFIRMED order, exclude it from prior-wallet lookup to avoid self-match
  const priorWallet = await getPriorWalletAddress(
    session.user.id,
    order.vendorId,
    order.status === 'CONFIRMED' ? orderId : undefined
  );

  const boundAction = confirmQuoteAction.bind(null, orderId);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <div>
        <Link href={`/ordering/orders/${orderId}`} className="text-sm text-primary hover:underline">
          ← Back to order
        </Link>
        <h1 className="text-2xl font-semibold text-foreground mt-2">Capture Vendor Reply</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the wallet address and amount from {order.vendor.name}&apos;s Telegram reply.
        </p>
      </div>

      {priorWallet && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p className="font-semibold mb-1 text-warning">Prior wallet address on file:</p>
          <p className="font-mono break-all text-warning">{priorWallet}</p>
          <p className="text-xs mt-1 text-warning/80">Verify the current reply matches or update below.</p>
        </div>
      )}

      <CaptureVendorReplyForm action={boundAction} defaultValues={existingConf ?? undefined} />
    </main>
  );
}
