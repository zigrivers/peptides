import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';

interface Props {
  params: Promise<{ orderId: string }>;
}

// Payment confirmation safety gate — implemented in Task 3.5
export default async function PaymentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orderId } = await params;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/ordering/orders/${orderId}`} className="text-sm text-indigo-600 hover:underline">
        ← Back to order
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mt-2">Confirm Vendor Quote</h1>
      <p className="text-gray-500 text-sm mt-2">Payment confirmation coming in Task 3.5.</p>
    </main>
  );
}
