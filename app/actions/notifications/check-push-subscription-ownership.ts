'use server';

import { auth } from '@/lib/auth';
import { PushSubscriptionRepo } from '@/lib/notifications/infrastructure/PushSubscriptionRepo';

export type PushOwnership = 'self' | 'other' | 'unknown';

export interface CheckPushOwnershipResult {
  ok: boolean;
  ownership?: PushOwnership;
  error?: string;
}

/**
 * Read-only check used by the settings panel on mount: the browser's
 * `pushManager.getSubscription()` returns an origin-scoped subscription,
 * but our backend tracks ownership per-user. On a shared browser the local
 * subscription could belong to a different account — we mustn't show it as
 * "currently subscribed" until we've confirmed ownership server-side.
 */
export async function checkPushSubscriptionOwnershipAction(
  endpoint: string
): Promise<CheckPushOwnershipResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  if (!endpoint) return { ok: false, error: 'invalid_endpoint' };

  const row = await PushSubscriptionRepo.findByEndpoint(endpoint);
  if (!row) return { ok: true, ownership: 'unknown' };
  return { ok: true, ownership: row.userId === session.user.id ? 'self' : 'other' };
}
