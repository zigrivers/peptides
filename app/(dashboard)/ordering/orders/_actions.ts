'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import {
  cancelOrder,
  confirmQuote,
  markPaymentSent,
  receiveOrder,
} from '@/lib/ordering/application/OrderService';

export async function cancelOrderAction(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  await cancelOrder(session.user.id, orderId);
  revalidatePath('/ordering/orders', 'layout');
}

export async function confirmQuoteAction(orderId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  const walletAddress = (formData.get('walletAddress') as string | null)?.trim() ?? '';
  const amount = (formData.get('amount') as string | null)?.trim() ?? '';
  const currency = (formData.get('currency') as string | null)?.trim() ?? '';
  if (!walletAddress || !amount || !currency) throw new Error('missing_fields');
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
