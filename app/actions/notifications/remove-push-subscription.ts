'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { removePushSubscription } from '@/lib/notifications/application/ReminderService';

export interface RemovePushSubscriptionResult {
  ok: boolean;
  removed?: boolean;
  error?: string;
}

export async function removePushSubscriptionAction(endpoint: string): Promise<RemovePushSubscriptionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  try {
    const result = await removePushSubscription(session.user.id, endpoint);
    revalidatePath('/settings');
    return { ok: true, removed: result.removed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    if (msg === 'invalid_endpoint') return { ok: false, error: 'invalid_endpoint' };
    return { ok: false, error: 'remove_failed' };
  }
}
