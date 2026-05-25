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
  return address.match(new RegExp(`.{1,${chunkSize}}`, 'g'))?.join(' ') ?? address;
}

function isPaymentConf(v: unknown): v is { walletAddress: string; amount: string; currency: string } {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Record<string, unknown>).walletAddress === 'string' &&
    typeof (v as Record<string, unknown>).amount === 'string' &&
    typeof (v as Record<string, unknown>).currency === 'string'
  );
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

  const conf = isPaymentConf(order.paymentConfirmation) ? order.paymentConfirmation : null;
  if (!conf) redirect(`/ordering/orders/${orderId}/payment`);

  const priorWallet = await getPriorWalletAddress(session.user.id, order.vendorId, orderId);
  const hasPrior = !!priorWallet && priorWallet !== conf.walletAddress;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <div>
        <Link href={`/ordering/orders/${orderId}/payment`} className="text-sm text-primary hover:underline">
          ← Edit vendor reply
        </Link>
        <h1 className="text-2xl font-semibold text-foreground mt-2">Verify Payment Details</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review carefully — crypto payments are irreversible.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card text-card-foreground px-5 py-4 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</p>
        <p className="text-2xl font-bold text-foreground font-mono">
          {conf.amount} <span className="text-base font-semibold text-muted-foreground">{conf.currency}</span>
        </p>

        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3">Wallet Address</p>
        <p className="font-mono text-sm text-foreground break-all tracking-wide leading-relaxed">
          {chunkAddress(conf.walletAddress)}
        </p>

        <div className="flex gap-2 pt-1">
          <CopyAddressButton address={conf.walletAddress} />
        </div>
      </section>

      {hasPrior && (
        <section className="rounded-xl border border-warning/30 bg-warning/10 text-warning px-5 py-4 space-y-2">
          <p className="text-sm font-semibold text-warning">Previous wallet address for {order.vendor.name}:</p>
          <p className="font-mono text-xs text-warning break-all">{chunkAddress(priorWallet!)}</p>
          <p className="text-xs text-warning/80">The address above differs from the prior order. Verify with the vendor&apos;s current Telegram reply.</p>
        </section>
      )}

      <MarkPaymentSentButton orderId={orderId} hasPriorDiff={hasPrior} />
    </main>
  );
}
