'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Decimal from 'decimal.js';
import { auth } from '@/lib/auth';
import {
  cancelOrder,
  confirmQuote,
  markPaymentSent,
  receiveOrder,
} from '@/lib/ordering/application/OrderService';

export interface ActionResult {
  error: string;
}

export async function cancelOrderAction(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  await cancelOrder(session.user.id, orderId);
  revalidatePath('/ordering/orders', 'layout');
}

// Returns ActionResult on validation error; redirects on success.
export async function confirmQuoteAction(
  orderId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const walletAddress = (formData.get('walletAddress') as string | null)?.trim() ?? '';
  const amountRaw = (formData.get('amount') as string | null)?.trim() ?? '';
  const currency = (formData.get('currency') as string | null)?.trim() ?? '';
  if (!walletAddress || !amountRaw || !currency) {
    return { error: 'All fields are required.' };
  }
  let amount: string;
  try {
    const d = new Decimal(amountRaw);
    if (d.lte(0)) return { error: 'Amount must be greater than zero.' };
    amount = d.toString();
  } catch {
    return { error: 'Amount must be a valid number (e.g. 50.00 or 0.001).' };
  }
  await confirmQuote(session.user.id, orderId, { walletAddress, amount, currency });
  redirect(`/ordering/orders/${orderId}/confirm`);
}

export async function markPaymentSentAction(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  await markPaymentSent(session.user.id, orderId);
  revalidatePath('/ordering/orders', 'layout');
  redirect(`/ordering/orders/${orderId}`);
}

export async function receiveOrderAction(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  await receiveOrder(session.user.id, orderId);
  revalidatePath('/ordering/orders', 'layout');
  redirect(`/ordering/orders/${orderId}`);
}
