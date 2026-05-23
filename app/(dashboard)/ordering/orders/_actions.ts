'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { cancelOrder } from '@/lib/ordering/application/OrderService';

export async function cancelOrderAction(orderId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  await cancelOrder(session.user.id, orderId);
  revalidatePath('/ordering/orders');
}
