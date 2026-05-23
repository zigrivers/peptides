'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { registerPushSubscription } from '@/lib/notifications/application/ReminderService';

export interface RegisterPushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface RegisterPushSubscriptionResult {
  ok: boolean;
  error?: string;
}

export async function registerPushSubscriptionAction(
  input: RegisterPushSubscriptionInput
): Promise<RegisterPushSubscriptionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  try {
    await registerPushSubscription(session.user.id, input);
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    if (msg === 'push_subscription_endpoint_owned_by_another_user') {
      return { ok: false, error: 'endpoint_owned_by_another_user' };
    }
    if (msg.includes('invalid_endpoint') || msg.includes('invalid_p256dh') || msg.includes('invalid_auth')) {
      return { ok: false, error: 'invalid_subscription' };
    }
    return { ok: false, error: 'register_failed' };
  }
}
