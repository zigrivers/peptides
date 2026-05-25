'use server';

import { auth } from '@/lib/auth';
import { withAudit } from '@/lib/audit/application/withAudit';
import { createRateLimiter } from '@/lib/shared/rateLimiter';
import { PushSubscriptionRepo } from '@/lib/notifications/infrastructure/PushSubscriptionRepo';
import { sendWebPush } from '@/lib/notifications/infrastructure/webPush';

// 5 test notifications per user per 10 minutes.
const testPushLimiter = createRateLimiter(5, 10 * 60 * 1000);

export interface SendTestPushResult {
  ok: boolean;
  error?: string;
  sentCount?: number;
}

export async function sendTestPushAction(): Promise<SendTestPushResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized' };
  }

  const userId = session.user.id;

  // Rate Limiting
  if (!testPushLimiter.check(userId)) {
    return { ok: false, error: 'rate_limited' };
  }

  try {
    const subscriptions = await PushSubscriptionRepo.listByUser(userId);
    if (subscriptions.length === 0) {
      return { ok: false, error: 'no_subscriptions' };
    }

    const testPayload = {
      title: 'Test Notification',
      body: 'Your push notification subscription is working correctly!',
      tag: 'test-notification',
    };

    let sentCount = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const result = await sendWebPush(sub, testPayload);
      if (result.ok) {
        sentCount += 1;
      } else if (result.expired) {
        expiredEndpoints.push(sub.endpoint);
      }
    }

    // Batch prune expired push subscriptions
    if (expiredEndpoints.length > 0) {
      await withAudit(
        (tx) =>
          tx.pushSubscription.deleteMany({
            where: {
              userId,
              endpoint: { in: expiredEndpoints },
            },
          }),
        (result) => ({
          actorUserId: userId,
          subjectUserId: userId,
          category: 'Notification',
          action: 'PUSH_SUBSCRIPTION_PRUNED',
          resourceId: userId,
          resourceType: 'PushSubscription',
          metadata: { expiredEndpoints, count: result.count },
        })
      );
    }

    // Log successful test push sent audit event
    if (sentCount > 0) {
      await withAudit(
        async () => {
          return { sentCount };
        },
        () => ({
          actorUserId: userId,
          subjectUserId: userId,
          category: 'Notification',
          action: 'TEST_PUSH_SENT',
          resourceId: userId,
          resourceType: 'PushSubscription',
          metadata: { sentCount },
        })
      );
    }

    if (sentCount === 0) {
      return { ok: false, error: 'send_failed' };
    }

    return { ok: true, sentCount };
  } catch (err) {
    console.error('[sendTestPushAction] Error sending test push:', err);
    return { ok: false, error: 'system_error' };
  }
}
